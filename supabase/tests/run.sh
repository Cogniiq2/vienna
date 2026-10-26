#!/usr/bin/env bash
# Prüft das Vienna-Modul gegen ein lokales, leeres Postgres 16:
#  1. legt simulierte FREMDE Produktivobjekte an (foreign_objects.sql)
#  2. führt die Migration zweimal aus (Idempotenz)
#  3. vergleicht die fremden Objekte vorher/nachher (muss identisch sein, bis auf Vienna-Ergänzungen)
#  4. führt die Sicherheitstests aus
#   PGHOST=/pfad/zum/socket PGPORT=5499 ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
DB=vienna_test_$$
PSQL="psql -U postgres -q -X"
$PSQL -c "create database $DB"
trap '$PSQL -c "drop database $DB"' EXIT
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -f supabase_stub.sql >/dev/null
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -f foreign_objects.sql
$PSQL -d "$DB" -tA -f foreign_snapshot.sql > /tmp/vienna_before.txt
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -f ../migrations/20261026000000_vienna_module.sql 2>/dev/null
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -f ../migrations/20261026000000_vienna_module.sql 2>/dev/null
$PSQL -d "$DB" -tA -f foreign_snapshot.sql > /tmp/vienna_after.txt
echo "=== Fremde Objekte vorher/nachher (nur hinzugefügte Vienna-Policies/Realtime-Tabellen erlaubt):"
diff /tmp/vienna_before.txt /tmp/vienna_after.txt || true
echo "=== Sicherheitstests"
$PSQL -d "$DB" -f security_test.sql
