#!/usr/bin/env bash
# Backup VPS-local databases:
#   - PostgreSQL 16: stromportal (local)
#   - MySQL: vodfest, naegele_db
#   - SQLite: uptime-kuma, tape-mag-migration
#
# Requires in .env.backup:
#   GPG_PASSPHRASE
#   KUMA_BACKUP_VPS
# Optional:
#   PG_LOCAL_DATABASES         space-separated DB names (default: stromportal)
#   MYSQL_LOCAL_DATABASES      space-separated DB names (default: vodfest naegele_db)

set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_backup_common.sh"

setup_traps "vps-databases" "KUMA_BACKUP_VPS"

DATE=$(ts_utc)
WORK_DIR="$BACKUP_ROOT/vps-databases-$DATE"
mkdir -p "$WORK_DIR"

PG_DBS="${PG_LOCAL_DATABASES:-stromportal}"
MYSQL_DBS="${MYSQL_LOCAL_DATABASES:-vodfest naegele_db}"

# 1) PostgreSQL local (PG16, no Docker needed)
for db in $PG_DBS; do
  log "[vps-pg:$db] dumping"
  out="$WORK_DIR/pg-$db.dump.gpg"
  sudo -u postgres pg_dump --format=custom --no-owner --no-acl --compress=9 "$db" \
    | gpg_encrypt > "$out"
  size=$(stat -c%s "$out")
  log "[vps-pg:$db] done ($(awk "BEGIN{printf \"%.1f\",$size/1048576}") MB)"
  r2_push "$out" "db/vps-pg-$db/$DATE.dump.gpg"
done

# 2) MySQL — single combined dump for vodfest+naegele_db
if [ -n "$MYSQL_DBS" ]; then
  log "[vps-mysql] dumping: $MYSQL_DBS"
  out="$WORK_DIR/mysql.sql.gz.gpg"
  # Uses /root/.my.cnf for credentials (already configured on VPS)
  mysqldump --single-transaction --routines --triggers --events \
            --databases $MYSQL_DBS \
    | gzip -9 \
    | gpg_encrypt > "$out"
  size=$(stat -c%s "$out")
  log "[vps-mysql] done ($(awk "BEGIN{printf \"%.1f\",$size/1048576}") MB)"
  r2_push "$out" "db/vps-mysql/$DATE.sql.gz.gpg"
fi

# 3) SQLite — online-safe via .backup
declare -a SQLITE_PATHS=(
  "/root/uptime-kuma/data/kuma.db"
  "/root/tape-mag-migration/prisma/migration.db"
)
for path in "${SQLITE_PATHS[@]}"; do
  [ -f "$path" ] || { log "[vps-sqlite] skip (not found): $path"; continue; }
  name=$(basename "$path" .db)
  log "[vps-sqlite:$name] backing up"
  tmp="$WORK_DIR/sqlite-$name.db"
  sqlite3 "$path" ".backup '$tmp'"
  out="$tmp.gz.gpg"
  gzip -9 -c "$tmp" | gpg_encrypt > "$out"
  rm "$tmp"
  size=$(stat -c%s "$out")
  log "[vps-sqlite:$name] done ($(awk "BEGIN{printf \"%.1f\",$size/1048576}") MB)"
  r2_push "$out" "db/vps-sqlite/$name/$DATE.db.gz.gpg"
done

# 4) Redis BGSAVE (small, low-prio)
if command -v redis-cli >/dev/null && redis-cli ping 2>/dev/null | grep -q PONG; then
  log "[vps-redis] BGSAVE"
  redis-cli BGSAVE >/dev/null
  # Wait for save to finish (up to 30s)
  for _ in $(seq 1 30); do
    sleep 1
    last=$(redis-cli LASTSAVE)
    sleep 1
    cur=$(redis-cli LASTSAVE)
    [ "$last" != "$cur" ] && break
  done
  rdb=$(redis-cli CONFIG GET dir | tail -1)/$(redis-cli CONFIG GET dbfilename | tail -1)
  if [ -f "$rdb" ]; then
    out="$WORK_DIR/redis.rdb.gz.gpg"
    gzip -9 -c "$rdb" | gpg_encrypt > "$out"
    size=$(stat -c%s "$out")
    log "[vps-redis] done ($(awk "BEGIN{printf \"%.1f\",$size/1048576}") MB)"
    r2_push "$out" "db/vps-redis/$DATE.rdb.gz.gpg"
  else
    log_error "[vps-redis] dump file not found at $rdb"
  fi
else
  log "[vps-redis] redis-cli unavailable, skipping"
fi

local_retention_cleanup
TOTAL_SIZE=$(du -sb "$WORK_DIR" | cut -f1)
TOTAL_MB=$(awk "BEGIN{printf \"%.1f\",$TOTAL_SIZE/1048576}")
kuma_ping "KUMA_BACKUP_VPS" "up" "OK ${TOTAL_MB}MB $DATE"
log "[vps] DONE total=${TOTAL_MB}MB"
