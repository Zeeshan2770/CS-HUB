#!/usr/bin/env bash
# Builds a throwaway local Postgres DB, loads stubs + a copy of the CURRENT live schema,
# applies every migration, then runs the RLS/RPC tests. Needs a local Postgres (psql on PATH).
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${1:-cs12test}
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>&1 | grep -v NOTICE || true
for f in tests/00_stubs_supabase.sql schema.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" 2>&1 | grep -v NOTICE || true
done
psql -d "$DB" -f tests/02_rls_tests.sql 2>&1 | grep -v NOTICE
