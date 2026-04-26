#!/usr/bin/env bash
# Mirror R2 vod-images bucket → R2 vod-backups/images-mirror/.
# Delta-only sync (rclone). R2→R2 has no egress cost.
#
# rclone config required (~/.config/rclone/rclone.conf):
#   [r2-images]   read-only on vod-images
#   [r2-backups]  write on vod-backups

set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_backup_common.sh"

setup_traps "r2-image-mirror" "KUMA_BACKUP_R2_IMAGES"

DATE=$(ts_utc)
log "[r2-mirror] starting delta sync vod-images → vod-backups/images-mirror"

# Get source state for final-verify (used to convert transient rclone exit codes
# into success/fail decision based on actual state-match, not retry-noise).
SOURCE_OBJECTS=$(rclone size r2-images:vod-images 2>/dev/null | awk '/Total objects/ {print $3}')

LOG_FILE="$BACKUP_ROOT/r2-mirror-$DATE.log"
# rclone exit code can be 1/5 due to transient Cloudflare R2 503s ("expected
# element type <Error> but have <html>") even when retry succeeds. We don't
# fail the job based on rclone's exit alone — instead we verify final state.
# `set +e` to capture exit code without aborting via pipefail.
set +e
rclone sync r2-images:vod-images r2-backups:vod-backups/images-mirror \
  --fast-list \
  --transfers=8 \
  --checkers=16 \
  --no-update-modtime \
  --retries=5 \
  --stats=30s \
  --stats-one-line \
  > "$LOG_FILE" 2>&1
RCLONE_EXIT=$?
set -e

# Final-verify: source vs mirror object count
MIRROR_OBJECTS=$(rclone size r2-backups:vod-backups/images-mirror 2>/dev/null | awk '/Total objects/ {print $3}')

if [ "$SOURCE_OBJECTS" = "$MIRROR_OBJECTS" ] && [ -n "$SOURCE_OBJECTS" ]; then
  STATUS_MSG="OK src=$SOURCE_OBJECTS mirror=$MIRROR_OBJECTS"
  if [ "$RCLONE_EXIT" -ne 0 ]; then
    log "[r2-mirror] rclone exit=$RCLONE_EXIT but state matches (transient retries succeeded)"
    STATUS_MSG="$STATUS_MSG (rclone-rc=$RCLONE_EXIT after retries)"
  fi
  KUMA_STATUS="up"
elif [ -n "$SOURCE_OBJECTS" ] && [ -n "$MIRROR_OBJECTS" ]; then
  DIFF=$((SOURCE_OBJECTS - MIRROR_OBJECTS))
  STATUS_MSG="DRIFT src=$SOURCE_OBJECTS mirror=$MIRROR_OBJECTS diff=$DIFF rc=$RCLONE_EXIT"
  log_error "[r2-mirror] state drift: $STATUS_MSG"
  KUMA_STATUS="down"
else
  STATUS_MSG="UNKNOWN (size query failed) rc=$RCLONE_EXIT"
  log_error "[r2-mirror] could not verify final state"
  KUMA_STATUS="down"
fi

# Upload rclone log for audit trail
gpg_encrypt < "$LOG_FILE" > "$LOG_FILE.gpg"
r2_push "$LOG_FILE.gpg" "logs/r2-mirror/$DATE.log.gpg"
rm "$LOG_FILE" "$LOG_FILE.gpg"

local_retention_cleanup
kuma_ping "KUMA_BACKUP_R2_IMAGES" "$KUMA_STATUS" "$STATUS_MSG"
log "[r2-mirror] DONE $STATUS_MSG"

# Exit success only if state matches; otherwise propagate failure to trigger trap_error + email alert
[ "$KUMA_STATUS" = "up" ] || exit 1
