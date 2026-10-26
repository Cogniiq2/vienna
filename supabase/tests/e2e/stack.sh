#!/usr/bin/env bash
# Lokaler Supabase-ähnlicher Stack für den E2E-Test von Option B (ohne Supabase CLI, nur Docker + Node + psql):
#   supabase/postgres · PostgREST · storage-api · edge-runtime (vienna-media) · Mini-Gateway (statt Kong)
#
#   supabase/tests/e2e/stack.sh up      # Stack starten, fremde Testobjekte + Migration + zwei Trips anlegen
#   supabase/tests/e2e/stack.sh run     # App bauen, Preview starten, Playwright-Szenario ausführen
#   supabase/tests/e2e/stack.sh down
# Edge Runtime läuft mit --network host (lädt npm:@supabase/supabase-js über den Host-Proxy, falls gesetzt).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
export STACK_DIR=${STACK_DIR:-$HERE/.stack}
mkdir -p "$STACK_DIR/files"
SECRET=super-secret-jwt-token-with-at-least-32-characters-long
export PGPASSWORD=postgres
export PGOPTIONS="-c client_min_messages=warning"
PSQL="psql -h localhost -p 55432 -d postgres -qtAX -v ON_ERROR_STOP=1"

case "${1:-}" in
up)
  ANON=$(node "$HERE/jwt.mjs" '{"role":"anon","iss":"supabase"}')
  SERVICE=$(node "$HERE/jwt.mjs" '{"role":"service_role","iss":"supabase"}')
  printf 'ANON=%s\nSERVICE=%s\n' "$ANON" "$SERVICE" > "$STACK_DIR/keys.env"
  docker network create vnet >/dev/null 2>&1 || true
  docker run -d --name vdb --network vnet -p 55432:5432 -e POSTGRES_PASSWORD=postgres -e JWT_SECRET=$SECRET supabase/postgres:15.8.1.085 >/dev/null
  until docker exec vdb pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 2; done; sleep 3
  # Wie im gehosteten Projekt (GoTrue-Migrationen): moderne auth.uid()/auth.jwt(), Passwörter für Dienste.
  $PSQL -U supabase_admin -c "
    create or replace function auth.uid() returns uuid language sql stable as \$\$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid \$\$;
    create or replace function auth.jwt() returns jsonb language sql stable as \$\$ select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb \$\$;
    grant execute on function auth.jwt() to anon, authenticated, service_role;
    alter role authenticator with password 'postgres'; alter role supabase_storage_admin with password 'postgres'; alter role postgres with password 'postgres';
    insert into auth.users (id, email, aud, role) values ('99999999-9999-9999-9999-999999999999', 'admin@example.com', 'authenticated', 'authenticated');"
  docker run -d --name vrest --network vnet -p 53000:3000 -e PGRST_DB_URI=postgres://authenticator:postgres@vdb:5432/postgres \
    -e PGRST_DB_SCHEMAS=public,storage,graphql_public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET=$SECRET postgrest/postgrest:v12.2.12 >/dev/null
  docker run -d --name vstorage --network vnet -p 55000:5000 -v "$STACK_DIR/files:/var/lib/storage" -e ANON_KEY=$ANON -e SERVICE_KEY=$SERVICE \
    -e POSTGREST_URL=http://vrest:3000 -e PGRST_JWT_SECRET=$SECRET -e AUTH_JWT_SECRET=$SECRET \
    -e DATABASE_URL=postgres://supabase_storage_admin:postgres@vdb:5432/postgres -e FILE_SIZE_LIMIT=52428800 -e STORAGE_BACKEND=file \
    -e FILE_STORAGE_BACKEND_PATH=/var/lib/storage -e TENANT_ID=stub -e REGION=stub -e GLOBAL_S3_BUCKET=stub -e ENABLE_IMAGE_TRANSFORMATION=false \
    -e DB_INSTALL_ROLES=false supabase/storage-api:v1.25.7 >/dev/null
  sleep 8
  # Simulierte fremde App mit der kritischen Policy aus dem echten Projekt (authenticated → using true).
  $PSQL -U postgres -c "
    create table public.capabilities (id serial primary key, name text); insert into public.capabilities(name) values ('foreign-secret');
    alter table public.capabilities enable row level security;
    create policy capabilities_select_authenticated on public.capabilities for select to authenticated using (true);
    grant select on public.capabilities to anon, authenticated;"
  $PSQL -U postgres -f "$ROOT/supabase/migrations/20261026000000_vienna_module.sql" >/dev/null
  $PSQL -U postgres -c "insert into vienna.admins(email) values ('admin@example.com');
    select public.vienna_create_trip('E2eTripTokenAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'Mama & Tata · Wien');
    select public.vienna_create_trip('E2eForeignTripBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'Fremd');" >/dev/null
  docker restart vrest >/dev/null
  docker run -d --name vfn --network host -v "$ROOT/supabase/functions:/home/deno/functions:ro" \
    ${HTTPS_PROXY:+-e HTTPS_PROXY=$HTTPS_PROXY -e HTTP_PROXY=$HTTPS_PROXY} -e NO_PROXY=localhost,127.0.0.1 \
    ${DENO_CERT:+-v $DENO_CERT:/ca.crt:ro -e DENO_CERT=/ca.crt} \
    -e SUPABASE_URL=http://127.0.0.1:54321 -e SUPABASE_SERVICE_ROLE_KEY=$SERVICE \
    -e VIENNA_ALLOWED_ORIGINS=http://localhost:4173,https://*.vienna-gift.pages.dev -e VIENNA_ALLOW_RESET=true \
    supabase/edge-runtime:v1.69.6 start --main-service /home/deno/functions/vienna-media -p 59000 >/dev/null
  nohup node "$HERE/gateway.mjs" > "$STACK_DIR/gateway.log" 2>&1 < /dev/null &
  echo $! > "$STACK_DIR/gateway.pid"
  echo "Stack läuft: Gateway http://localhost:54321"
  ;;
run)
  source "$STACK_DIR/keys.env"
  (cd "$ROOT" && VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=$ANON VITE_ENABLE_DEBUG=true npx vite build --outDir "$STACK_DIR/dist" >/dev/null)
  setsid bash -c "cd '$ROOT' && exec npx vite preview --outDir '$STACK_DIR/dist' --port 4173 --strictPort" > "$STACK_DIR/preview.log" 2>&1 < /dev/null &
  PREVIEW=$!
  sleep 3
  status=0
  NODE_PATH=${NODE_PATH:-$(npm root -g)} node "$HERE/flow.cjs" || status=$?
  kill -- -"$PREVIEW" 2>/dev/null || true
  exit $status
  ;;
down)
  [ -f "$STACK_DIR/gateway.pid" ] && kill "$(cat "$STACK_DIR/gateway.pid")" 2>/dev/null || true
  docker rm -f vfn vstorage vrest vdb >/dev/null 2>&1 || true
  docker network rm vnet >/dev/null 2>&1 || true
  ;;
*) echo "usage: $0 up|run|down"; exit 1 ;;
esac
