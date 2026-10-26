-- Sicherheitstests für das Vienna-Modul. Ausführen: supabase/tests/run.sh
-- Jede Zeile "ERROR: forbidden / permission denied / violates row-level security / invalid_token / invalid_path"
-- ist ein BESTANDENER Test (Zugriff korrekt verweigert).
\set ON_ERROR_STOP 0
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222'), ('99999999-9999-9999-9999-999999999999');
insert into vienna.admins (email) values ('admin@example.com');
select public.vienna_create_trip('AbCdEfGhIjKlMnOpQrStUvWxYz012345', 'Test') as trip_id \gset
set role authenticated;

\echo '=== Eltern-Gerät (anonym)'
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","is_anonymous":true}', false) \g /dev/null
\echo 'erwartet ERROR invalid_token:'
select public.vienna_join_trip('wrongwrongwrongwrongwrongwrong', null);
select (public.vienna_join_trip('AbCdEfGhIjKlMnOpQrStUvWxYz012345', 'iPhone · Safari') ->> 'phase') as joined_phase;
select public.vienna_save_progress(:'trip_id', 'journey', array['mission','morning','bogus'], array['finale:letter','bad key'], now(), null, 'sr') -> 'completed' as completed;
select public.vienna_save_answer(:'trip_id', 'dinner.moment', 'Шетња уз Дунав', now());
select public.vienna_record_upload(:'trip_id', 'morning', 'trips/' || :'trip_id' || '/day/morning-a.jpg', now()) is null as first_upload;
\echo 'erwartet ERROR invalid_path (falscher Ordner):'
select public.vienna_record_upload(:'trip_id', 'morning', 'trips/' || :'trip_id' || '/family/x.jpg', now());
insert into storage.objects(bucket_id, name) values ('vienna-memories', 'trips/' || :'trip_id' || '/day/morning-a.jpg');
\echo 'erwartet ERROR row-level security (Eltern dürfen keine Familien-Assets hochladen):'
insert into storage.objects(bucket_id, name) values ('vienna-memories', 'trips/' || :'trip_id' || '/family/evil.jpg');
\echo 'erwartet ERROR forbidden (Admin-Funktionen):'
select public.vienna_admin_overview();
select public.vienna_admin_send_message(:'trip_id', 'hack', true);
\echo 'erwartet ERROR permission denied (Trip anlegen nur im SQL-Editor):'
select public.vienna_create_trip('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', null);
select count(*) as parent_sees_trips_table from vienna.trips;
\echo 'erwartet ERROR permission denied (Admin-Liste):'
select * from vienna.admins;

\echo '=== Fremdes Gerät (nicht beigetreten)'
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","is_anonymous":true}', false) \g /dev/null
select count(*) as stranger_sees_objects from storage.objects where bucket_id = 'vienna-memories';
\echo 'erwartet ERROR forbidden:'
select public.vienna_save_progress(:'trip_id', 'finale', array['dinner'], null, null, null, 'sr');
select public.vienna_reset_trip(:'trip_id');
\echo 'erwartet ERROR row-level security:'
insert into storage.objects(bucket_id, name) values ('vienna-memories', 'trips/' || :'trip_id' || '/day/x.jpg');

\echo '=== Nicht-Admin mit E-Mail / anonyme Session mit gefälschter Admin-Mail'
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","email":"evil@x.de","is_anonymous":false}', false) \g /dev/null
select public.vienna_admin_whoami();
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","email":"admin@example.com","is_anonymous":true}', false) \g /dev/null
\echo 'erwartet ERROR forbidden:'
select public.vienna_admin_overview();

\echo '=== Admin'
select set_config('request.jwt.claim.sub','99999999-9999-9999-9999-999999999999', false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"99999999-9999-9999-9999-999999999999","email":"Admin@Example.com","is_anonymous":false}', false) \g /dev/null
select public.vienna_admin_whoami();
select public.vienna_admin_send_message(:'trip_id', 'Видимо да сте преживели тенис 😄', true) as msg_id \gset
select jsonb_array_length(public.vienna_admin_overview()) as trips, public.vienna_admin_overview() -> 0 -> 'members' as members;
select count(*) as admin_sees_trips from vienna.trips;
\echo 'erwartet ERROR permission denied (token_hash bleibt auch für Admins verborgen):'
select token_hash from vienna.trips;
select public.vienna_admin_set_asset(:'trip_id', 'familyCurrent', 'trips/' || :'trip_id' || '/family/familyCurrent-1.jpg', 'image/jpeg') is null as first_asset;
select public.vienna_admin_set_asset(:'trip_id', 'familyCurrent', 'trips/' || :'trip_id' || '/family/familyCurrent-2.jpg', 'image/jpeg') as replaced;
\echo 'erwartet ERROR invalid_path (Asset im Tagesfoto-Ordner):'
select public.vienna_admin_set_asset(:'trip_id', 'wedding', 'trips/' || :'trip_id' || '/day/x.jpg', 'image/jpeg');
select public.vienna_admin_update_asset_meta(:'trip_id', 'gradskiKlub', 'Градски клуб', 'Gradski Klub', '1989', 'Ниш', '');
insert into storage.objects(bucket_id, name) values ('vienna-memories', 'trips/' || :'trip_id' || '/family/familyCurrent-2.jpg');

\echo '=== Eltern sehen Nachricht + Asset + Metadaten'
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","is_anonymous":true}', false) \g /dev/null
select j -> 'messages' -> 0 ->> 'body' as message, jsonb_array_length(j -> 'assets') as assets,
       (select a ->> 'caption_sr' from jsonb_array_elements(j -> 'assets') a where a ->> 'slot' = 'gradskiKlub') as caption
  from (select public.vienna_join_trip('AbCdEfGhIjKlMnOpQrStUvWxYz012345', null) j) x;
select public.vienna_mark_message_read(:'trip_id', :'msg_id');
select count(*) as parent_sees_vienna_objects from storage.objects where bucket_id = 'vienna-memories';
select public.vienna_reset_trip(:'trip_id') as reset_paths;
select j ->> 'phase' as phase_after_reset, jsonb_array_length(j -> 'assets') as assets_kept
  from (select public.vienna_join_trip('AbCdEfGhIjKlMnOpQrStUvWxYz012345', null) j) x;
reset role;
