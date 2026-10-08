#!/usr/bin/env bash
# Build a scratch database, apply 0001, and try to break the wall
# between two accounts.
#
#   ./gis-app/test/run.sh
#
# Needs a local Postgres. Override with PGHOST/PGPORT/PGUSER if yours
# is not the one this was written against.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGHOST="${PGHOST:-/tmp/pgs}"
PGPORT="${PGPORT:-5444}"
PGUSER="${PGUSER:-claude}"
DB="${DB:-gisnew}"
psql() { "$PGBIN/psql" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }

# A clean database every time. The fixtures are not idempotent — a
# second run would collide on Project_Ref — and a test that quietly
# reuses last run's state is a test that stops testing.
psql -d postgres -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"

# Stand in for Supabase. auth.uid() reads the signed-in user from the
# request's JWT there; here it reads a session setting the test sets.
psql -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END $$;
SQL

psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$HERE/../migrations/0001_accounts_and_gis.sql"

# app_user gets ordinary table rights. RLS then decides which ROWS, and
# that is what is under test. It must NOT own the tables: an owner
# bypasses RLS, and testing as the owner proves nothing.
psql -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
GRANT USAGE ON SCHEMA public, auth TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, auth TO app_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
SQL

echo
echo "Applied 0001: $(psql -d "$DB" -tAc "
  SELECT (SELECT count(*) FROM pg_tables WHERE schemaname='public')
      || ' tables, '
      || (SELECT count(*) FROM pg_policies WHERE schemaname='public')
      || ' policies'")"

psql -d "$DB" -f "$HERE/isolation.sql" 2>&1 | grep -vE '^(SET|RESET|Pager)'

echo
echo "────────────────────────────────────────────────────────────────"
echo "Read the output rather than the exit code. Blocks 4, 5, 7 and 8"
echo "are SUPPOSED to print ERROR — that is the wall holding. Block 9"
echo "is the check that none of them wrote anything: one feature per"
echo "account, named as they were created."
