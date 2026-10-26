-- Selbstprüfende Sicherheitstests für das Vienna-Modul (Option B: Token + Geräte-ID, keine Supabase-Session).
-- Ausführen: supabase/tests/run.sh. Jeder Fehlschlag bricht mit "TEST FAILED" ab; am Ende steht "ALL VIENNA SECURITY TESTS PASSED".
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

-- Test-Helfer (nur in der Testdatenbank, laufen mit den Rechten der aktuellen Rolle).
create schema vtest;
create function vtest.fails(p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'TEST FAILED: erwartet Fehler "%" für: %', p_pattern, p_sql;
exception when others then
  if sqlerrm like 'TEST FAILED%' or sqlerrm !~* p_pattern then
    raise exception 'TEST FAILED: % → bekam: %', p_sql, sqlerrm;
  end if;
end $$;
create function vtest.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'TEST FAILED: %', p_label; end if;
end $$;
grant usage on schema vtest to anon, authenticated, service_role;
grant execute on all functions in schema vtest to anon, authenticated, service_role;

insert into auth.users values ('22222222-2222-2222-2222-222222222222'), ('99999999-9999-9999-9999-999999999999');
insert into vienna.admins (email) values ('admin@example.com');
\set TA 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'
\set TB 'ZzYyXxWwVvUuTtSsRrQqPpOoNnMm9876'
\set DEV1 '0e6f6a3c-1b2d-4c5e-8f90-000000000001'
\set DEV2 '0e6f6a3c-1b2d-4c5e-8f90-000000000002'
\set DEVB '0e6f6a3c-1b2d-4c5e-8f90-0000000000bb'
select public.vienna_create_trip(:'TA', 'Trip A') as trip_a \gset
select public.vienna_create_trip(:'TB', 'Trip B') as trip_b \gset

\echo '--- 1. Eltern (Rolle anon, keine Session)'
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false) \g /dev/null
-- Ungültige/fehlende Tokens: immer dieselbe neutrale Meldung, keine Metadaten.
select vtest.fails($$select public.vienna_join_trip('wrongwrongwrongwrongwrongwrong', '0e6f6a3c-1b2d-4c5e-8f90-000000000001')$$, '^invalid_token$');
select vtest.fails($$select public.vienna_join_trip('short', '0e6f6a3c-1b2d-4c5e-8f90-000000000001')$$, '^invalid_token$');
select vtest.fails($$select public.vienna_join_trip(null, '0e6f6a3c-1b2d-4c5e-8f90-000000000001')$$, '^invalid_token$');
select vtest.fails(format('select public.vienna_join_trip(%L, null)', :'TA'), '^invalid_token$');
select vtest.fails($$select public.vienna_save_progress('wrongwrongwrongwrongwrongwrong', '0e6f6a3c-1b2d-4c5e-8f90-000000000001', 'finale', array['dinner'], null, null, null, 'sr')$$, '^invalid_token$');
select vtest.fails($$select public.vienna_save_answer('wrongwrongwrongwrongwrongwrong', '0e6f6a3c-1b2d-4c5e-8f90-000000000001', 'x', 'y', now())$$, '^invalid_token$');

-- Gültiger Token: Snapshot ohne Trip-ID.
select vtest.ok(public.vienna_join_trip(:'TA', :'DEV1', 'iPhone · Safari') ->> 'phase' = 'opening', 'join liefert Phase');
select vtest.ok(not (public.vienna_join_trip(:'TA', :'DEV1') ? 'trip_id'), 'Eltern-Snapshot enthält keine Trip-ID');
-- Zweites Gerät, monotones Zusammenführen.
select vtest.ok(public.vienna_join_trip(:'TA', :'DEV2', 'iPhone · Safari') is not null, 'zweites Gerät');
select vtest.ok(public.vienna_save_progress(:'TA', :'DEV1', 'journey', array['mission','morning','bogus'], array['finale:letter','bad key'], now(), null, 'sr') -> 'completed' = '["morning","mission"]', 'Kapitel gefiltert und sortiert');
select vtest.ok(public.vienna_save_progress(:'TA', :'DEV2', 'intro', array['tennis'], null, null, null, 'de') -> 'completed' = '["morning","mission","tennis"]', 'Gerät 2 ergänzt, Phase bleibt');
select vtest.ok(public.vienna_join_trip(:'TA', :'DEV1') ->> 'phase' = 'journey', 'Phase geht nie zurück');
select vtest.ok(public.vienna_join_trip(:'TA', :'DEV1') -> 'seen' = '["finale:letter"]', 'ungültige seen-Keys verworfen');
select public.vienna_save_answer(:'TA', :'DEV1', 'dinner.moment', 'Шетња уз Дунав', now());

-- Kein direkter Zugriff auf Tabellen, Media-, Admin- oder SQL-only-Funktionen.
select vtest.fails('select count(*) from vienna.trips', 'permission denied');
select vtest.fails('select count(*) from vienna.devices', 'permission denied');
select vtest.fails('select * from vienna.admins', 'permission denied');
select vtest.fails(format('select public.vienna_media_issue_upload(%L, %L, %L)', :'TA', :'DEV1', 'spa'), 'permission denied');
select vtest.fails(format('select public.vienna_media_confirm_upload(%L, %L, %L, %L, now())', :'TA', :'DEV1', 'spa', 'trips/x/day/spa-a.jpg'), 'permission denied');
select vtest.fails(format('select public.vienna_media_readable(%L, %L, array[%L])', :'TA', :'DEV1', 'x'), 'permission denied');
select vtest.fails(format('select public.vienna_media_reset(%L, %L)', :'TA', :'DEV1'), 'permission denied');
select vtest.fails('select public.vienna_admin_overview()', 'permission denied');
select vtest.fails(format('select public.vienna_admin_send_message(%L, %L, true)', :'trip_a', 'hack'), 'permission denied');
select vtest.fails($$select public.vienna_create_trip('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', null)$$, 'permission denied');
select vtest.fails(format('select public.vienna_admin_reset_trip(%L)', :'TA'), 'permission denied');
-- Storage: keine Policy für Eltern → weder lesen noch schreiben in Vienna-Buckets.
select vtest.fails(format($$insert into storage.objects(bucket_id, name) values ('vienna-day', 'trips/%s/day/spa-x.jpg')$$, :'trip_a'), 'row-level security');
select vtest.fails(format($$insert into storage.objects(bucket_id, name) values ('vienna-memories', 'trips/%s/family/x.jpg')$$, :'trip_a'), 'row-level security');
reset role;

\echo '--- 2. Edge Function (service_role): Upload-Tickets, fremde Trips, Limits'
set role service_role;
select public.vienna_media_issue_upload(:'TA', :'DEV1', 'morning') ->> 'path' as path_a \gset
select vtest.ok(:'path_a' ~ ('^trips/' || :'trip_a' || '/day/morning-[0-9a-f]{32}\.jpg$'), 'Pfad serverseitig erzeugt');
select vtest.fails(format('select public.vienna_media_issue_upload(%L, %L, %L)', :'TA', :'DEV1', '../x'), 'invalid_chapter');
select vtest.fails(format('select public.vienna_media_issue_upload(%L, %L, %L)', 'wrongwrongwrongwrongwrongwrong', :'DEV1', 'spa'), '^invalid_token$');
-- Fremder Trip kann das Ticket von Trip A nicht einlösen.
select vtest.fails(format('select public.vienna_media_confirm_upload(%L, %L, %L, %L, now())', :'TB', :'DEVB', 'morning', :'path_a'), 'invalid_upload');
-- Falsches Kapitel / frei erfundener Pfad.
select vtest.fails(format('select public.vienna_media_confirm_upload(%L, %L, %L, %L, now())', :'TA', :'DEV1', 'spa', :'path_a'), 'invalid_upload');
select vtest.fails(format('select public.vienna_media_confirm_upload(%L, %L, %L, %L, now())', :'TA', :'DEV1', 'morning', 'trips/' || :'trip_a' || '/day/morning-evil.jpg'), 'invalid_upload');
select vtest.ok(public.vienna_media_confirm_upload(:'TA', :'DEV1', 'morning', :'path_a', now()) is null, 'erster Upload bestätigt');
-- Ticket nur einmal verwendbar.
select vtest.fails(format('select public.vienna_media_confirm_upload(%L, %L, %L, %L, now())', :'TA', :'DEV1', 'morning', :'path_a'), 'invalid_upload');
-- Ersetzen gibt alten Pfad zurück.
select public.vienna_media_issue_upload(:'TA', :'DEV2', 'morning') ->> 'path' as path_a2 \gset
select vtest.ok(public.vienna_media_confirm_upload(:'TA', :'DEV2', 'morning', :'path_a2', now()) = :'path_a', 'ersetzter Pfad zurückgegeben');
-- Abgelaufenes Ticket (> 2 h).
select public.vienna_media_issue_upload(:'TA', :'DEV1', 'spa') ->> 'path' as path_old \gset
reset role;
update vienna.upload_tickets set issued_at = now() - interval '3 hours' where path = :'path_old';
set role service_role;
select vtest.fails(format('select public.vienna_media_confirm_upload(%L, %L, %L, %L, now())', :'TA', :'DEV1', 'spa', :'path_old'), 'invalid_upload');
-- Lesen: nur eigene Pfade.
select vtest.ok(jsonb_array_length(public.vienna_media_readable(:'TA', :'DEV1', array[:'path_a2', 'trips/x/day/y.jpg'])) = 1, 'eigener Pfad lesbar');
select vtest.ok(public.vienna_media_readable(:'TA', :'DEV1', array[:'path_a2']) -> 0 ->> 'bucket' = 'vienna-day', 'Tagesfoto im Bucket vienna-day');
select vtest.ok(public.vienna_media_readable(:'TB', :'DEVB', array[:'path_a2']) = '[]', 'fremder Trip bekommt keine URL');
reset role;
set role anon;
select vtest.ok(public.vienna_join_trip(:'TB', :'DEVB') -> 'uploads' = '[]', 'Trip B sieht keine Daten von Trip A');
select vtest.ok(public.vienna_join_trip(:'TA', :'DEV1') -> 'uploads' -> 0 ->> 'path' = :'path_a2', 'Trip A sieht sein Foto');
reset role;
set role service_role;
-- Rate-Limit: max. 15 Tickets pro Gerät in 10 Minuten.
do $$ begin
  for i in 1..13 loop perform public.vienna_media_issue_upload('ZzYyXxWwVvUuTtSsRrQqPpOoNnMm9876', '0e6f6a3c-1b2d-4c5e-8f90-0000000000bb', 'spa'); end loop;
end $$;
select public.vienna_media_issue_upload(:'TB', :'DEVB', 'spa') is not null as t14 \gset
select public.vienna_media_issue_upload(:'TB', :'DEVB', 'spa') is not null as t15 \gset
select vtest.fails(format('select public.vienna_media_issue_upload(%L, %L, %L)', :'TB', :'DEVB', 'spa'), 'rate_limited');
reset role;

\echo '--- 3. Normaler eingeloggter User einer ANDEREN App (authenticated, kein Vienna-Admin)'
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false) \g /dev/null
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"evil@x.de","role":"authenticated"}', false) \g /dev/null
select vtest.ok(public.vienna_admin_whoami() ->> 'is_admin' = 'false', 'whoami: kein Admin');
select vtest.fails('select public.vienna_admin_overview()', 'forbidden');
select vtest.fails(format('select public.vienna_admin_set_asset(%L, %L, %L, %L)', :'trip_a', 'wedding', 'trips/' || :'trip_a' || '/family/wedding-1.jpg', 'image/jpeg'), 'forbidden');
select vtest.ok((select count(*) from vienna.trips) = 0, 'RLS: keine Trips sichtbar');
select vtest.ok((select count(*) from vienna.devices) = 0, 'RLS: keine Geräte sichtbar');
select vtest.ok((select count(*) from storage.objects where bucket_id like 'vienna-%') = 0, 'keine Vienna-Dateien sichtbar');
select vtest.fails(format($$insert into storage.objects(bucket_id, name) values ('vienna-memories', 'trips/%s/family/x.jpg')$$, :'trip_a'), 'row-level security');
select vtest.fails('select public.vienna_media_reset(''ZzYyXxWwVvUuTtSsRrQqPpOoNnMm9876'', ''0e6f6a3c-1b2d-4c5e-8f90-0000000000bb'')', 'permission denied');
-- Gefälschte Admin-Mail in einer anonymen Session (falls Anonymous Sign-ins je aktiviert würden).
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"admin@example.com","is_anonymous":true}', false) \g /dev/null
select vtest.fails('select public.vienna_admin_overview()', 'forbidden');
reset role;

\echo '--- 4. Vienna-Admin (E-Mail-Login + Eintrag in vienna.admins)'
set role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false) \g /dev/null
select set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","email":"Admin@Example.com","is_anonymous":false}', false) \g /dev/null
select vtest.ok(public.vienna_admin_whoami() ->> 'is_admin' = 'true', 'Admin erkannt (E-Mail case-insensitive)');
select public.vienna_admin_send_message(:'trip_a', 'Видимо да сте преживели тенис 😄', true) as msg_id \gset
select vtest.ok(jsonb_array_length(public.vienna_admin_overview()) = 2, 'Admin sieht beide Trips');
select vtest.ok(jsonb_array_length((select t from jsonb_array_elements(public.vienna_admin_overview()) t where t ->> 'trip_id' = :'trip_a') -> 'members') = 2, 'zwei Geräte im Dashboard');
select vtest.ok((select count(*) from vienna.devices where trip_id = :'trip_a') = 2, 'Admin-RLS: Geräte lesbar');
select vtest.fails('select token_hash from vienna.trips', 'permission denied');
select vtest.ok(public.vienna_admin_set_asset(:'trip_a', 'familyCurrent', 'trips/' || :'trip_a' || '/family/familyCurrent-1.jpg', 'image/jpeg') is null, 'Asset gesetzt');
select vtest.fails(format('select public.vienna_admin_set_asset(%L, %L, %L, %L)', :'trip_a', 'wedding', 'trips/' || :'trip_a' || '/day/x.jpg', 'image/jpeg'), 'invalid_path');
select vtest.fails(format('select public.vienna_admin_set_asset(%L, %L, %L, %L)', :'trip_a', 'wedding', 'trips/' || :'trip_b' || '/family/wedding-1.jpg', 'image/jpeg'), 'invalid_path');
select public.vienna_admin_update_asset_meta(:'trip_a', 'gradskiKlub', 'Градски клуб', 'Gradski Klub', '1989', 'Ниш', '');
insert into storage.objects(bucket_id, name) values ('vienna-memories', 'trips/' || :'trip_a' || '/family/familyCurrent-1.jpg');
select vtest.fails($$insert into storage.objects(bucket_id, name) values ('vienna-day', 'trips/x/day/evil.jpg')$$, 'row-level security');
select vtest.fails($$insert into storage.objects(bucket_id, name) values ('avatars', 'evil.png')$$, 'row-level security');
reset role;

\echo '--- 5. Eltern sehen Nachricht, Asset, Metadaten; Reset'
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false) \g /dev/null
select vtest.ok(public.vienna_join_trip(:'TA', :'DEV1') -> 'messages' -> 0 ->> 'body' like 'Видимо%', 'Nachricht kommt an');
select vtest.ok((select a ->> 'caption_sr' from jsonb_array_elements(public.vienna_join_trip(:'TA', :'DEV1') -> 'assets') a where a ->> 'slot' = 'gradskiKlub') = 'Градски клуб', 'Metadaten kommen an');
select public.vienna_mark_message_read(:'TA', :'DEV1', :'msg_id');
-- Trip B kann die Nachricht von Trip A nicht als gelesen markieren.
select public.vienna_mark_message_read(:'TB', :'DEVB', :'msg_id');
reset role;
select vtest.ok((select read_at is not null from vienna.messages where id = :'msg_id'), 'gelesen markiert');
set role service_role;
select vtest.ok(public.vienna_media_readable(:'TA', :'DEV1', array['trips/' || :'trip_a' || '/family/familyCurrent-1.jpg']) -> 0 ->> 'bucket' = 'vienna-memories', 'Asset lesbar aus vienna-memories');
select vtest.ok(cardinality(public.vienna_media_reset(:'TA', :'DEV1')) >= 2, 'Reset liefert Tagesfoto-Pfade');
reset role;
set role anon;
select vtest.ok(public.vienna_join_trip(:'TA', :'DEV1') ->> 'phase' = 'opening', 'nach Reset: Anfang');
select vtest.ok(public.vienna_join_trip(:'TA', :'DEV1') ->> 'reset_at' is not null, 'Reset-Zeitpunkt für andere Geräte sichtbar');
select vtest.ok(jsonb_array_length(public.vienna_join_trip(:'TA', :'DEV1') -> 'assets') = 2, 'Familien-Assets bleiben');
select vtest.ok(public.vienna_join_trip(:'TB', :'DEVB') ->> 'phase' = 'opening', 'Trip B unberührt');
reset role;

\echo '--- 6. Rechte-Inventar: keine Vienna-Funktion ist breiter freigegeben als vorgesehen'
select vtest.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'vienna\_media\_%'
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))), 'Media-Funktionen nur service_role');
select vtest.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('vienna_create_trip', 'vienna_admin_reset_trip')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute'))), 'SQL-only-Funktionen für keine API-Rolle');
select vtest.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'vienna\_admin\_%' and has_function_privilege('anon', p.oid, 'execute')), 'Admin-Funktionen nicht für anon');
select vtest.ok(not has_schema_privilege('anon', 'vienna', 'usage'), 'anon hat kein Usage auf Schema vienna');
select vtest.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'vienna\_%' and not p.prosecdef), 'alle Vienna-RPCs security definer');
select vtest.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'vienna') and (p.proname like 'vienna\_%' or n.nspname = 'vienna')
     and not coalesce(p.proconfig, '{}') @> array['search_path=""']), 'alle Vienna-Funktionen mit leerem search_path');

drop schema vtest cascade;
\o
\echo 'ALL VIENNA SECURITY TESTS PASSED'
