-- Sicherheitstests. ERWARTET: jede Zeile "ERROR: forbidden / permission denied / violates row-level security / invalid_token / check constraint"
-- ist ein bestandener Test (Zugriff wurde korrekt verweigert). Ausführen: supabase/tests/run.sh
\set ON_ERROR_STOP 0
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222'), ('99999999-9999-9999-9999-999999999999');
insert into private.admins values ('admin@example.com');
select public.create_trip('AbCdEfGhIjKlMnOpQrStUvWxYz012345', 'Test') as trip_id \gset
set role authenticated;
-- Elterngerät (anonym)
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","is_anonymous":true}', false);
select (public.join_trip('AbCdEfGhIjKlMnOpQrStUvWxYz012345', 'iPhone · Safari') - 'uploads' - 'responses') as joined;
select public.save_progress(:'trip_id', 'journey', array['morning'], array['interlude:gradskiKlub','bad key!'], now(), null, 'sr') -> 'seen' as seen;
select public.save_response(:'trip_id', 'morning.firstAwake', 'mother', now());
select public.save_response(:'trip_id', 'evil; drop', 'x', now());
\echo '--- Eltern dürfen nicht admin'
select public.admin_overview();
select public.admin_send_message(:'trip_id', 'hack', true);
select count(*) as parent_sees_uploads_via_table from public.uploads;
select count(*) as parent_sees_trips from public.trips;
\echo '--- Fremder Nicht-Admin mit E-Mail'
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","email":"evil@x.de","is_anonymous":false}', false);
select public.admin_whoami();
select public.admin_overview();
\echo '--- Anonymer mit gefälschter Admin-Mail im Claim (is_anonymous=true)'
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","email":"admin@example.com","is_anonymous":true}', false);
select public.admin_overview();
\echo '--- Admin'
select set_config('request.jwt.claim.sub','99999999-9999-9999-9999-999999999999', false);
select set_config('request.jwt.claims','{"sub":"99999999-9999-9999-9999-999999999999","email":"Admin@Example.com","is_anonymous":false}', false);
select public.admin_whoami();
select public.admin_send_message(:'trip_id', 'Видимо да сте преживели тенис 😄', true) as msg_id \gset
select jsonb_array_length(public.admin_overview()) as trips, public.admin_overview()->0->'members' as members;
select count(*) as admin_sees_trips from public.trips;
select token_hash from public.trips;
select public.admin_set_asset(:'trip_id', 'wedding', :'trip_id' || '/wedding-1.jpg', 'image/jpeg');
select public.admin_set_asset(:'trip_id', 'wedding', :'trip_id' || '/wedding-2.jpg', 'image/jpeg') as replaced;
insert into storage.objects(bucket_id, name) values ('family', :'trip_id' || '/wedding-2.jpg');
\echo '--- Eltern sehen Nachricht + Asset, lesen Nachricht'
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","is_anonymous":true}', false);
select j->'messages' as messages, j->'assets' as assets from (select public.join_trip('AbCdEfGhIjKlMnOpQrStUvWxYz012345', 'iPhone · Safari') j) x;
select public.mark_message_read(:'trip_id', :'msg_id');
select count(*) as parent_sees_family_asset from storage.objects where bucket_id='family';
insert into storage.objects(bucket_id, name) values ('family', :'trip_id' || '/evil.jpg');
select public.reset_trip(:'trip_id');
select j->'seen' seen, j->'messages' messages, j->'assets' assets from (select public.join_trip('AbCdEfGhIjKlMnOpQrStUvWxYz012345', null) j) x;
reset role;
select device, last_seen_at is not null as seen from public.trip_members;
\echo '--- Fremdes Gerät (nicht beigetreten) sieht keine Fotos und kann nichts schreiben'
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","is_anonymous":true}', false);
select count(*) as stranger_sees_objects from storage.objects;
select public.save_progress(:'trip_id', 'finale', array['dinner'], null, null, null, 'sr');
select public.join_trip('wrongwrongwrongwrongwrongwrong', null);
reset role;
