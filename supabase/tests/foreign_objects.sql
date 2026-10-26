-- Simuliert fremde, produktive Objekte eines All-in-One-Projekts (dürfen nie verändert werden).
-- Simuliert ein produktives All-in-One-Projekt mit fremden Objekten
create schema private;
create table private.admins (email text primary key, app text);
insert into private.admins values ('someone@other.app', 'crm');
create function private.secret() returns int language sql as $$ select 42 $$;
grant usage on schema private to authenticated;
grant execute on function private.secret() to authenticated;
create table public.trips (id serial primary key, name text);
insert into public.trips (name) values ('Fremder Trip');
create table public.messages (id serial primary key, body text);
alter table public.messages enable row level security;
create policy "other app read" on public.messages for select to authenticated using (true);
grant select on public.messages to authenticated;
create function public.join_trip(text) returns text language sql as $$ select 'fremd' $$;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
create policy "avatars public read" on storage.objects for select to anon using (bucket_id = 'avatars');
alter publication supabase_realtime add table public.messages;
