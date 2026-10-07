#!/bin/sh
# Restore a backup. Safe by default: restores into a NEW database so you can inspect it before switching.
#
#   restore.sh <backup file> [target database]
#
# Encrypted backups (.age) need AGE_IDENTITY_FILE (the private key you kept offline).
# Restoring over the live database needs CONFIRM_OVERWRITE=yes (stop the api and worker first).
set -eu
. "$(dirname "$0")/lib.sh"

file="${1:?usage: restore.sh <backup file> [target database]}"
target="${2:-content_agent_restored}"
live="${PGDATABASE:-content_agent}"
ADMIN_DB="${PGMAINTENANCE_DB:-postgres}"
work="$(mktemp -d)"
decrypted="$work/restore.dump"
cleanup() {
  [ ! -f "$decrypted" ] || rm -f -- "$decrypted"
  rmdir "$work" 2>/dev/null || true
}
trap cleanup EXIT

[ -f "$file" ] || { log error "backup file not found: $file"; exit 1; }

if [ -f "$file.sha256" ]; then
  (cd "$(dirname "$file")" && sha256sum -c "$(basename "$file").sha256" >/dev/null) || { log error "checksum mismatch: the backup is corrupted"; exit 1; }
  log info "checksum verified"
else
  log warn "no .sha256 next to the backup: integrity not verified"
fi

dump="$file"
case "$file" in
  *.age)
    [ -n "${AGE_IDENTITY_FILE:-}" ] || { log error "AGE_IDENTITY_FILE is required to decrypt $file"; exit 1; }
    age -d -i "$AGE_IDENTITY_FILE" -o "$decrypted" "$file" || { log error "decryption failed"; exit 1; }
    dump="$decrypted"
    ;;
esac

if [ "$target" = "$live" ]; then
  [ "${CONFIRM_OVERWRITE:-}" = "yes" ] || { log error "refusing to overwrite the live database $live without CONFIRM_OVERWRITE=yes"; exit 1; }
  pg_restore --clean --if-exists --no-owner --exit-on-error -d "$live" "$dump"
  log info "restored over live database $live"
else
  exists=$(psql -X -At -d "$ADMIN_DB" -c "SELECT 1 FROM pg_database WHERE datname = '$target'")
  [ -z "$exists" ] || { log error "database $target already exists; choose another name or drop it first"; exit 1; }
  psql -X -q -d "$ADMIN_DB" -c "CREATE DATABASE \"$target\"" >/dev/null
  pg_restore --no-owner --exit-on-error -d "$target" "$dump"
  log info "restored into new database $target. Inspect it, then point DATABASE_URL at it or rename it."
fi
