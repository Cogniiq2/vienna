#!/usr/bin/env bash
# Führt beide Migrationen + Sicherheitstests gegen ein lokales, leeres Postgres 16 aus.
#   PGHOST=/pfad/zum/socket PGPORT=5499 ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
DB=vienna_test_$$
psql -U postgres -q -c "create database $DB"
trap 'psql -U postgres -q -c "drop database $DB"' EXIT
psql -U postgres -q -d "$DB" -v ON_ERROR_STOP=1 -f supabase_stub.sql
psql -U postgres -q -d "$DB" -v ON_ERROR_STOP=1 -f ../migrations/20261024000000_vienna_gift.sql
psql -U postgres -q -d "$DB" -v ON_ERROR_STOP=1 -f ../migrations/20261025000000_story_admin_messages.sql
psql -U postgres -d "$DB" -f security_test.sql
