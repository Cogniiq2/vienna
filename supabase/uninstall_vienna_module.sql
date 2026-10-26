-- =============================================================================
-- Entfernt das Vienna-Modul vollständig – und NUR das Vienna-Modul.
-- Läuft nur, wenn das Schema `vienna` die Markierung 'vienna-gift module' trägt.
-- ACHTUNG: löscht alle Vienna-Daten (Trips, Antworten, Nachrichten, Asset-Zuordnungen).
-- Die Dateien im Bucket `vienna-memories` vorher im Dashboard löschen (Storage → vienna-memories),
-- danach wird der leere Bucket hier entfernt.
-- =============================================================================
begin;

do $$
begin
  if coalesce(obj_description((select oid from pg_namespace where nspname = 'vienna'), 'pg_namespace'), '') <> 'vienna-gift module' then
    raise exception 'Schema vienna fehlt oder gehört nicht zu Vienna Gift – nichts wird entfernt.';
  end if;
end $$;

drop policy if exists vienna_memories_read         on storage.objects;
drop policy if exists vienna_memories_day_insert   on storage.objects;
drop policy if exists vienna_memories_day_delete   on storage.objects;
drop policy if exists vienna_memories_admin_insert on storage.objects;
drop policy if exists vienna_memories_admin_update on storage.objects;
drop policy if exists vienna_memories_admin_delete on storage.objects;

do $$
declare
  v_table text;
  v_fn    regprocedure;
begin
  for v_table in select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'vienna' loop
    execute format('alter publication supabase_realtime drop table vienna.%I', v_table);
  end loop;
  for v_fn in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'vienna\_%' and obj_description(p.oid, 'pg_proc') = 'vienna-gift module'
  loop
    execute format('drop function %s', v_fn);
  end loop;
end $$;

-- CASCADE wirkt hier nur innerhalb des eigenen Schemas `vienna`.
drop schema vienna cascade;

delete from storage.buckets
 where id = 'vienna-memories'
   and not exists (select 1 from storage.objects where bucket_id = 'vienna-memories');

commit;
