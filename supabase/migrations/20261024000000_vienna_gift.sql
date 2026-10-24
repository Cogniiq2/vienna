-- =============================================================================
-- Vienna Gift – Datenbank, RPC-Funktionen, Storage & Sicherheitsregeln
--
-- Sicherheitsmodell (kein Login für die Eltern):
--   * Jedes Gerät erhält automatisch eine ANONYME Supabase-Session
--     (Dashboard → Authentication → Sign In / Providers → "Allow anonymous sign-ins").
--   * Der geheime Trip-Link (/trip/<token>) wird über join_trip(token) eingelöst.
--     Der Token selbst wird nie gespeichert, nur sein SHA-256-Hash.
--   * Tabellen sind für Clients komplett gesperrt (RLS ohne Policies + keine Grants).
--     Alle Lese-/Schreibzugriffe laufen über SECURITY-DEFINER-Funktionen mit Mitgliedschaftsprüfung.
--   * Fotos liegen in einem PRIVATEN Bucket. Storage-Policies erlauben Zugriff nur auf den
--     Ordner <trip_id>/ und nur für Mitglieder dieses Trips. Kein öffentliches Listing.
--   * Kein Service-Role-Key im Browser.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- -----------------------------------------------------------------------------
-- Tabellen
-- -----------------------------------------------------------------------------

create table if not exists public.trips (
  id                 uuid primary key default gen_random_uuid(),
  token_hash         text not null unique,
  label              text,
  phase              text not null default 'opening'
                     check (phase in ('opening', 'intro', 'journey', 'finale')),
  current_chapter    smallint not null default 0,
  completed_chapters text[] not null default '{}',
  language           text not null default 'sr' check (language in ('sr', 'de')),
  started_at         timestamptz,
  finished_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.trip_members (
  trip_id   uuid not null references public.trips (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index if not exists trip_members_user_idx on public.trip_members (user_id);

create table if not exists public.uploads (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  chapter_id   text not null
               check (chapter_id in ('morning', 'mission', 'tennis', 'pause', 'spa', 'dinner')),
  storage_path text not null,
  captured_at  timestamptz not null,
  uploaded_at  timestamptz not null default now(),
  unique (trip_id, chapter_id)
);

create table if not exists public.responses (
  trip_id     uuid not null references public.trips (id) on delete cascade,
  question_id text not null
              check (question_id in ('tennis.winner.mother', 'tennis.winner.father', 'dinner.moment')),
  value       text not null check (char_length(value) <= 2000),
  updated_at  timestamptz not null default now(),
  primary key (trip_id, question_id)
);

alter table public.trips        enable row level security;
alter table public.trip_members enable row level security;
alter table public.uploads      enable row level security;
alter table public.responses    enable row level security;

-- Keine direkten Tabellenzugriffe für Clients.
revoke all on public.trips, public.trip_members, public.uploads, public.responses from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Interne Hilfsfunktionen (Schema "private" ist nicht über die API erreichbar)
-- -----------------------------------------------------------------------------

create or replace function private.chapter_order()
returns text[]
language sql immutable
set search_path = ''
as $$ select array['morning', 'mission', 'tennis', 'pause', 'spa', 'dinner']::text[] $$;

create or replace function private.phase_rank(p_phase text)
returns int
language sql immutable
set search_path = ''
as $$ select coalesce(array_position(array['opening', 'intro', 'journey', 'finale']::text[], p_phase), 0) $$;

create or replace function private.hash_token(p_token text)
returns text
language sql immutable
set search_path = ''
as $$ select encode(extensions.digest(p_token, 'sha256'), 'hex') $$;

create or replace function private.is_trip_member(p_trip_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id = auth.uid()
  )
$$;

-- Für Storage-Policies: Ordnername (Text) statt uuid, damit ungültige Pfade nicht zu Cast-Fehlern führen.
create or replace function private.is_trip_member_folder(p_folder text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id::text = p_folder and m.user_id = auth.uid()
  )
$$;

create or replace function private.assert_member(p_trip_id uuid)
returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_trip_member(p_trip_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.trip_snapshot(p_trip_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'trip_id',         t.id,
    'phase',           t.phase,
    'completed',       to_jsonb(t.completed_chapters),
    'current_chapter', t.current_chapter,
    'language',        t.language,
    'started_at',      t.started_at,
    'finished_at',     t.finished_at,
    'updated_at',      t.updated_at,
    'uploads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'chapter_id',  u.chapter_id,
        'path',        u.storage_path,
        'captured_at', u.captured_at,
        'uploaded_at', u.uploaded_at))
      from public.uploads u where u.trip_id = t.id), '[]'::jsonb),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_id', r.question_id,
        'value',       r.value,
        'updated_at',  r.updated_at))
      from public.responses r where r.trip_id = t.id), '[]'::jsonb)
  )
  from public.trips t
  where t.id = p_trip_id
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_trip_member_folder(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Öffentliche RPC-Funktionen (für angemeldete – auch anonyme – Sessions)
-- -----------------------------------------------------------------------------

-- Löst den Trip-Link ein und liefert den kompletten Zustand.
create or replace function public.join_trip(p_token text)
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

  insert into public.trip_members (trip_id, user_id)
  values (v_trip_id, auth.uid())
  on conflict do nothing;

  return private.trip_snapshot(v_trip_id);
end;
$$;

-- Monotones Zusammenführen: Kapitel werden nur ergänzt, Phasen gehen nur vorwärts.
create or replace function public.save_progress(
  p_trip_id     uuid,
  p_phase       text,
  p_completed   text[],
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
begin
  perform private.assert_member(p_trip_id);

  select * into v_trip from public.trips where id = p_trip_id for update;

  select coalesce(array_agg(c order by ord), '{}')
    into v_completed
    from unnest(private.chapter_order()) with ordinality as x(c, ord)
   where c = any (v_trip.completed_chapters || coalesce(p_completed, '{}'));

  update public.trips set
    completed_chapters = v_completed,
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

create or replace function public.save_response(
  p_trip_id     uuid,
  p_question_id text,
  p_value       text,
  p_updated_at  timestamptz
)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform private.assert_member(p_trip_id);

  insert into public.responses (trip_id, question_id, value, updated_at)
  values (p_trip_id, p_question_id, left(coalesce(p_value, ''), 2000), coalesce(p_updated_at, now()))
  on conflict (trip_id, question_id) do update
    set value = excluded.value, updated_at = excluded.updated_at
    where public.responses.updated_at <= excluded.updated_at;
end;
$$;

-- Registriert ein hochgeladenes Foto. Gibt den Pfad des ersetzten Fotos zurück (oder null).
create or replace function public.record_upload(
  p_trip_id     uuid,
  p_chapter_id  text,
  p_path        text,
  p_captured_at timestamptz
)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_previous text;
begin
  perform private.assert_member(p_trip_id);

  if p_path is null or position((p_trip_id::text || '/') in p_path) <> 1 then
    raise exception 'invalid_path' using errcode = '22023';
  end if;

  select storage_path into v_previous
    from public.uploads where trip_id = p_trip_id and chapter_id = p_chapter_id;

  insert into public.uploads (trip_id, chapter_id, storage_path, captured_at, uploaded_at)
  values (p_trip_id, p_chapter_id, p_path, coalesce(p_captured_at, now()), now())
  on conflict (trip_id, chapter_id) do update
    set storage_path = excluded.storage_path,
        captured_at  = excluded.captured_at,
        uploaded_at  = excluded.uploaded_at;

  return v_previous;
end;
$$;

-- Setzt Fortschritt, Antworten und Upload-Einträge zurück (Debug / vor dem echten Tag).
-- Gibt die Storage-Pfade zurück, damit der Client die Dateien über die Storage-API löschen kann.
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

  update public.trips set
    phase = 'opening', completed_chapters = '{}', current_chapter = 0,
    started_at = null, finished_at = null, updated_at = now()
  where id = p_trip_id;

  return v_paths;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin-Funktionen (NUR im SQL-Editor / mit Service-Role nutzbar)
-- -----------------------------------------------------------------------------

create or replace function public.create_trip(p_token text, p_label text default null)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{24,128}$' then
    raise exception 'token must be 24-128 chars of [A-Za-z0-9_-]';
  end if;
  insert into public.trips (token_hash, label)
  values (private.hash_token(p_token), p_label)
  returning id into v_id;
  return v_id;
end;
$$;

-- Setzt einen Trip per Token zurück (Fortschritt, Antworten, Upload-Einträge, Gerätezuordnungen).
-- Die Foto-DATEIEN danach im Dashboard löschen: Storage → memories → Ordner <trip_id>.
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
  delete from public.trip_members where trip_id = v_id;
  update public.trips set
    phase = 'opening', completed_chapters = '{}', current_chapter = 0,
    started_at = null, finished_at = null, updated_at = now()
  where id = v_id;
  return v_id;
end;
$$;

-- Rechte: Standardmäßig vergibt Supabase EXECUTE an anon/authenticated – hier explizit einschränken.
revoke execute on function public.join_trip(text)                                                  from public, anon;
revoke execute on function public.save_progress(uuid, text, text[], timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.save_response(uuid, text, text, timestamptz)                      from public, anon;
revoke execute on function public.record_upload(uuid, text, text, timestamptz)                      from public, anon;
revoke execute on function public.reset_trip(uuid)                                                  from public, anon;
revoke execute on function public.create_trip(text, text)                                           from public, anon, authenticated;
revoke execute on function public.admin_reset_trip(text)                                            from public, anon, authenticated;

grant execute on function public.join_trip(text)                                                  to authenticated;
grant execute on function public.save_progress(uuid, text, text[], timestamptz, timestamptz, text) to authenticated;
grant execute on function public.save_response(uuid, text, text, timestamptz)                      to authenticated;
grant execute on function public.record_upload(uuid, text, text, timestamptz)                      to authenticated;
grant execute on function public.reset_trip(uuid)                                                  to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_trip_member_folder(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: privater Bucket + Policies
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memories', 'memories', false, 10485760, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "memories: members read"   on storage.objects;
drop policy if exists "memories: members insert" on storage.objects;
drop policy if exists "memories: members delete" on storage.objects;

create policy "memories: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'memories' and private.is_trip_member_folder((storage.foldername(name))[1]));

create policy "memories: members insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'memories' and private.is_trip_member_folder((storage.foldername(name))[1]));

create policy "memories: members delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'memories' and private.is_trip_member_folder((storage.foldername(name))[1]));
