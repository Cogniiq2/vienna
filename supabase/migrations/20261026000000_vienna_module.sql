-- =============================================================================
-- VIENNA GIFT – isoliertes Modul für ein bestehendes (All-in-One) Supabase-Projekt
--
-- GRUNDSÄTZE
--   * Rein ADDITIV. Es wird kein bestehendes Objekt verändert, gelöscht oder überschrieben.
--   * Alles Vienna-Eigene lebt im neuen Schema `vienna`.
--     Nur die API-Funktionen (RPC) liegen – technisch nötig, weil PostgREST nur `public`
--     ausliefert – in `public`, ausnahmslos mit Präfix `vienna_`.
--   * Eigener privater Storage-Bucket `vienna-memories`. Kein bestehender Bucket wird berührt.
--   * Storage-Policies sind permissiv-additiv und gelten ausschließlich für bucket_id = 'vienna-memories'.
--   * Realtime: Vienna-Tabellen werden der Publication `supabase_realtime` nur HINZUGEFÜGT.
--   * Keine Extensions (sha256 / gen_random_uuid sind Postgres-Bordmittel).
--   * Keine globalen GRANT/REVOKE. Rechte werden nur auf Vienna-eigenen Objekten gesetzt.
--   * Keine Trigger. Kein DROP … CASCADE.
--
-- KOLLISIONSSCHUTZ
--   Vor jeder Änderung prüft ein Guard, ob es Objekte mit Vienna-Namen gibt, die NICHT von
--   diesem Modul stammen (Markierung per COMMENT 'vienna-gift module'). Falls ja: Abbruch
--   mit Fehlermeldung, die ganze Transaktion wird zurückgerollt – nichts wird verändert.
--
-- Wiederholtes Ausführen (z. B. nach einem Update dieses Skripts) ist sicher.
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

  -- Fremde Funktionen mit vienna_-Präfix in public?
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_conflicts
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'vienna\_%'
     and coalesce(obj_description(p.oid, 'pg_proc'), '') <> v_marker;
  if v_conflicts is not null then
    raise exception 'Abbruch: Fremde Funktionen mit Präfix vienna_ gefunden: %. Nichts wurde verändert.', v_conflicts;
  end if;

  -- Bei Erstinstallation dürfen Bucket und Policy-Namen noch nicht existieren.
  if not v_schema then
    if exists (select 1 from storage.buckets where id = 'vienna-memories') then
      raise exception 'Abbruch: Bucket "vienna-memories" existiert bereits (nicht von Vienna Gift). Nichts wurde verändert.';
    end if;
    select string_agg(policyname, ', ') into v_conflicts
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname like 'vienna\_%';
    if v_conflicts is not null then
      raise exception 'Abbruch: Storage-Policies mit Vienna-Namen existieren bereits: %. Nichts wurde verändert.', v_conflicts;
    end if;
  end if;
end
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Schema
-- -----------------------------------------------------------------------------
create schema if not exists vienna;
comment on schema vienna is 'vienna-gift module';

-- Nur angemeldete Sessions (auch anonyme) dürfen das Schema „sehen“ – nötig für
-- RLS-Hilfsfunktionen in Storage-Policies und für Realtime im Admin-Dashboard.
-- Das Schema wird NICHT über die REST-API exponiert.
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

create table if not exists vienna.trip_members (
  trip_id      uuid not null references vienna.trips (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  device       text,
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz,
  constraint vienna_trip_members_pkey primary key (trip_id, user_id)
);
create index if not exists vienna_trip_members_user_idx on vienna.trip_members (user_id);

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

-- Familien-Assets inkl. optionaler Metadaten. storage_path null = nur Metadaten, noch keine Datei.
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

-- Vienna-eigene Admin-Liste (unabhängig von anderen Apps im Projekt).
create table if not exists vienna.admins (
  email      text primary key constraint vienna_admins_email_check check (email = lower(email)),
  created_at timestamptz not null default now()
);

alter table vienna.trips        enable row level security;
alter table vienna.trip_members enable row level security;
alter table vienna.uploads      enable row level security;
alter table vienna.answers      enable row level security;
alter table vienna.messages     enable row level security;
alter table vienna.assets       enable row level security;
alter table vienna.admins       enable row level security;

-- Nur Vienna-eigene Tabellen: kein direkter Zugriff für Clients (Ausnahme unten: Admin-SELECT per RLS).
revoke all on all tables in schema vienna from public, anon, authenticated;

comment on table vienna.trips        is 'vienna-gift module';
comment on table vienna.trip_members is 'vienna-gift module';
comment on table vienna.uploads      is 'vienna-gift module';
comment on table vienna.answers      is 'vienna-gift module';
comment on table vienna.messages     is 'vienna-gift module';
comment on table vienna.assets       is 'vienna-gift module';
comment on table vienna.admins       is 'vienna-gift module';

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

create or replace function vienna.is_trip_member(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from vienna.trip_members m where m.trip_id = p_trip_id and m.user_id = auth.uid())
$$;

-- Für Storage-Policies: Ordnername (Text), damit ungültige Pfade keine Cast-Fehler auslösen.
create or replace function vienna.is_trip_member_folder(p_folder text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from vienna.trip_members m where m.trip_id::text = p_folder and m.user_id = auth.uid())
$$;

create or replace function vienna.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and exists (select 1 from vienna.admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;

create or replace function vienna.assert_member(p_trip_id uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not vienna.is_trip_member(p_trip_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
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

create or replace function vienna.touch_member(p_trip_id uuid)
returns void language sql volatile security definer set search_path = ''
as $$
  update vienna.trip_members set last_seen_at = now() where trip_id = p_trip_id and user_id = auth.uid()
$$;

create or replace function vienna.trip_snapshot(p_trip_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'trip_id', t.id, 'phase', t.phase, 'completed', to_jsonb(t.completed_chapters), 'seen', to_jsonb(t.seen),
    'current_chapter', t.current_chapter, 'language', t.language,
    'started_at', t.started_at, 'finished_at', t.finished_at, 'updated_at', t.updated_at,
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
-- Von Storage-/RLS-Policies im Kontext der angemeldeten Session benötigt:
grant execute on function vienna.is_trip_member_folder(text) to authenticated;
grant execute on function vienna.is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. API für die Eltern-App (public, Präfix vienna_, SECURITY DEFINER + Prüfung)
-- -----------------------------------------------------------------------------
create or replace function public.vienna_join_trip(p_token text, p_device text default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
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
  select t.id into v_trip_id from vienna.trips t where t.token_hash = vienna.hash_token(p_token);
  if v_trip_id is null then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  insert into vienna.trip_members (trip_id, user_id, device, last_seen_at)
  values (v_trip_id, auth.uid(), left(p_device, 80), now())
  on conflict (trip_id, user_id) do update
    set last_seen_at = now(), device = coalesce(left(excluded.device, 80), vienna.trip_members.device);
  return vienna.trip_snapshot(v_trip_id);
end;
$$;

-- Monotones Zusammenführen: Kapitel/Seiten nur hinzufügen, Phasen nur vorwärts (zwei Handys).
create or replace function public.vienna_save_progress(
  p_trip_id uuid, p_phase text, p_completed text[], p_seen text[],
  p_started_at timestamptz, p_finished_at timestamptz, p_language text
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_trip      vienna.trips%rowtype;
  v_completed text[];
  v_seen      text[];
begin
  perform vienna.assert_member(p_trip_id);
  perform vienna.touch_member(p_trip_id);
  select * into v_trip from vienna.trips where id = p_trip_id for update;

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
  where id = p_trip_id;

  return vienna.trip_snapshot(p_trip_id);
end;
$$;

create or replace function public.vienna_save_answer(p_trip_id uuid, p_question_id text, p_value text, p_updated_at timestamptz)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform vienna.assert_member(p_trip_id);
  perform vienna.touch_member(p_trip_id);
  insert into vienna.answers (trip_id, question_id, value, updated_at)
  values (p_trip_id, p_question_id, left(coalesce(p_value, ''), 2000), coalesce(p_updated_at, now()))
  on conflict (trip_id, question_id) do update
    set value = excluded.value, updated_at = excluded.updated_at
    where vienna.answers.updated_at <= excluded.updated_at;
end;
$$;

-- Registriert ein Tagesfoto. Pfad MUSS trips/<trip_id>/day/… sein. Gibt den ersetzten Pfad zurück.
create or replace function public.vienna_record_upload(p_trip_id uuid, p_chapter_id text, p_path text, p_captured_at timestamptz)
returns text language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_previous text;
begin
  perform vienna.assert_member(p_trip_id);
  if p_path is null or position(('trips/' || p_trip_id::text || '/day/') in p_path) <> 1 then
    raise exception 'invalid_path' using errcode = '22023';
  end if;
  select storage_path into v_previous from vienna.uploads where trip_id = p_trip_id and chapter_id = p_chapter_id;
  insert into vienna.uploads (trip_id, chapter_id, storage_path, captured_at, uploaded_at)
  values (p_trip_id, p_chapter_id, p_path, coalesce(p_captured_at, now()), now())
  on conflict (trip_id, chapter_id) do update
    set storage_path = excluded.storage_path, captured_at = excluded.captured_at, uploaded_at = excluded.uploaded_at;
  return v_previous;
end;
$$;

create or replace function public.vienna_mark_message_read(p_trip_id uuid, p_message_id uuid)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform vienna.assert_member(p_trip_id);
  update vienna.messages set read_at = coalesce(read_at, now()) where id = p_message_id and trip_id = p_trip_id;
end;
$$;

-- Testdaten zurücksetzen (Debug). Familien-Assets bleiben erhalten. Gibt die Tagesfoto-Pfade zurück.
create or replace function public.vienna_reset_trip(p_trip_id uuid)
returns text[] language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_paths text[];
begin
  perform vienna.assert_member(p_trip_id);
  select coalesce(array_agg(storage_path), '{}') into v_paths from vienna.uploads where trip_id = p_trip_id;
  delete from vienna.uploads  where trip_id = p_trip_id;
  delete from vienna.answers  where trip_id = p_trip_id;
  delete from vienna.messages where trip_id = p_trip_id;
  update vienna.trips set phase = 'opening', completed_chapters = '{}', seen = '{}', current_chapter = 0,
         started_at = null, finished_at = null, updated_at = now()
   where id = p_trip_id;
  return v_paths;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Admin-API (E-Mail-Login + Eintrag in vienna.admins)
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
        select jsonb_agg(jsonb_build_object('device', m.device, 'joined_at', m.joined_at, 'last_seen_at', m.last_seen_at)
                         order by m.last_seen_at desc nulls last)
        from vienna.trip_members m where m.trip_id = t.id), '[]'::jsonb)
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

-- Registriert eine hochgeladene Asset-Datei (Pfad MUSS trips/<trip_id>/… sein). Gibt die ersetzte Datei zurück.
create or replace function public.vienna_admin_set_asset(p_trip_id uuid, p_slot text, p_path text, p_mime text)
returns text language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_previous text;
begin
  perform vienna.assert_admin();
  if p_path is null or position(('trips/' || p_trip_id::text || '/') in p_path) <> 1 or p_path like '%/day/%' then
    raise exception 'invalid_path' using errcode = '22023';
  end if;
  select storage_path into v_previous from vienna.assets where trip_id = p_trip_id and slot = p_slot;
  insert into vienna.assets (trip_id, slot, storage_path, mime, updated_at)
  values (p_trip_id, p_slot, p_path, p_mime, now())
  on conflict (trip_id, slot) do update set storage_path = excluded.storage_path, mime = excluded.mime, updated_at = now();
  return v_previous;
end;
$$;

-- Optionale Metadaten (Bildunterschrift SR/DE, Jahr, Ort, Notiz). Leere Strings = entfernen.
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

-- Entfernt die Datei-Zuordnung (Metadaten bleiben). Gibt den Pfad zum Löschen zurück.
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

-- Nur im SQL-Editor (keine Client-Rolle): Trip anlegen / per Token zurücksetzen.
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
  delete from vienna.uploads      where trip_id = v_id;
  delete from vienna.answers      where trip_id = v_id;
  delete from vienna.messages     where trip_id = v_id;
  delete from vienna.trip_members where trip_id = v_id;
  update vienna.trips set phase = 'opening', completed_chapters = '{}', seen = '{}', current_chapter = 0,
         started_at = null, finished_at = null, updated_at = now()
   where id = v_id;
  return v_id;
end;
$$;

-- Markierung + Rechte NUR für die Vienna-Funktionen
comment on function public.vienna_join_trip(text, text)                                                      is 'vienna-gift module';
comment on function public.vienna_save_progress(uuid, text, text[], text[], timestamptz, timestamptz, text)   is 'vienna-gift module';
comment on function public.vienna_save_answer(uuid, text, text, timestamptz)                                  is 'vienna-gift module';
comment on function public.vienna_record_upload(uuid, text, text, timestamptz)                                is 'vienna-gift module';
comment on function public.vienna_mark_message_read(uuid, uuid)                                               is 'vienna-gift module';
comment on function public.vienna_reset_trip(uuid)                                                            is 'vienna-gift module';
comment on function public.vienna_admin_whoami()                                                              is 'vienna-gift module';
comment on function public.vienna_admin_overview()                                                            is 'vienna-gift module';
comment on function public.vienna_admin_send_message(uuid, text, boolean)                                     is 'vienna-gift module';
comment on function public.vienna_admin_delete_message(uuid)                                                  is 'vienna-gift module';
comment on function public.vienna_admin_set_asset(uuid, text, text, text)                                     is 'vienna-gift module';
comment on function public.vienna_admin_update_asset_meta(uuid, text, text, text, text, text, text)            is 'vienna-gift module';
comment on function public.vienna_admin_remove_asset(uuid, text)                                              is 'vienna-gift module';
comment on function public.vienna_create_trip(text, text)                                                     is 'vienna-gift module';
comment on function public.vienna_admin_reset_trip(text)                                                      is 'vienna-gift module';

revoke all on function public.vienna_join_trip(text, text)                                                    from public, anon, authenticated;
revoke all on function public.vienna_save_progress(uuid, text, text[], text[], timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.vienna_save_answer(uuid, text, text, timestamptz)                                from public, anon, authenticated;
revoke all on function public.vienna_record_upload(uuid, text, text, timestamptz)                              from public, anon, authenticated;
revoke all on function public.vienna_mark_message_read(uuid, uuid)                                             from public, anon, authenticated;
revoke all on function public.vienna_reset_trip(uuid)                                                          from public, anon, authenticated;
revoke all on function public.vienna_admin_whoami()                                                            from public, anon, authenticated;
revoke all on function public.vienna_admin_overview()                                                          from public, anon, authenticated;
revoke all on function public.vienna_admin_send_message(uuid, text, boolean)                                   from public, anon, authenticated;
revoke all on function public.vienna_admin_delete_message(uuid)                                                from public, anon, authenticated;
revoke all on function public.vienna_admin_set_asset(uuid, text, text, text)                                   from public, anon, authenticated;
revoke all on function public.vienna_admin_update_asset_meta(uuid, text, text, text, text, text, text)          from public, anon, authenticated;
revoke all on function public.vienna_admin_remove_asset(uuid, text)                                            from public, anon, authenticated;
revoke all on function public.vienna_create_trip(text, text)                                                   from public, anon, authenticated;
revoke all on function public.vienna_admin_reset_trip(text)                                                    from public, anon, authenticated;

grant execute on function public.vienna_join_trip(text, text)                                                    to authenticated;
grant execute on function public.vienna_save_progress(uuid, text, text[], text[], timestamptz, timestamptz, text) to authenticated;
grant execute on function public.vienna_save_answer(uuid, text, text, timestamptz)                                to authenticated;
grant execute on function public.vienna_record_upload(uuid, text, text, timestamptz)                              to authenticated;
grant execute on function public.vienna_mark_message_read(uuid, uuid)                                             to authenticated;
grant execute on function public.vienna_reset_trip(uuid)                                                          to authenticated;
grant execute on function public.vienna_admin_whoami()                                                            to authenticated;
grant execute on function public.vienna_admin_overview()                                                          to authenticated;
grant execute on function public.vienna_admin_send_message(uuid, text, boolean)                                   to authenticated;
grant execute on function public.vienna_admin_delete_message(uuid)                                                to authenticated;
grant execute on function public.vienna_admin_set_asset(uuid, text, text, text)                                   to authenticated;
grant execute on function public.vienna_admin_update_asset_meta(uuid, text, text, text, text, text, text)          to authenticated;
grant execute on function public.vienna_admin_remove_asset(uuid, text)                                            to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Admin-Lesezugriff per RLS (Grundlage für Realtime im Dashboard)
--    Nur Vienna-Tabellen; Eltern-Sessions erfüllen die Policies nie.
-- -----------------------------------------------------------------------------
grant select (id, label, phase, current_chapter, completed_chapters, seen, language,
              started_at, finished_at, created_at, updated_at) on vienna.trips to authenticated;
grant select on vienna.trip_members, vienna.uploads, vienna.answers, vienna.messages, vienna.assets to authenticated;

drop policy if exists vienna_admin_read_trips    on vienna.trips;
drop policy if exists vienna_admin_read_members  on vienna.trip_members;
drop policy if exists vienna_admin_read_uploads  on vienna.uploads;
drop policy if exists vienna_admin_read_answers  on vienna.answers;
drop policy if exists vienna_admin_read_messages on vienna.messages;
drop policy if exists vienna_admin_read_assets   on vienna.assets;
create policy vienna_admin_read_trips    on vienna.trips        for select to authenticated using (vienna.is_admin());
create policy vienna_admin_read_members  on vienna.trip_members for select to authenticated using (vienna.is_admin());
create policy vienna_admin_read_uploads  on vienna.uploads      for select to authenticated using (vienna.is_admin());
create policy vienna_admin_read_answers  on vienna.answers      for select to authenticated using (vienna.is_admin());
create policy vienna_admin_read_messages on vienna.messages     for select to authenticated using (vienna.is_admin());
create policy vienna_admin_read_assets   on vienna.assets       for select to authenticated using (vienna.is_admin());
-- vienna.admins: RLS an, keine Policy, keine Grants → für Clients unsichtbar.

-- -----------------------------------------------------------------------------
-- 7. Realtime: Vienna-Tabellen nur HINZUFÜGEN (bestehende Konfiguration bleibt unberührt)
-- -----------------------------------------------------------------------------
do $rt$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    foreach v_table in array array['trips', 'trip_members', 'uploads', 'answers', 'messages', 'assets'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'vienna' and tablename = v_table) then
        execute format('alter publication supabase_realtime add table vienna.%I', v_table);
      end if;
    end loop;
  end if;
end
$rt$;

-- -----------------------------------------------------------------------------
-- 8. Storage: eigener privater Bucket + Policies NUR für diesen Bucket
--    Struktur: trips/<trip_id>/day/…    Tagesfotos (Eltern-Geräte)
--              trips/<trip_id>/family/… Familienfotos (Admin)
--              trips/<trip_id>/video/…  Video + Vorschaubild (Admin)
--              trips/<trip_id>/audio/…  Sprachnachrichten (Admin)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vienna-memories', 'vienna-memories', false, null, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/webm', 'text/vtt'])
on conflict (id) do nothing;

drop policy if exists vienna_memories_read         on storage.objects;
drop policy if exists vienna_memories_day_insert   on storage.objects;
drop policy if exists vienna_memories_day_delete   on storage.objects;
drop policy if exists vienna_memories_admin_insert on storage.objects;
drop policy if exists vienna_memories_admin_update on storage.objects;
drop policy if exists vienna_memories_admin_delete on storage.objects;

create policy vienna_memories_read on storage.objects for select to authenticated
  using (bucket_id = 'vienna-memories' and (storage.foldername(name))[1] = 'trips'
         and (vienna.is_admin() or vienna.is_trip_member_folder((storage.foldername(name))[2])));

create policy vienna_memories_day_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vienna-memories' and (storage.foldername(name))[1] = 'trips'
              and (storage.foldername(name))[3] = 'day' and vienna.is_trip_member_folder((storage.foldername(name))[2]));

create policy vienna_memories_day_delete on storage.objects for delete to authenticated
  using (bucket_id = 'vienna-memories' and (storage.foldername(name))[1] = 'trips'
         and (storage.foldername(name))[3] = 'day' and vienna.is_trip_member_folder((storage.foldername(name))[2]));

create policy vienna_memories_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vienna-memories' and vienna.is_admin());

create policy vienna_memories_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'vienna-memories' and vienna.is_admin());

create policy vienna_memories_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'vienna-memories' and vienna.is_admin());

commit;

-- =============================================================================
-- Danach (einmalig, im SQL-Editor):
--   insert into vienna.admins (email) values ('deine@mail.de');
--   select public.vienna_create_trip('<token aus npm run trip:create>', 'Mama & Tata · Wien');
-- =============================================================================
