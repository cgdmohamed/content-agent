#!/bin/sh
# Proves a dump is restorable: restores it into a throwaway database, runs sanity queries, drops it.
# Usage: restore-check.sh /path/to/plain.dump   (uses PGHOST/PGUSER/PGPASSWORD; needs CREATEDB)
set -eu
. "$(dirname "$0")/lib.sh"

dump="${1:?usage: restore-check.sh <plain pg_dump custom-format file>}"
db="content_agent_restore_check_$$"
ADMIN_DB="${PGMAINTENANCE_DB:-postgres}"

cleanup() {
  psql -X -q -d "$ADMIN_DB" -c "DROP DATABASE IF EXISTS \"$db\"" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql -X -q -d "$ADMIN_DB" -c "CREATE DATABASE \"$db\"" >/dev/null
pg_restore --no-owner --exit-on-error -d "$db" "$dump"

tables=$(psql -X -At -d "$db" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
migrations=$(psql -X -At -d "$db" -c "SELECT count(*) FROM schema_migrations")
users=$(psql -X -At -d "$db" -c "SELECT count(*) FROM users")

if [ "$tables" -lt 8 ] || [ "$migrations" -lt 1 ]; then
  log error "restore check failed: tables=$tables migrations=$migrations"
  exit 1
fi
log info "restore check passed: tables=$tables migrations=$migrations users=$users"
