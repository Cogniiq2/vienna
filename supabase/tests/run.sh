#!/usr/bin/env bash
# Prüft das Vienna-Modul gegen ein lokales, leeres Postgres (15/16) mit Supabase-Stub:
#  1. legt simulierte FREMDE Produktivobjekte an (foreign_objects.sql)
#  2. führt die Migration zweimal aus (Idempotenz)
#  3. vergleicht die fremden Objekte vorher/nachher (nur Vienna-Ergänzungen erlaubt)
#  4. führt die selbstprüfenden Sicherheitstests aus
#  5. Deinstallation → fremde Objekte exakt wie vorher
#  6. Guard: fremdes Schema `vienna` / fremde vienna_-Funktion / fremder Bucket → Abbruch ohne Änderung
#   PGHOST=/pfad/zum/socket PGPORT=5499 ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
TMP=$(mktemp -d)
export PGOPTIONS="-c client_min_messages=error"
PSQL="psql -U postgres -q -X"
DBS=()
cleanup() { for db in "${DBS[@]}"; do $PSQL -c "drop database if exists $db" >/dev/null; done; rm -rf "$TMP"; }
trap cleanup EXIT
newdb() { local db="vienna_test_$$_$1"; DBS+=("$db"); $PSQL -c "create database $db"; $PSQL -d "$db" -v ON_ERROR_STOP=1 -f supabase_stub.sql >/dev/null; $PSQL -d "$db" -v ON_ERROR_STOP=1 -f foreign_objects.sql >/dev/null; echo "$db"; }
MIGRATION=../migrations/20261026000000_vienna_module.sql

DB=$(newdb main)
$PSQL -d "$DB" -tA -f foreign_snapshot.sql > "$TMP/before.txt"
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -f $MIGRATION 2>/dev/null
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -f $MIGRATION 2>/dev/null
echo "OK  Migration zweimal ausgeführt (idempotent)"
$PSQL -d "$DB" -tA -f foreign_snapshot.sql > "$TMP/after.txt"
echo "=== Fremde Objekte vorher/nachher (erlaubt: nur hinzugefügte vienna_*-Storage-Policies und vienna.*-Realtime-Tabellen):"
diff "$TMP/before.txt" "$TMP/after.txt" || true

echo "=== Sicherheitstests"
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -f security_test.sql

echo "=== Deinstallation"
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -c "delete from storage.objects where bucket_id in ('vienna-day','vienna-memories')" >/dev/null
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -f ../uninstall_vienna_module.sql
$PSQL -d "$DB" -tA -f foreign_snapshot.sql > "$TMP/uninstalled.txt"
diff "$TMP/before.txt" "$TMP/uninstalled.txt" && echo "OK  nach Deinstallation exakt wie vorher"
test "$($PSQL -d "$DB" -tA -c "select count(*) from pg_namespace where nspname='vienna'")" = 0
test "$($PSQL -d "$DB" -tA -c "select count(*) from storage.buckets where id like 'vienna-%'")" = 0

echo "=== Guard"
guard() {
  local name=$1 sql=$2 db
  db=$(newdb "$name")
  $PSQL -d "$db" -v ON_ERROR_STOP=1 -c "$sql" >/dev/null
  $PSQL -d "$db" -tA -f foreign_snapshot.sql > "$TMP/g_before.txt"
  if $PSQL -d "$db" -v ON_ERROR_STOP=1 -f $MIGRATION >/dev/null 2>"$TMP/g_err.txt"; then
    echo "FAIL Guard $name: Migration lief durch"; exit 1
  fi
  $PSQL -d "$db" -tA -f foreign_snapshot.sql > "$TMP/g_after.txt"
  diff "$TMP/g_before.txt" "$TMP/g_after.txt" >/dev/null || { echo "FAIL Guard $name: Objekte verändert"; exit 1; }
  test "$($PSQL -d "$db" -tA -c "select count(*) from pg_proc where proname like 'vienna\_%'")" = "$3" || { echo "FAIL Guard $name: Funktionen angelegt"; exit 1; }
  echo "OK  Guard $name: $(grep -o 'Abbruch[^.]*' "$TMP/g_err.txt" | head -1)"
}
guard schema "create schema vienna; create table vienna.foo(id int);" 0
guard function "create function public.vienna_join_trip(text) returns text language sql as \$\$ select 'x' \$\$;" 1
guard bucket "insert into storage.buckets (id, name, public) values ('vienna-day', 'vienna-day', true);" 0
guard policy "create policy vienna_admin_read on storage.objects for select using (true);" 0
echo "ALL VIENNA DATABASE CHECKS PASSED"
