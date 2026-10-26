select 'private.admins rows=' || count(*) from private.admins
union all select 'private.secret exec authenticated=' || has_function_privilege('authenticated','private.secret()','execute')
union all select 'public.trips rows=' || count(*) from public.trips
union all select 'public.messages policies=' || count(*) from pg_policies where schemaname='public' and tablename='messages'
union all select 'public.messages select authenticated=' || has_table_privilege('authenticated','public.messages','select')
union all select 'public.join_trip=' || public.join_trip('x')
union all select 'avatars public=' || public::text from storage.buckets where id='avatars'
union all select 'storage policies=' || string_agg(policyname, ',' order by policyname) from pg_policies where schemaname='storage'
union all select 'realtime=' || string_agg(schemaname||'.'||tablename, ',' order by schemaname, tablename) from pg_publication_tables where pubname='supabase_realtime'
union all select 'extensions=' || string_agg(extname, ',' order by extname) from pg_extension;
