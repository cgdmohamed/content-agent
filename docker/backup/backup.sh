#!/bin/sh
# One backup run: dump -> verify -> (restore test) -> encrypt -> checksum -> store -> prune -> upload -> status.
set -eu
. "$(dirname "$0")/lib.sh"

KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-4}"
HERE="$(dirname "$0")"

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/tmp"
stamp=$(date -u +%Y%m%d_%H%M%S)
raw="$BACKUP_DIR/tmp/content_agent_$stamp.dump"
final=""

failed() {
  remove_backup_file "$raw" || true
  remove_backup_file "$raw.age" || true
  remove_backup_file "$raw.age.sha256" || true
  remove_backup_file "$raw.sha256" || true
  log error "backup failed: $1"
  write_status fail "" 0 "$1"
  ping_monitor "/fail"
  exit 1
}

ping_monitor "/start"
log info "backup started (database ${PGDATABASE:-?} on ${PGHOST:-local})"

# Refuse to ship an unencrypted dump off the host: it contains user emails, password hashes and encrypted site secrets.
if [ -n "${BACKUP_S3_BUCKET:-}" ] && [ -z "${BACKUP_AGE_RECIPIENT:-}" ] && [ "${BACKUP_ALLOW_PLAINTEXT_UPLOAD:-false}" != "true" ]; then
  failed "BACKUP_S3_BUCKET is set but BACKUP_AGE_RECIPIENT is not; refusing to upload an unencrypted dump (set BACKUP_ALLOW_PLAINTEXT_UPLOAD=true to override)"
fi

pg_dump --format=custom --compress=6 --no-owner --file "$raw" || failed "pg_dump failed"

[ -s "$raw" ] || failed "dump is empty"
listing=$(pg_restore --list "$raw") || failed "pg_restore --list could not read the dump"
printf '%s\n' "$listing" | grep -q "TABLE public schema_migrations" || failed "dump has no schema_migrations table (wrong database?)"
printf '%s\n' "$listing" | grep -q "TABLE DATA public users" || failed "dump has no users data entry"

# A full restore test is slower, so it runs on Sundays (or always with BACKUP_FULL_VERIFY=always, never with =never).
verify_mode="${BACKUP_FULL_VERIFY:-weekly}"
if [ "$verify_mode" = "always" ] || { [ "$verify_mode" = "weekly" ] && [ "$(date -u +%u)" = "7" ]; }; then
  sh "$HERE/restore-check.sh" "$raw" || failed "restore test failed: the dump cannot be restored"
fi

if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "$raw.age" "$raw" || failed "encryption failed (check BACKUP_AGE_RECIPIENT)"
  remove_backup_file "$raw"
  final="$raw.age"
else
  log warn "BACKUP_AGE_RECIPIENT not set: backup is stored unencrypted"
  final="$raw"
fi

name=$(basename "$final")
(cd "$BACKUP_DIR/tmp" && sha256sum "$name" >"$name.sha256") || failed "checksum failed"
bytes=$(wc -c <"$final" | tr -d ' ')

mv "$final" "$final.sha256" "$BACKUP_DIR/daily/"
if [ "$(date -u +%u)" = "7" ]; then
  cp "$BACKUP_DIR/daily/$name" "$BACKUP_DIR/daily/$name.sha256" "$BACKUP_DIR/weekly/"
fi

# Keep the newest $2 dumps of a folder; each dump is removed together with its checksum.
prune() {
  dir="$1"
  keep="$2"
  ls -1t "$dir" | grep -E '^content_agent_.*\.(dump|age)$' | tail -n +"$((keep + 1))" | while read -r old; do
    remove_backup_file "$dir/$old"
    remove_backup_file "$dir/$old.sha256"
    log info "pruned $old from $dir"
  done
}
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  endpoint=""
  [ -n "${BACKUP_S3_ENDPOINT:-}" ] && endpoint="--endpoint-url $BACKUP_S3_ENDPOINT"
  dest="s3://$BACKUP_S3_BUCKET/${BACKUP_S3_PREFIX:-content-agent}/"
  # shellcheck disable=SC2086
  aws $endpoint s3 cp "$BACKUP_DIR/daily/$name" "$dest" --only-show-errors || failed "upload to $dest failed (local copy kept)"
  # shellcheck disable=SC2086
  aws $endpoint s3 cp "$BACKUP_DIR/daily/$name.sha256" "$dest" --only-show-errors || failed "checksum upload to $dest failed"
  log info "uploaded $name to $dest"
fi

write_status ok "$name" "$bytes" "backup completed"
log info "backup completed: $name ($bytes bytes)"
ping_monitor ""
