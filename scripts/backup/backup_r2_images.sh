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

# --fast-list: list each bucket once for efficient delta calculation
# --transfers=8: parallel uploads
# --checkers=16: parallel HEAD checks for delta detection
# --no-update-modtime: don't rewrite metadata if file unchanged
# --stats=30s: progress logging
# Output is captured to a tmp file so we can extract counts for the heartbeat msg
LOG_FILE="$BACKUP_ROOT/r2-mirror-$DATE.log"
rclone sync r2-images:vod-images r2-backups:vod-backups/images-mirror \
  --fast-list \
  --transfers=8 \
  --checkers=16 \
  --no-update-modtime \
  --stats=30s \
  --stats-one-line \
  > "$LOG_FILE" 2>&1

# Final stats line
TAIL_LINE=$(tail -20 "$LOG_FILE" | grep -E 'Transferred:|Errors:' | tail -2 | tr '\n' ' ')

# Cleanup local rclone log after upload to R2 (so we have audit trail)
gpg_encrypt < "$LOG_FILE" > "$LOG_FILE.gpg"
r2_push "$LOG_FILE.gpg" "logs/r2-mirror/$DATE.log.gpg"
rm "$LOG_FILE" "$LOG_FILE.gpg"

local_retention_cleanup
kuma_ping "KUMA_BACKUP_R2_IMAGES" "up" "OK $TAIL_LINE"
log "[r2-mirror] DONE $TAIL_LINE"
