#!/bin/sh
# Healthy when the last run succeeded and is younger than BACKUP_MAX_AGE_HOURS (default 36).
set -eu
. "$(dirname "$0")/lib.sh"
[ -f "$STATUS_FILE" ] || exit 1
grep -q '"ok":true' "$STATUS_FILE" || exit 1
epoch=$(sed -n 's/.*"epoch":\([0-9]*\).*/\1/p' "$STATUS_FILE")
[ -n "$epoch" ] || exit 1
age=$(( $(date -u +%s) - epoch ))
[ "$age" -le $(( ${BACKUP_MAX_AGE_HOURS:-36} * 3600 )) ]
