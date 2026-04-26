#!/usr/bin/env bash
# Backup a Supabase project via pg_dump (Docker postgres:17 → Supabase PG17).
# Usage: backup_supabase.sh <project-slug>
#   project-slug: vod-auctions | blackfire
#
# Connection priority (Tier-2: Logical Replication zu lokaler Replica reduziert Supabase-Egress auf 0):
#   1. REPLICA_<PROJECT>_URL    Lokale VPS-Replica (bevorzugt, kein Supabase-Egress)
#   2. SUPABASE_<PROJECT>_URL   Direct Connection zu Supabase (Fallback wenn Replica nicht verfügbar)
#   3. DATABASE_URL             vod-auctions only, aus scripts/.env (Legacy-Fallback)
#
# Replica-Lag-Guard: bei Lag > MAX_REPLICATION_LAG_SECONDS (default 300s) wird auf Source-DB
# zurückgefallen statt stale Replica-Daten zu sichern.
#
# Requires in .env.backup:
#   GPG_PASSPHRASE
#   KUMA_BACKUP_VOD_AUCTIONS / KUMA_BACKUP_BLACKFIRE
# Optional:
#   REPLICA_VOD_AUCTIONS_URL    postgres://postgres:PASS@127.0.0.1:5433/vod_auctions_replica
#   REPLICA_BLACKFIRE_URL       postgres://postgres:PASS@127.0.0.1:5433/blackfire_replica
#   SUPABASE_VOD_AUCTIONS_URL   Direct Connection (Source-Fallback)
#   SUPABASE_BLACKFIRE_URL      Direct Connection (Source-Fallback)
#   MAX_REPLICATION_LAG_SECONDS default 300 (5 Min)

set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_backup_common.sh"

PROJECT="${1:?usage: backup_supabase.sh <vod-auctions|blackfire>}"
MAX_LAG=${MAX_REPLICATION_LAG_SECONDS:-300}

case "$PROJECT" in
  vod-auctions)
    REPLICA_URL="${REPLICA_VOD_AUCTIONS_URL:-}"
    SOURCE_URL="${SUPABASE_VOD_AUCTIONS_URL:-${DATABASE_URL:-}}"
    SUB_NAME="vod_auctions_sub"
    KUMA="KUMA_BACKUP_VOD_AUCTIONS"
    ;;
  blackfire)
    REPLICA_URL="${REPLICA_BLACKFIRE_URL:-}"
    SOURCE_URL="${SUPABASE_BLACKFIRE_URL:-}"
    SUB_NAME="blackfire_sub"
    KUMA="KUMA_BACKUP_BLACKFIRE"
    ;;
  *)
    log_error "unknown project: $PROJECT"
    exit 2
    ;;
esac

# Decide source: Replica if available + lag OK, otherwise Supabase direct.
DB_URL=""
DB_SOURCE="unknown"
if [ -n "$REPLICA_URL" ]; then
  # Check replica lag via pg_stat_subscription on the replica itself
  LAG=$(docker run --rm --network=host postgres:17 \
    psql "$REPLICA_URL" -t -c "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - latest_end_time))::int, 0) FROM pg_stat_subscription WHERE subname = '$SUB_NAME';" 2>/dev/null | xargs)
  if [ -z "$LAG" ]; then LAG=999999; fi
  if [ "$LAG" -le "$MAX_LAG" ]; then
    DB_URL="$REPLICA_URL"
    DB_SOURCE="replica (lag=${LAG}s)"
  else
    log "[$PROJECT] Replica-Lag ${LAG}s > ${MAX_LAG}s — falling back to Supabase Direct"
    DB_URL="$SOURCE_URL"
    DB_SOURCE="supabase-direct (replica stale)"
  fi
fi
if [ -z "$DB_URL" ]; then
  DB_URL="$SOURCE_URL"
  DB_SOURCE="supabase-direct (no replica configured)"
fi
[ -z "$DB_URL" ] && { log_error "DB_URL for $PROJECT not configured (REPLICA + SUPABASE both missing)"; exit 3; }

setup_traps "supabase-$PROJECT" "$KUMA"
log "[$PROJECT] backup source: $DB_SOURCE"

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
