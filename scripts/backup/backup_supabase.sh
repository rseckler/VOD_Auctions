#!/usr/bin/env bash
# Backup a Supabase project via pg_dump (Docker postgres:17 → Supabase PG17).
# Usage: backup_supabase.sh <project-slug>
#   project-slug: vod-auctions | blackfire
#
# Requires in .env.backup:
#   SUPABASE_VOD_AUCTIONS_URL  postgres://postgres:PASS@db.<ref>.supabase.co:5432/postgres
#   SUPABASE_BLACKFIRE_URL     postgres://postgres:PASS@db.lglvuiuwbrhiqvxcriwa.supabase.co:5432/postgres
#   GPG_PASSPHRASE
#   KUMA_BACKUP_VOD_AUCTIONS / KUMA_BACKUP_BLACKFIRE  Push-Heartbeat URLs
#
# Falls back to DATABASE_URL (from main scripts/.env) if SUPABASE_VOD_AUCTIONS_URL not set.

set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_backup_common.sh"

PROJECT="${1:?usage: backup_supabase.sh <vod-auctions|blackfire>}"

case "$PROJECT" in
  vod-auctions)
    DB_URL="${SUPABASE_VOD_AUCTIONS_URL:-${DATABASE_URL:-}}"
    KUMA="KUMA_BACKUP_VOD_AUCTIONS"
    ;;
  blackfire)
    DB_URL="${SUPABASE_BLACKFIRE_URL:-}"
    KUMA="KUMA_BACKUP_BLACKFIRE"
    ;;
  *)
    log_error "unknown project: $PROJECT"
    exit 2
    ;;
esac

[ -z "$DB_URL" ] && { log_error "DB_URL for $PROJECT not configured"; exit 3; }

setup_traps "supabase-$PROJECT" "$KUMA"

DATE=$(ts_utc)
WORK_DIR="$BACKUP_ROOT/supabase-$PROJECT-$DATE"
mkdir -p "$WORK_DIR"
DUMP_FILE="$WORK_DIR/$PROJECT.dump.gpg"

log "[$PROJECT] starting pg_dump via docker postgres:17"

# pg_dump --format=custom is compressed by default. Stream into GPG to avoid plaintext disk write.
docker run --rm --network=host -i postgres:17 \
  pg_dump \
    --format=custom \
    --no-owner \
    --no-acl \
    --compress=9 \
    --verbose \
    "$DB_URL" 2>"$WORK_DIR/$PROJECT.pg_dump.log" \
  | gpg_encrypt > "$DUMP_FILE"

SIZE_BYTES=$(stat -c%s "$DUMP_FILE")
SIZE_MB=$(awk "BEGIN{printf \"%.1f\", $SIZE_BYTES/1048576}")
log "[$PROJECT] pg_dump done, encrypted size: ${SIZE_MB} MB"

# Sanity: minimum size guard. vod-auctions ≥10 MB compressed, blackfire ≥1 MB.
MIN_BYTES=1000000
[ "$PROJECT" = "vod-auctions" ] && MIN_BYTES=10000000
if [ "$SIZE_BYTES" -lt "$MIN_BYTES" ]; then
  log_error "[$PROJECT] dump too small ($SIZE_BYTES bytes < $MIN_BYTES) — likely failed"
  exit 4
fi

REMOTE_KEY="db/$PROJECT/$DATE.dump.gpg"
log "[$PROJECT] uploading to R2: $REMOTE_KEY"
r2_push "$DUMP_FILE" "$REMOTE_KEY"

# Local retention: 3 days (handled by common.sh after each run)
local_retention_cleanup

# Heartbeat
kuma_ping "$KUMA" "up" "OK ${SIZE_MB}MB $DATE"
log "[$PROJECT] DONE size=${SIZE_MB}MB remote=$REMOTE_KEY"
