#!/bin/sh
# Shared helpers for the backup scripts (POSIX sh: they run on Alpine's busybox ash).

BACKUP_DIR="${BACKUP_DIR:-/backups}"
if [ "$BACKUP_DIR" = "/" ]; then
  echo "BACKUP_DIR must not be /" >&2
  exit 1
fi
STATUS_FILE="$BACKUP_DIR/last_backup.json"

# One JSON object per line, same shape as the API/worker logs.
log() {
  level="$1"
  shift
  msg=$(printf '%s' "$*" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')
  printf '{"ts":"%s","level":"%s","service":"backup","msg":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$level" "$msg"
}

# Dead-man's-switch ping (healthchecks.io, Uptime Kuma push, ...): "", "/start" or "/fail" appended to BACKUP_PING_URL.
ping_monitor() {
  [ -n "${BACKUP_PING_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 "${BACKUP_PING_URL}$1" >/dev/null 2>&1 || log warn "monitor ping failed ($1)"
}

# Strips leading zeros so "08" is not read as octal in arithmetic.
num() {
  v=$(printf '%s' "$1" | sed 's/^0*//')
  printf '%s' "${v:-0}"
}

# Deletes backup artifacts only: a regular file named content_agent_* directly inside the backup tree.
# Anything else is refused, so a bad variable can never turn into a broad delete.
remove_backup_file() {
  case "$1" in
    "$BACKUP_DIR"/*/content_agent_*) ;;
    *)
      log error "refusing to delete outside the backup tree: $1"
      return 1
      ;;
  esac
  [ -f "$1" ] || return 0
  rm -f -- "$1"
}

write_status() {
  # write_status ok|fail "file" "bytes" "message"
  ok="false"
  [ "$1" = "ok" ] && ok="true"
  msg=$(printf '%s' "$4" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')
  tmp="$STATUS_FILE.tmp"
  printf '{"ok":%s,"epoch":%s,"ts":"%s","file":"%s","bytes":%s,"message":"%s"}\n' \
    "$ok" "$(date -u +%s)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$2" "${3:-0}" "$msg" >"$tmp"
  mv "$tmp" "$STATUS_FILE"
}
