#!/bin/sh
# Scheduler: one backup per day at BACKUP_HOUR_UTC (default 02:00 UTC), plus one at start when the last one is stale.
set -eu
. "$(dirname "$0")/lib.sh"
HERE="$(dirname "$0")"
HOUR=$(num "${BACKUP_HOUR_UTC:-2}")

stopping=0
sleeper=0
trap 'stopping=1; log info "backup scheduler stopping"; kill "$sleeper" 2>/dev/null || true' TERM INT

secs_until_next_run() {
  now_s=$(( $(num "$(date -u +%H)") * 3600 + $(num "$(date -u +%M)") * 60 + $(num "$(date -u +%S)") ))
  target_s=$(( HOUR * 3600 ))
  delay=$(( target_s - now_s ))
  [ "$delay" -gt 0 ] || delay=$(( delay + 86400 ))
  printf '%s' "$delay"
}

run_backup() {
  sh "$HERE/backup.sh" || log error "backup run failed; will retry at the next scheduled time"
}

log info "backup scheduler started: daily at ${HOUR}:00 UTC, keep ${BACKUP_KEEP_DAILY:-7} daily + ${BACKUP_KEEP_WEEKLY:-4} weekly"

if [ "${BACKUP_ON_START:-true}" = "true" ]; then
  stale=1
  if [ -f "$STATUS_FILE" ] && grep -q '"ok":true' "$STATUS_FILE"; then
    epoch=$(sed -n 's/.*"epoch":\([0-9]*\).*/\1/p' "$STATUS_FILE")
    if [ -n "$epoch" ] && [ $(( $(date -u +%s) - epoch )) -lt 86400 ]; then
      stale=0
    fi
  fi
  if [ "$stale" = "1" ]; then
    sleep "${BACKUP_START_DELAY_SECONDS:-20}" # let PostgreSQL finish starting
    run_backup
  fi
fi

while [ "$stopping" = "0" ]; do
  delay=$(secs_until_next_run)
  sleep "$delay" &
  sleeper=$!
  wait "$sleeper" || true
  [ "$stopping" = "0" ] || break
  run_backup
done
