-- =============================================================================
-- VIENNA GIFT – isoliertes Modul für ein bestehendes (All-in-One) Supabase-Projekt
-- Version 2: OHNE Supabase Auth für die Eltern (keine Anonymous Sign-ins nötig).
--
-- ZUGRIFFSMODELL
--   Eltern:  kein Login. Jeder Aufruf trägt den geheimen Trip-Token (192 Bit) + eine lokale
--            Geräte-ID. Jede Vienna-Funktion prüft den Token selbst (nur SHA-256-Hash in der DB).
--            Fotos laufen ausschließlich über die Edge Function `vienna-media`, die mit dem
--            Service-Role-Key serverseitig signierte Upload-/Lese-URLs für Vienna-Pfade ausstellt.
--   Admin:   normaler Supabase-E-Mail-Login + Eintrag in vienna.admins.
--
-- GRUNDSÄTZE
--   * Rein ADDITIV. Kein bestehendes Objekt wird verändert, gelöscht oder überschrieben.
--   * Alles Vienna-Eigene im Schema `vienna`; API-Funktionen in `public` nur mit Präfix `vienna_`.
--   * Eigene private Buckets `vienna-day` (Tagesfotos) und `vienna-memories` (Familien-Assets).
--   * Storage-Policies nur für diese Buckets und nur für Vienna-Admins.
--   * Realtime: Vienna-Tabellen werden der Publication nur HINZUGEFÜGT.
--   * Keine Extensions, keine Trigger, kein DROP … CASCADE auf fremden Strukturen,
--     keine globalen GRANT/REVOKE, keine Default Privileges, keine Auth-Einstellungen.
--
-- KOLLISIONSSCHUTZ: siehe Abschnitt 0. Bei fremden Objekten mit Vienna-Namen → Abbruch + Rollback.
-- Wiederholtes Ausführen ist sicher.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Guard
-- -----------------------------------------------------------------------------
do $guard$
declare
  v_marker    constant text := 'vienna-gift module';
  v_schema    boolean;
  v_conflicts text;
begin
  select exists (select 1 from pg_namespace where nspname = 'vienna') into v_schema;

  if v_schema and coalesce(obj_description((select oid from pg_namespace where nspname = 'vienna'), 'pg_namespace'), '') <> v_marker then
    raise exception 'Abbruch: Schema "vienna" existiert bereits und gehört nicht zu Vienna Gift. Nichts wurde verändert.';
  end if;

  select string_agg(p.oid::regprocedure::text, ', ') into v_conflicts
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'vienna\_%'
     and coalesce(obj_description(p.oid, 'pg_proc'), '') <> v_marker;
  if v_conflicts is not null then
    raise exception 'Abbruch: Fremde Funktionen mit Präfix vienna_ gefunden: %. Nichts wurde verändert.', v_conflicts;
  end if;

  if not v_schema then
    select string_agg(id, ', ') into v_conflicts from storage.buckets where id in ('vienna-day', 'vienna-memories');
    if v_conflicts is not null then
      raise exception 'Abbruch: Bucket(s) % existieren bereits (nicht von Vienna Gift). Nichts wurde verändert.', v_conflicts;
    end if;
    select string_agg(policyname, ', ') into v_conflicts
      from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'vienna\_%';
    if v_conflicts is not null then
      raise exception 'Abbruch: Storage-Policies mit Vienna-Namen existieren bereits: %. Nichts wurde verändert.', v_conflicts;
    end if;
  end if;
end
$guard$;

-- -----------------------------------------------------------------------------
-- 0b. Upgrade eines früheren Vienna-Entwurfs (nur eigene, markierte Objekte)
-- -----------------------------------------------------------------------------
do $upgrade$
declare
  v_fn regprocedure;
begin
  if exists (select 1 from pg_namespace where nspname = 'vienna') then
    -- Alte Funktionssignaturen (mit Supabase-Session) entfernen – nur Vienna-markierte.
    for v_fn in
      select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'vienna\_%'
         and obj_description(p.oid, 'pg_proc') = 'vienna-gift module'
    loop
      execute format('drop function %s', v_fn);
    end loop;
    drop policy if exists vienna_memories_read       on storage.objects;
    drop policy if exists vienna_memories_day_insert on storage.objects;
    drop policy if exists vienna_memories_day_delete on storage.objects;
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'vienna' and tablename = 'trip_members') then
      alter publication supabase_realtime drop table vienna.trip_members;
    end if;
    drop table if exists vienna.trip_members;
    drop function if exists vienna.is_trip_member(uuid);
    drop function if exists vienna.is_trip_member_folder(text);
    drop function if exists vienna.assert_member(uuid);
    drop function if exists vienna.touch_member(uuid);
  end if;
end
$upgrade$;

-- -----------------------------------------------------------------------------
-- 1. Schema
-- -----------------------------------------------------------------------------
create schema if not exists vienna;
comment on schema vienna is 'vienna-gift module';
-- Nur für den Admin (permanenter E-Mail-User): RLS-Hilfsfunktionen und Realtime. Nicht über die REST-API exponiert.
grant usage on schema vienna to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Tabellen
-- -----------------------------------------------------------------------------
create table if not exists vienna.trips (
  id                 uuid primary key default gen_random_uuid(),
  token_hash         text not null,
  label              text,
  phase              text not null default 'opening'
                     constraint vienna_trips_phase_check check (phase in ('opening', 'intro', 'journey', 'finale')),
  current_chapter    smallint not null default 0,
  completed_chapters text[] not null default '{}',
  seen               text[] not null default '{}',
  language           text not null default 'sr'
                     constraint vienna_trips_language_check check (language in ('sr', 'de')),
  started_at         timestamptz,
  finished_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint vienna_trips_token_hash_key unique (token_hash)
);

-- Zeitpunkt des letzten Test-Resets: Geräte mit älterem lokalen Stand verwerfen diesen (statt ihn zurückzuspielen).
alter table vienna.trips add column if not exists reset_at timestamptz;

-- Geräte der Eltern: zufällige, lokal gespeicherte ID – kein Auth-User.
create table if not exists vienna.devices (
  trip_id      uuid not null references vienna.trips (id) on delete cascade,
  device_id    uuid not null,
  label        text constraint vienna_devices_label_check check (char_length(label) <= 80),
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint vienna_devices_pkey primary key (trip_id, device_id)
);

create table if not exists vienna.uploads (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references vienna.trips (id) on delete cascade,
  chapter_id   text not null
               constraint vienna_uploads_chapter_check check (chapter_id in ('morning', 'mission', 'tennis', 'spa', 'dinner')),
  storage_path text not null,
  captured_at  timestamptz not null,
  uploaded_at  timestamptz not null default now(),
  constraint vienna_uploads_trip_chapter_key unique (trip_id, chapter_id)
);

-- Vom Server ausgestellte Upload-Berechtigungen. Pfade entstehen NUR hier, nie im Client.
create table if not exists vienna.upload_tickets (
  path       text primary key,
  trip_id    uuid not null references vienna.trips (id) on delete cascade,
  device_id  uuid not null,
  chapter_id text not null,
  issued_at  timestamptz not null default now(),
  used_at    timestamptz
);
create index if not exists vienna_upload_tickets_trip_idx on vienna.upload_tickets (trip_id, issued_at);

create table if not exists vienna.answers (
  trip_id     uuid not null references vienna.trips (id) on delete cascade,
  question_id text not null
              constraint vienna_answers_question_check check (question_id ~ '^[a-z]+(\.[a-zA-Z]+){1,3}$' and char_length(question_id) <= 64),
  value       text not null constraint vienna_answers_value_check check (char_length(value) <= 2000),
  updated_at  timestamptz not null default now(),
  constraint vienna_answers_pkey primary key (trip_id, question_id)
);

create table if not exists vienna.messages (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references vienna.trips (id) on delete cascade,
  body       text not null constraint vienna_messages_body_check check (char_length(body) between 1 and 500),
  heart      boolean not null default false,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists vienna_messages_trip_idx on vienna.messages (trip_id, created_at);

create table if not exists vienna.assets (
  trip_id      uuid not null references vienna.trips (id) on delete cascade,
  slot         text not null constraint vienna_assets_slot_check check (slot in (
                 'familyCurrent', 'parentsCurrent', 'gradskiKlub', 'wedding', 'familyEarly',
                 'familyVideo', 'videoPoster', 'audioDjordje', 'audioBogdana', 'audioLazar')),
  storage_path text,
  mime         text,
  caption_sr   text constraint vienna_assets_caption_sr_check check (char_length(caption_sr) <= 200),
  caption_de   text constraint vienna_assets_caption_de_check check (char_length(caption_de) <= 200),
  year         text constraint vienna_assets_year_check check (char_length(year) <= 20),
  location     text constraint vienna_assets_location_check check (char_length(location) <= 120),
  note         text constraint vienna_assets_note_check check (char_length(note) <= 500),
  updated_at   timestamptz not null default now(),
  constraint vienna_assets_pkey primary key (trip_id, slot)
);

create table if not exists vienna.admins (
  email      text primary key constraint vienna_admins_email_check check (email = lower(email)),
  created_at timestamptz not null default now()
);

alter table vienna.trips          enable row level security;
alter table vienna.devices        enable row level security;
alter table vienna.uploads        enable row level security;
alter table vienna.upload_tickets enable row level security;
alter table vienna.answers        enable row level security;
alter table vienna.messages       enable row level security;
alter table vienna.assets         enable row level security;
alter table vienna.admins         enable row level security;

revoke all on all tables in schema vienna from public, anon, authenticated;

comment on table vienna.trips          is 'vienna-gift module';
comment on table vienna.devices        is 'vienna-gift module';
comment on table vienna.uploads        is 'vienna-gift module';
comment on table vienna.upload_tickets is 'vienna-gift module';
comment on table vienna.answers        is 'vienna-gift module';
comment on table vienna.messages       is 'vienna-gift module';
comment on table vienna.assets         is 'vienna-gift module';
comment on table vienna.admins         is 'vienna-gift module';

-- -----------------------------------------------------------------------------
-- 3. Interne Hilfsfunktionen (Schema vienna, nicht über die API erreichbar)
-- -----------------------------------------------------------------------------
create or replace function vienna.chapter_order()
returns text[] language sql immutable set search_path = ''
as $$ select array['morning', 'mission', 'tennis', 'spa', 'dinner']::text[] $$;

create or replace function vienna.phase_rank(p_phase text)
returns int language sql immutable set search_path = ''
as $$ select coalesce(array_position(array['opening', 'intro', 'journey', 'finale']::text[], p_phase), 0) $$;

create or replace function vienna.hash_token(p_token text)
returns text language sql immutable set search_path = ''
as $$ select encode(pg_catalog.sha256(convert_to(p_token, 'UTF8')), 'hex') $$;

-- Löst Token → Trip auf und registriert/aktualisiert das Gerät.
-- Ungültig/fehlend/falsches Format → immer dieselbe Meldung, keinerlei Metadaten.
create or replace function vienna.require_trip(p_token text, p_device_id uuid, p_label text default null)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_trip_id uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{24,128}$' or p_device_id is null then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  select t.id into v_trip_id from vienna.trips t where t.token_hash = vienna.hash_token(p_token);
  if v_trip_id is null then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  insert into vienna.devices (trip_id, device_id, label, last_seen_at)
  values (v_trip_id, p_device_id, left(p_label, 80), now())
  on conflict (trip_id, device_id) do update
    set last_seen_at = now(), label = coalesce(left(excluded.label, 80), vienna.devices.label);
  return v_trip_id;
end;
$$;

create or replace function vienna.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and exists (select 1 from vienna.admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;

create or replace function vienna.assert_admin()
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not vienna.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function vienna.trip_snapshot(p_trip_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'trip_id', t.id, 'phase', t.phase, 'completed', to_jsonb(t.completed_chapters), 'seen', to_jsonb(t.seen),
    'current_chapter', t.current_chapter, 'language', t.language,
    'started_at', t.started_at, 'finished_at', t.finished_at, 'updated_at', t.updated_at, 'reset_at', t.reset_at,
    'uploads', coalesce((
      select jsonb_agg(jsonb_build_object('chapter_id', u.chapter_id, 'path', u.storage_path,
                                          'captured_at', u.captured_at, 'uploaded_at', u.uploaded_at) order by u.uploaded_at)
      from vienna.uploads u where u.trip_id = t.id), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object('question_id', a.question_id, 'value', a.value, 'updated_at', a.updated_at))
      from vienna.answers a where a.trip_id = t.id), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body, 'heart', m.heart,
                                          'created_at', m.created_at, 'read_at', m.read_at) order by m.created_at)
      from vienna.messages m where m.trip_id = t.id), '[]'::jsonb),
    'assets', coalesce((
      select jsonb_agg(jsonb_build_object('slot', s.slot, 'path', s.storage_path, 'mime', s.mime,
                                          'caption_sr', s.caption_sr, 'caption_de', s.caption_de,
                                          'year', s.year, 'location', s.location, 'note', s.note,
                                          'updated_at', s.updated_at))
      from vienna.assets s where s.trip_id = t.id), '[]'::jsonb)
  )
  from vienna.trips t where t.id = p_trip_id
$$;

revoke all on all functions in schema vienna from public, anon, authenticated;
grant execute on function vienna.is_admin() to authenticated;   -- für Admin-RLS & Storage-Policies

-- -----------------------------------------------------------------------------
-- 4. Eltern-API: Token + Geräte-ID, kein Login (Grant an anon/authenticated)
--    Die Eltern-Snapshots enthalten keine Trip-ID.
-- -----------------------------------------------------------------------------
create or replace function public.vienna_join_trip(p_token text, p_device_id uuid, p_device text default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
begin
  return vienna.trip_snapshot(vienna.require_trip(p_token, p_device_id, p_device)) - 'trip_id';
end;
$$;

-- Monotones Zusammenführen: Kapitel/Seiten nur hinzufügen, Phasen nur vorwärts (zwei Handys).
create or replace function public.vienna_save_progress(
  p_token text, p_device_id uuid, p_phase text, p_completed text[], p_seen text[],
  p_started_at timestamptz, p_finished_at timestamptz, p_language text
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_trip_id   uuid := vienna.require_trip(p_token, p_device_id);
  v_trip      vienna.trips%rowtype;
  v_completed text[];
  v_seen      text[];
begin
  select * into v_trip from vienna.trips where id = v_trip_id for update;

  select coalesce(array_agg(c order by ord), '{}') into v_completed
    from unnest(vienna.chapter_order()) with ordinality as x(c, ord)
   where c = any (v_trip.completed_chapters || coalesce(p_completed, '{}'));

  select coalesce(array_agg(distinct k order by k), '{}') into v_seen
    from unnest(v_trip.seen || coalesce(p_seen, '{}')) as k
   where k ~ '^[a-z]+:[A-Za-z]+$' and char_length(k) <= 64;

  update vienna.trips set
    completed_chapters = v_completed,
    seen               = v_seen,
    current_chapter    = cardinality(v_completed),
    phase = case
      when cardinality(v_completed) = cardinality(vienna.chapter_order()) then 'finale'
      when vienna.phase_rank(p_phase) > vienna.phase_rank(v_trip.phase) then p_phase
      else v_trip.phase end,
    started_at  = least(v_trip.started_at, p_started_at),
    finished_at = least(v_trip.finished_at, p_finished_at),
    language    = case when p_language in ('sr', 'de') then p_language else v_trip.language end,
    updated_at  = now()
  where id = v_trip_id;

  return vienna.trip_snapshot(v_trip_id) - 'trip_id';
end;
$$;

create or replace function public.vienna_save_answer(
  p_token text, p_device_id uuid, p_question_id text, p_value text, p_updated_at timestamptz
)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_trip_id uuid := vienna.require_trip(p_token, p_device_id);
begin
  insert into vienna.answers (trip_id, question_id, value, updated_at)
  values (v_trip_id, p_question_id, left(coalesce(p_value, ''), 2000), coalesce(p_updated_at, now()))
  on conflict (trip_id, question_id) do update
    set value = excluded.value, updated_at = excluded.updated_at
    where vienna.answers.updated_at <= excluded.updated_at;
end;
$$;

create or replace function public.vienna_mark_message_read(p_token text, p_device_id uuid, p_message_id uuid)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_trip_id uuid := vienna.require_trip(p_token, p_device_id);
begin
  update vienna.messages set read_at = coalesce(read_at, now()) where id = p_message_id and trip_id = v_trip_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Media-API – NUR für die Edge Function `vienna-media` (service_role)
-- -----------------------------------------------------------------------------

-- Stellt ein Upload-Ticket aus: Pfad wird hier erzeugt. Missbrauchsschutz:
-- max. 15 Tickets pro Gerät in 10 Minuten, max. 60 pro Trip und Stunde.
create or replace function public.vienna_media_issue_upload(p_token text, p_device_id uuid, p_chapter_id text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_trip_id uuid := vienna.require_trip(p_token, p_device_id);
  v_path    text;
begin
  if p_chapter_id is null or not (p_chapter_id = any (vienna.chapter_order())) then
    raise exception 'invalid_chapter' using errcode = '22023';
  end if;
  if (select count(*) from vienna.upload_tickets
       where trip_id = v_trip_id and device_id = p_device_id and issued_at > now() - interval '10 minutes') >= 15
     or (select count(*) from vienna.upload_tickets
       where trip_id = v_trip_id and issued_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  v_path := 'trips/' || v_trip_id::text || '/day/' || p_chapter_id || '-' || replace(gen_random_uuid()::text, '-', '') || '.jpg';
  insert into vienna.upload_tickets (path, trip_id, device_id, chapter_id) values (v_path, v_trip_id, p_device_id, p_chapter_id);
  return jsonb_build_object('bucket', 'vienna-day', 'path', v_path);
end;
$$;

-- Bestätigt einen Upload. Der Pfad MUSS ein vom Server ausgestelltes, unbenutztes, höchstens 2 Stunden altes
-- Ticket dieses Trips sein (die Edge Function prüft vorher, dass die Datei wirklich im Bucket liegt).
-- Gibt den ersetzten Pfad zurück (zum Aufräumen durch die Edge Function).
create or replace function public.vienna_media_confirm_upload(
  p_token text, p_device_id uuid, p_chapter_id text, p_path text, p_captured_at timestamptz
)
returns text language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_trip_id  uuid := vienna.require_trip(p_token, p_device_id);
  v_previous text;
begin
  update vienna.upload_tickets set used_at = now()
   where path = p_path and trip_id = v_trip_id and chapter_id = p_chapter_id and used_at is null
     and issued_at > now() - interval '2 hours';
  if not found then
    raise exception 'invalid_upload' using errcode = '22023';
  end if;
  select storage_path into v_previous from vienna.uploads where trip_id = v_trip_id and chapter_id = p_chapter_id;
  insert into vienna.uploads (trip_id, chapter_id, storage_path, captured_at, uploaded_at)
  values (v_trip_id, p_chapter_id, p_path, coalesce(p_captured_at, now()), now())
  on conflict (trip_id, chapter_id) do update
    set storage_path = excluded.storage_path, captured_at = excluded.captured_at, uploaded_at = excluded.uploaded_at;
  return v_previous;
end;
$$;

-- Filtert angefragte Pfade auf solche, die diesem Trip gehören (registrierte Tagesfotos/Familien-Assets).
create or replace function public.vienna_media_readable(p_token text, p_device_id uuid, p_paths text[])
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_trip_id uuid := vienna.require_trip(p_token, p_device_id);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('bucket', x.bucket, 'path', x.path))
    from (
      select 'vienna-day' as bucket, u.storage_path as path from vienna.uploads u
       where u.trip_id = v_trip_id and u.storage_path = any (coalesce(p_paths, '{}'))
      union
      select 'vienna-memories', s.storage_path from vienna.assets s
       where s.trip_id = v_trip_id and s.storage_path is not null and s.storage_path = any (coalesce(p_paths, '{}'))
    ) x), '[]'::jsonb);
end;
$$;

-- Testdaten zurücksetzen (Debug). Familien-Assets bleiben. Gibt die zu löschenden Tagesfoto-Pfade zurück.
create or replace function public.vienna_media_reset(p_token text, p_device_id uuid)
returns text[] language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_trip_id uuid := vienna.require_trip(p_token, p_device_id);
  v_paths   text[];
begin
  select coalesce(array_agg(distinct p), '{}') into v_paths from (
    select storage_path as p from vienna.uploads where trip_id = v_trip_id
    union select path from vienna.upload_tickets where trip_id = v_trip_id) x;
  delete from vienna.uploads        where trip_id = v_trip_id;
  delete from vienna.upload_tickets where trip_id = v_trip_id;
  delete from vienna.answers        where trip_id = v_trip_id;
  delete from vienna.messages       where trip_id = v_trip_id;
  update vienna.trips set phase = 'opening', completed_chapters = '{}', seen = '{}', current_chapter = 0,
         started_at = null, finished_at = null, reset_at = now(), updated_at = now()
   where id = v_trip_id;
  return v_paths;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Admin-API (E-Mail-Login + Eintrag in vienna.admins)
-- -----------------------------------------------------------------------------
create or replace function public.vienna_admin_whoami()
returns jsonb language sql stable security definer set search_path = ''
as $$ select jsonb_build_object('email', auth.jwt() ->> 'email', 'is_admin', vienna.is_admin()) $$;

create or replace function public.vienna_admin_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform vienna.assert_admin();
  return coalesce((
    select jsonb_agg(vienna.trip_snapshot(t.id) || jsonb_build_object(
      'label', t.label, 'created_at', t.created_at,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('device', d.label, 'joined_at', d.joined_at, 'last_seen_at', d.last_seen_at)
                         order by d.last_seen_at desc)
        from vienna.devices d where d.trip_id = t.id), '[]'::jsonb)
    ) order by t.created_at)
    from vienna.trips t), '[]'::jsonb);
end;
$$;

create or replace function public.vienna_admin_send_message(p_trip_id uuid, p_body text, p_heart boolean default false)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform vienna.assert_admin();
  insert into vienna.messages (trip_id, body, heart) values (p_trip_id, left(trim(p_body), 500), coalesce(p_heart, false))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.vienna_admin_delete_message(p_message_id uuid)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform vienna.assert_admin();
  delete from vienna.messages where id = p_message_id;
end;
$$;

create or replace function public.vienna_admin_set_asset(p_trip_id uuid, p_slot text, p_path text, p_mime text)
returns text language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_previous text;
begin
  perform vienna.assert_admin();
  if p_path is null or p_path !~ ('^trips/' || p_trip_id::text || '/(family|video|audio)/[A-Za-z]+-[a-z0-9]+\.[a-z0-9]{2,5}$') then
    raise exception 'invalid_path' using errcode = '22023';
  end if;
  select storage_path into v_previous from vienna.assets where trip_id = p_trip_id and slot = p_slot;
  insert into vienna.assets (trip_id, slot, storage_path, mime, updated_at)
  values (p_trip_id, p_slot, p_path, p_mime, now())
  on conflict (trip_id, slot) do update set storage_path = excluded.storage_path, mime = excluded.mime, updated_at = now();
  return v_previous;
end;
$$;

create or replace function public.vienna_admin_update_asset_meta(
  p_trip_id uuid, p_slot text, p_caption_sr text, p_caption_de text, p_year text, p_location text, p_note text
)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform vienna.assert_admin();
  insert into vienna.assets (trip_id, slot, caption_sr, caption_de, year, location, note, updated_at)
  values (p_trip_id, p_slot, nullif(trim(p_caption_sr), ''), nullif(trim(p_caption_de), ''), nullif(trim(p_year), ''),
          nullif(trim(p_location), ''), nullif(trim(p_note), ''), now())
  on conflict (trip_id, slot) do update set
    caption_sr = excluded.caption_sr, caption_de = excluded.caption_de, year = excluded.year,
    location = excluded.location, note = excluded.note, updated_at = now();
end;
$$;

create or replace function public.vienna_admin_remove_asset(p_trip_id uuid, p_slot text)
returns text language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_previous text;
begin
  perform vienna.assert_admin();
  select storage_path into v_previous from vienna.assets where trip_id = p_trip_id and slot = p_slot;
  update vienna.assets set storage_path = null, mime = null, updated_at = now() where trip_id = p_trip_id and slot = p_slot;
  return v_previous;
end;
$$;

-- Nur im SQL-Editor (keine Client-Rolle):
create or replace function public.vienna_create_trip(p_token text, p_label text default null)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{24,128}$' then
    raise exception 'token must be 24-128 chars of [A-Za-z0-9_-]';
  end if;
  insert into vienna.trips (token_hash, label) values (vienna.hash_token(p_token), p_label) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.vienna_admin_reset_trip(p_token text)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from vienna.trips where token_hash = vienna.hash_token(p_token);
  if v_id is null then
    raise exception 'trip not found';
  end if;
  delete from vienna.uploads        where trip_id = v_id;
  delete from vienna.upload_tickets where trip_id = v_id;
  delete from vienna.answers        where trip_id = v_id;
  delete from vienna.messages       where trip_id = v_id;
  delete from vienna.devices        where trip_id = v_id;
  update vienna.trips set phase = 'opening', completed_chapters = '{}', seen = '{}', current_chapter = 0,
         started_at = null, finished_at = null, reset_at = now(), updated_at = now()
   where id = v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Markierung + Rechte NUR für Vienna-Funktionen
-- -----------------------------------------------------------------------------
do $grants$
declare
  v_fn      regprocedure;
  v_parent  constant text[] := array['vienna_join_trip', 'vienna_save_progress', 'vienna_save_answer',
                                     'vienna_mark_message_read'];
  v_media   constant text[] := array['vienna_media_issue_upload', 'vienna_media_confirm_upload',
                                     'vienna_media_readable', 'vienna_media_reset'];
  v_admin   constant text[] := array['vienna_admin_whoami', 'vienna_admin_overview', 'vienna_admin_send_message',
                                     'vienna_admin_delete_message', 'vienna_admin_set_asset',
                                     'vienna_admin_update_asset_meta', 'vienna_admin_remove_asset'];
  v_sql     constant text[] := array['vienna_create_trip', 'vienna_admin_reset_trip'];
begin
  for v_fn in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_parent || v_media || v_admin || v_sql)
  loop
    execute format('comment on function %s is %L', v_fn, 'vienna-gift module');
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_fn);
    if (select proname from pg_proc where oid = v_fn) = any (v_parent) then
      execute format('grant execute on function %s to anon, authenticated', v_fn);
    elsif (select proname from pg_proc where oid = v_fn) = any (v_media) then
      execute format('grant execute on function %s to service_role', v_fn);
    elsif (select proname from pg_proc where oid = v_fn) = any (v_admin) then
      execute format('grant execute on function %s to authenticated', v_fn);
    end if;
  end loop;
end
$grants$;

-- -----------------------------------------------------------------------------
-- 8. Admin-Lesezugriff per RLS (Grundlage für Realtime im Dashboard). Nur Vienna-Tabellen.
-- -----------------------------------------------------------------------------
grant select (id, label, phase, current_chapter, completed_chapters, seen, language,
              started_at, finished_at, reset_at, created_at, updated_at) on vienna.trips to authenticated;
grant select on vienna.devices, vienna.uploads, vienna.answers, vienna.messages, vienna.assets to authenticated;

drop policy if exists vienna_admin_read_trips    on vienna.trips;
drop policy if exists vienna_admin_read_devices  on vienna.devices;
drop policy if exists vienna_admin_read_uploads  on vienna.uploads;
drop policy if exists vienna_admin_read_answers  on vienna.answers;
drop policy if exists vienna_admin_read_messages on vienna.messages;
drop policy if exists vienna_admin_read_assets   on vienna.assets;
create policy vienna_admin_read_trips    on vienna.trips    for select to authenticated using (vienna.is_admin());
create policy vienna_admin_read_devices  on vienna.devices  for select to authenticated using (vienna.is_admin());
create policy vienna_admin_read_uploads  on vienna.uploads  for select to authenticated using (vienna.is_admin());
create policy vienna_admin_read_answers  on vienna.answers  for select to authenticated using (vienna.is_admin());
create policy vienna_admin_read_messages on vienna.messages for select to authenticated using (vienna.is_admin());
create policy vienna_admin_read_assets   on vienna.assets   for select to authenticated using (vienna.is_admin());
-- vienna.admins, vienna.upload_tickets: RLS an, keine Policy, keine Grants → für Clients unsichtbar.

-- -----------------------------------------------------------------------------
-- 9. Realtime: Vienna-Tabellen nur HINZUFÜGEN
-- -----------------------------------------------------------------------------
do $rt$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    foreach v_table in array array['trips', 'devices', 'uploads', 'answers', 'messages', 'assets'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'vienna' and tablename = v_table) then
        execute format('alter publication supabase_realtime add table vienna.%I', v_table);
      end if;
    end loop;
  end if;
end
$rt$;

-- -----------------------------------------------------------------------------
-- 10. Storage: zwei eigene private Buckets; Policies NUR für Vienna-Admins
--     vienna-day:      trips/<trip_id>/day/…   Tagesfotos (Upload nur per signierter URL der Edge Function)
--     vienna-memories: trips/<trip_id>/family|video|audio/…  Familien-Assets (Upload durch Admin)
--     Eltern haben KEINE Storage-Policy – sie bekommen nur kurzlebige signierte URLs.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vienna-day', 'vienna-day', false, 15728640, array['image/jpeg'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vienna-memories', 'vienna-memories', false, null, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/webm'])
on conflict (id) do nothing;

drop policy if exists vienna_admin_read         on storage.objects;
drop policy if exists vienna_admin_insert       on storage.objects;
drop policy if exists vienna_admin_update       on storage.objects;
drop policy if exists vienna_admin_delete       on storage.objects;
drop policy if exists vienna_memories_admin_insert on storage.objects;
drop policy if exists vienna_memories_admin_update on storage.objects;
drop policy if exists vienna_memories_admin_delete on storage.objects;

create policy vienna_admin_read on storage.objects for select to authenticated
  using (bucket_id in ('vienna-day', 'vienna-memories') and vienna.is_admin());
create policy vienna_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vienna-memories' and vienna.is_admin());
create policy vienna_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'vienna-memories' and vienna.is_admin());
create policy vienna_admin_delete on storage.objects for delete to authenticated
  using (bucket_id in ('vienna-day', 'vienna-memories') and vienna.is_admin());

commit;

-- =============================================================================
-- Danach (einmalig, im SQL-Editor):
--   insert into vienna.admins (email) values ('deine@mail.de');
--   select public.vienna_create_trip('<token aus npm run trip:create>', 'Mama & Tata · Wien');
-- =============================================================================
