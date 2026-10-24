-- =============================================================================
-- Vienna Gift – Iteration 2: Story-Fortschritt, Admin-Dashboard, Live-Nachrichten,
-- private Familien-Assets (alte Fotos, Video, Sprachnachrichten), Gerätestatus, Realtime.
--
-- Voraussetzung: 20261024000000_vienna_gift.sql. Idempotent.
--
-- Admin-Modell:
--   * Admin = per E-Mail angemeldeter Supabase-User (Magic Link / Code), dessen E-Mail in
--     private.admins steht. Kein Passwort im Frontend, kein Service-Role-Key im Browser.
--   * Anonyme Sessions (Eltern) haben keine E-Mail und können nie Admin sein.
--   * Admin liest per RLS-SELECT-Policies (nötig für Realtime) und schreibt nur über
--     SECURITY-DEFINER-Funktionen mit is_admin()-Prüfung.
--
-- Nach dem Ausführen:  insert into private.admins (email) values ('deine@mail.de');
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema-Erweiterungen
-- -----------------------------------------------------------------------------

alter table public.trips add column if not exists seen text[] not null default '{}';

alter table public.trip_members add column if not exists last_seen_at timestamptz;
alter table public.trip_members add column if not exists device text;

-- Neue Kapitelreihenfolge (Wien statt Pause) und flexible Fragen.
alter table public.uploads drop constraint if exists uploads_chapter_id_check;
alter table public.uploads add constraint uploads_chapter_id_check
  check (chapter_id in ('morning', 'mission', 'vienna', 'tennis', 'spa', 'dinner', 'pause'));

alter table public.responses drop constraint if exists responses_question_id_check;
alter table public.responses add constraint responses_question_id_check
  check (question_id ~ '^[a-z]+(\.[a-zA-Z]+){1,3}$' and char_length(question_id) <= 64);

create or replace function private.chapter_order()
returns text[]
language sql immutable
set search_path = ''
as $$ select array['morning', 'mission', 'vienna', 'tennis', 'spa', 'dinner']::text[] $$;

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  heart      boolean not null default false,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists messages_trip_idx on public.messages (trip_id, created_at);

create table if not exists public.trip_assets (
  trip_id      uuid not null references public.trips (id) on delete cascade,
  slot         text not null check (slot in (
                 'gradskiKlub', 'wedding', 'familyEarly', 'familyCurrent', 'parentsNow',
                 'familyVideo', 'familyVideoPoster', 'audioDjordje', 'audioBogdana', 'audioLazar')),
  storage_path text not null,
  mime         text,
  updated_at   timestamptz not null default now(),
  primary key (trip_id, slot)
);

create table if not exists private.admins (
  email text primary key check (email = lower(email))
);

alter table public.messages    enable row level security;
alter table public.trip_assets enable row level security;
revoke all on public.messages, public.trip_assets from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Admin-Prüfung
-- -----------------------------------------------------------------------------

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and exists (
       select 1 from private.admins a
       where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
     )
$$;

create or replace function private.assert_admin()
returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.touch_member(p_trip_id uuid)
returns void
language sql volatile security definer
set search_path = ''
as $$
  update public.trip_members set last_seen_at = now()
  where trip_id = p_trip_id and user_id = auth.uid()
$$;

grant execute on function private.is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- Snapshot (für die Eltern-App)
-- -----------------------------------------------------------------------------

create or replace function private.trip_snapshot(p_trip_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'trip_id',         t.id,
    'phase',           t.phase,
    'completed',       to_jsonb(t.completed_chapters),
    'seen',            to_jsonb(t.seen),
    'current_chapter', t.current_chapter,
    'language',        t.language,
    'started_at',      t.started_at,
    'finished_at',     t.finished_at,
    'updated_at',      t.updated_at,
    'uploads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'chapter_id', u.chapter_id, 'path', u.storage_path,
        'captured_at', u.captured_at, 'uploaded_at', u.uploaded_at))
      from public.uploads u where u.trip_id = t.id), '[]'::jsonb),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_id', r.question_id, 'value', r.value, 'updated_at', r.updated_at))
      from public.responses r where r.trip_id = t.id), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'body', m.body, 'heart', m.heart,
        'created_at', m.created_at, 'read_at', m.read_at) order by m.created_at)
      from public.messages m where m.trip_id = t.id), '[]'::jsonb),
    'assets', coalesce((
      select jsonb_agg(jsonb_build_object('slot', a.slot, 'path', a.storage_path, 'mime', a.mime))
      from public.trip_assets a where a.trip_id = t.id), '[]'::jsonb)
  )
  from public.trips t
  where t.id = p_trip_id
$$;

-- -----------------------------------------------------------------------------
-- Eltern-RPCs (neue Signaturen)
-- -----------------------------------------------------------------------------

drop function if exists public.join_trip(text);
create or replace function public.join_trip(p_token text, p_device text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) < 24 or char_length(p_token) > 128 then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;

  select t.id into v_trip_id from public.trips t where t.token_hash = private.hash_token(p_token);
  if v_trip_id is null then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;

  insert into public.trip_members (trip_id, user_id, device, last_seen_at)
  values (v_trip_id, auth.uid(), left(p_device, 80), now())
  on conflict (trip_id, user_id) do update
    set last_seen_at = now(), device = coalesce(left(excluded.device, 80), public.trip_members.device);

  return private.trip_snapshot(v_trip_id);
end;
$$;

drop function if exists public.save_progress(uuid, text, text[], timestamptz, timestamptz, text);
create or replace function public.save_progress(
  p_trip_id     uuid,
  p_phase       text,
  p_completed   text[],
  p_seen        text[],
  p_started_at  timestamptz,
  p_finished_at timestamptz,
  p_language    text
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_trip      public.trips%rowtype;
  v_completed text[];
  v_seen      text[];
begin
  perform private.assert_member(p_trip_id);
  perform private.touch_member(p_trip_id);

  select * into v_trip from public.trips where id = p_trip_id for update;

  select coalesce(array_agg(c order by ord), '{}')
    into v_completed
    from unnest(private.chapter_order()) with ordinality as x(c, ord)
   where c = any (v_trip.completed_chapters || coalesce(p_completed, '{}'));

  select coalesce(array_agg(distinct k order by k), '{}')
    into v_seen
    from unnest(v_trip.seen || coalesce(p_seen, '{}')) as k
   where k ~ '^[a-z]+:[A-Za-z]+$' and char_length(k) <= 64;

  update public.trips set
    completed_chapters = v_completed,
    seen               = v_seen,
    current_chapter    = cardinality(v_completed),
    phase = case
      when cardinality(v_completed) = cardinality(private.chapter_order()) then 'finale'
      when private.phase_rank(p_phase) > private.phase_rank(v_trip.phase) then p_phase
      else v_trip.phase
    end,
    started_at  = least(v_trip.started_at, p_started_at),
    finished_at = least(v_trip.finished_at, p_finished_at),
    language    = case when p_language in ('sr', 'de') then p_language else v_trip.language end,
    updated_at  = now()
  where id = p_trip_id;

  return private.trip_snapshot(p_trip_id);
end;
$$;

create or replace function public.mark_message_read(p_trip_id uuid, p_message_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform private.assert_member(p_trip_id);
  update public.messages set read_at = coalesce(read_at, now())
  where id = p_message_id and trip_id = p_trip_id;
end;
$$;

-- reset_trip: zusätzlich Story-Fortschritt und Nachrichten. Familien-Assets bleiben erhalten.
create or replace function public.reset_trip(p_trip_id uuid)
returns text[]
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_paths text[];
begin
  perform private.assert_member(p_trip_id);

  select coalesce(array_agg(storage_path), '{}') into v_paths
    from public.uploads where trip_id = p_trip_id;

  delete from public.uploads   where trip_id = p_trip_id;
  delete from public.responses where trip_id = p_trip_id;
  delete from public.messages  where trip_id = p_trip_id;

  update public.trips set
    phase = 'opening', completed_chapters = '{}', seen = '{}', current_chapter = 0,
    started_at = null, finished_at = null, updated_at = now()
  where id = p_trip_id;

  return v_paths;
end;
$$;

create or replace function public.admin_reset_trip(p_token text)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.trips where token_hash = private.hash_token(p_token);
  if v_id is null then
    raise exception 'trip not found';
  end if;
  delete from public.uploads      where trip_id = v_id;
  delete from public.responses    where trip_id = v_id;
  delete from public.messages     where trip_id = v_id;
  delete from public.trip_members where trip_id = v_id;
  update public.trips set
    phase = 'opening', completed_chapters = '{}', seen = '{}', current_chapter = 0,
    started_at = null, finished_at = null, updated_at = now()
  where id = v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin-RPCs
-- -----------------------------------------------------------------------------

create or replace function public.admin_whoami()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('email', auth.jwt() ->> 'email', 'is_admin', private.is_admin())
$$;

create or replace function public.admin_overview()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform private.assert_admin();
  return coalesce((
    select jsonb_agg(
      private.trip_snapshot(t.id) || jsonb_build_object(
        'label', t.label,
        'created_at', t.created_at,
        'members', coalesce((
          select jsonb_agg(jsonb_build_object(
            'device', m.device, 'joined_at', m.joined_at, 'last_seen_at', m.last_seen_at)
            order by m.last_seen_at desc nulls last)
          from public.trip_members m where m.trip_id = t.id), '[]'::jsonb),
        'uploads_detail', coalesce((
          select jsonb_agg(jsonb_build_object(
            'chapter_id', u.chapter_id, 'path', u.storage_path,
            'captured_at', u.captured_at, 'uploaded_at', u.uploaded_at) order by u.uploaded_at)
          from public.uploads u where u.trip_id = t.id), '[]'::jsonb)
      ) order by t.created_at)
    from public.trips t), '[]'::jsonb);
end;
$$;

create or replace function public.admin_send_message(p_trip_id uuid, p_body text, p_heart boolean default false)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.assert_admin();
  insert into public.messages (trip_id, body, heart)
  values (p_trip_id, left(trim(p_body), 500), coalesce(p_heart, false))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_delete_message(p_message_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform private.assert_admin();
  delete from public.messages where id = p_message_id;
end;
$$;

-- Registriert ein im Bucket `family` hochgeladenes Asset. Gibt den ersetzten Pfad zurück.
create or replace function public.admin_set_asset(p_trip_id uuid, p_slot text, p_path text, p_mime text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_previous text;
begin
  perform private.assert_admin();
  if p_path is null or position((p_trip_id::text || '/') in p_path) <> 1 then
    raise exception 'invalid_path' using errcode = '22023';
  end if;
  select storage_path into v_previous from public.trip_assets where trip_id = p_trip_id and slot = p_slot;
  insert into public.trip_assets (trip_id, slot, storage_path, mime, updated_at)
  values (p_trip_id, p_slot, p_path, p_mime, now())
  on conflict (trip_id, slot) do update
    set storage_path = excluded.storage_path, mime = excluded.mime, updated_at = now();
  return v_previous;
end;
$$;

create or replace function public.admin_remove_asset(p_trip_id uuid, p_slot text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_previous text;
begin
  perform private.assert_admin();
  delete from public.trip_assets where trip_id = p_trip_id and slot = p_slot
  returning storage_path into v_previous;
  return v_previous;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rechte
-- -----------------------------------------------------------------------------

revoke execute on function public.join_trip(text, text)                                                    from public, anon;
revoke execute on function public.save_progress(uuid, text, text[], text[], timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.mark_message_read(uuid, uuid)                                            from public, anon;
revoke execute on function public.admin_whoami()                                                           from public, anon;
revoke execute on function public.admin_overview()                                                         from public, anon;
revoke execute on function public.admin_send_message(uuid, text, boolean)                                  from public, anon;
revoke execute on function public.admin_delete_message(uuid)                                               from public, anon;
revoke execute on function public.admin_set_asset(uuid, text, text, text)                                  from public, anon;
revoke execute on function public.admin_remove_asset(uuid, text)                                           from public, anon;

grant execute on function public.join_trip(text, text)                                                    to authenticated;
grant execute on function public.save_progress(uuid, text, text[], text[], timestamptz, timestamptz, text) to authenticated;
grant execute on function public.mark_message_read(uuid, uuid)                                            to authenticated;
grant execute on function public.admin_whoami()                                                           to authenticated;
grant execute on function public.admin_overview()                                                         to authenticated;
grant execute on function public.admin_send_message(uuid, text, boolean)                                  to authenticated;
grant execute on function public.admin_delete_message(uuid)                                               to authenticated;
grant execute on function public.admin_set_asset(uuid, text, text, text)                                  to authenticated;
grant execute on function public.admin_remove_asset(uuid, text)                                           to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_trip_member_folder(text) to authenticated;
grant execute on function private.is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- RLS-Leserechte NUR für Admins (Grundlage für Supabase Realtime im Dashboard).
-- Eltern-Sessions erfüllen die Policy nie und sehen über diese Wege nichts.
-- -----------------------------------------------------------------------------

grant select on public.trips, public.trip_members, public.uploads, public.responses, public.messages
  to authenticated;
-- token_hash bleibt auch für Admins unsichtbar
revoke select on public.trips from authenticated;
grant select (id, label, phase, current_chapter, completed_chapters, seen, language,
              started_at, finished_at, created_at, updated_at) on public.trips to authenticated;

drop policy if exists "admin read trips"     on public.trips;
drop policy if exists "admin read members"   on public.trip_members;
drop policy if exists "admin read uploads"   on public.uploads;
drop policy if exists "admin read responses" on public.responses;
drop policy if exists "admin read messages"  on public.messages;

create policy "admin read trips"     on public.trips        for select to authenticated using (private.is_admin());
create policy "admin read members"   on public.trip_members for select to authenticated using (private.is_admin());
create policy "admin read uploads"   on public.uploads      for select to authenticated using (private.is_admin());
create policy "admin read responses" on public.responses    for select to authenticated using (private.is_admin());
create policy "admin read messages"  on public.messages     for select to authenticated using (private.is_admin());

-- Realtime: Änderungen an diesen Tabellen an das Dashboard streamen (falls Publication existiert).
do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['trips', 'trip_members', 'uploads', 'responses', 'messages'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Storage: privater Bucket `family` (alte Fotos, Video, Audios)
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family', 'family', false, null, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/webm',
  'text/vtt'])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "family: members and admins read" on storage.objects;
drop policy if exists "family: admins insert"          on storage.objects;
drop policy if exists "family: admins update"          on storage.objects;
drop policy if exists "family: admins delete"          on storage.objects;
drop policy if exists "memories: admins read"          on storage.objects;
drop policy if exists "memories: admins delete"        on storage.objects;

create policy "family: members and admins read" on storage.objects
  for select to authenticated
  using (bucket_id = 'family'
         and (private.is_admin() or private.is_trip_member_folder((storage.foldername(name))[1])));

create policy "family: admins insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'family' and private.is_admin());

create policy "family: admins update" on storage.objects
  for update to authenticated
  using (bucket_id = 'family' and private.is_admin());

create policy "family: admins delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'family' and private.is_admin());

create policy "memories: admins read" on storage.objects
  for select to authenticated
  using (bucket_id = 'memories' and private.is_admin());

create policy "memories: admins delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'memories' and private.is_admin());
