#!/usr/bin/env bash
# Logical Replication Health Check
# Runs every 15 min via cron. Pings Kuma + sends throttled emails for
# anomalies that need user attention.
#
# Per Subscription Status-Tabelle (rc53.13 hotfix):
# - subenabled=false              → Kuma-down + log_error + KEIN Email
#                                   (DISABLED ist immer ein bewusster Eingriff,
#                                    wird in RSE-323/Re-Sync getrackt — kein Spam.)
# - latest_end_time IS NULL bei
#   subenabled=true               → Kuma-down + log_error + Email (throttled 6h)
#                                   (Worker hat noch nie applied — neuer Vorfall.
#                                    Vor rc53.13 nur silent geloggt → Bug-Fix.)
# - lag > MAX_LAG_CRITICAL (30m)  → Kuma-down + Email (throttled 6h)
# - lag > MAX_LAG_WARN (5m)       → Kuma-degraded + log
# - lag <= MAX_LAG_WARN           → Kuma-up
#
# Throttle: pro {subname,state}-Kombi maximal 1 Email / 6h via flag-files
# unter /var/cache/vod-replication-alerts/. Pure POSIX, keine jq-Dep.

set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_backup_common.sh"

setup_traps "replication-health-check" "KUMA_REPLICATION_LAG"

PGPASS_FILE="/root/pg17-replica-pass.txt"
[ -f "$PGPASS_FILE" ] || { log_error "$PGPASS_FILE missing"; exit 1; }

MAX_LAG_WARN=${MAX_REPLICATION_LAG_SECONDS:-300}
MAX_LAG_CRITICAL=$((MAX_LAG_WARN * 6))   # 30 min default
ALERT_THROTTLE_HOURS=${ALERT_THROTTLE_HOURS:-6}
ALERT_STATE_DIR="/var/cache/vod-replication-alerts"

# should_alert <key> — returns 0 (true) wenn ≥ ALERT_THROTTLE_HOURS seit
# letztem Alert für diesen Key, 1 (false) wenn throttled. Touch'd ein
# flag-file beim erlaubten Alert.
should_alert() {
  local key="$1"
  local flag_file="$ALERT_STATE_DIR/${key}.last"
  mkdir -p "$ALERT_STATE_DIR"

  if [ -f "$flag_file" ]; then
    local age_s=$(( $(date +%s) - $(stat -c %Y "$flag_file") ))
    local threshold_s=$(( ALERT_THROTTLE_HOURS * 3600 ))
    if [ "$age_s" -lt "$threshold_s" ]; then
      return 1   # throttled
    fi
  fi

  touch "$flag_file"
  return 0
}

# pg_subscription AND pg_stat_subscription are both cluster-wide views — query once.
# psql -A -t produces "t"/"f" for booleans (without ::text cast which would give "true"/"false").
REPORT=$(docker exec -u postgres pg17-replica psql -d vod_auctions_replica -At -F'|' -c "
  SELECT sub.subname, sub.subenabled,
         COALESCE(EXTRACT(EPOCH FROM (now() - stat.latest_end_time))::int::text, 'NULL')
  FROM pg_stat_subscription stat
  JOIN pg_subscription sub ON sub.subname = stat.subname;
" 2>/dev/null)

OVERALL_STATUS="up"
WORST_LAG=0
SUMMARY=""
while IFS='|' read -r name enabled lag; do
  [ -z "$name" ] && continue

  if [ "$enabled" != "t" ]; then
    OVERALL_STATUS="down"
    SUMMARY="$SUMMARY $name=DISABLED"
    log_error "[$name] subscription is DISABLED"
    # KEIN Email — DISABLED ist immer ein bewusster Eingriff, wird via
    # RSE-323/Re-Sync getrackt. Kuma-down reicht.
    continue
  fi

  if [ "$lag" = "NULL" ]; then
    OVERALL_STATUS="down"
    SUMMARY="$SUMMARY $name=NULL"
    log_error "[$name] lag is NULL (no recent stream — slot dead or worker never applied)"
    if should_alert "${name}_null"; then
      alert_email "[VOD Replication CRITICAL] $name lag=NULL" \
        "Subscription '$name' is enabled but pg_stat_subscription.latest_end_time is NULL.

This means the apply worker has either never applied any change yet, or the upstream replication slot has been invalidated (look for 'wal_removed' in pg_replication_slots on Source).

Backups have already fallen back to Supabase-Direct (backup_supabase.sh lag-guard, rc53.13).

Diagnose:
  docker exec -u postgres pg17-replica psql -d <db> -c \\
    'SELECT subname, subenabled, subslotname FROM pg_subscription;'

If slot was killed, use the Re-Sync runbook:
  docs/runbooks/RESYNC_VOD_AUCTIONS_REPLICA.md

Throttled to one email per ${ALERT_THROTTLE_HOURS}h per subscription."
    fi
    continue
  fi

  if [ "$lag" -gt "$MAX_LAG_CRITICAL" ]; then
    OVERALL_STATUS="down"
    SUMMARY="$SUMMARY $name=${lag}s(CRIT)"
    log_error "[$name] lag ${lag}s > critical threshold ${MAX_LAG_CRITICAL}s"
    if should_alert "${name}_critical"; then
      alert_email "[VOD Replication CRITICAL] $name lag ${lag}s" \
        "Subscription '$name' has fallen ${lag} seconds behind (threshold: ${MAX_LAG_CRITICAL}s). Backups will fall back to Supabase Direct until lag recovers. Investigate via: docker exec -u postgres pg17-replica psql -d <db> -c 'SELECT * FROM pg_stat_subscription;'

Throttled to one email per ${ALERT_THROTTLE_HOURS}h per subscription."
    fi
  elif [ "$lag" -gt "$MAX_LAG_WARN" ]; then
    [ "$OVERALL_STATUS" = "up" ] && OVERALL_STATUS="degraded"
    SUMMARY="$SUMMARY $name=${lag}s(WARN)"
    log "[$name] lag ${lag}s > warn threshold ${MAX_LAG_WARN}s"
  else
    SUMMARY="$SUMMARY $name=${lag}s"
  fi

  [ "$lag" -gt "$WORST_LAG" ] && WORST_LAG=$lag
done <<< "$REPORT"

KUMA_STATUS="up"
[ "$OVERALL_STATUS" = "down" ] && KUMA_STATUS="down"
[ "$OVERALL_STATUS" = "degraded" ] && KUMA_STATUS="up"   # Kuma WARN-State würde manueller heartbeat-with-msg sein

KUMA_MSG="lag_max=${WORST_LAG}s${SUMMARY}"
kuma_ping "KUMA_REPLICATION_LAG" "$KUMA_STATUS" "$KUMA_MSG"
log "$OVERALL_STATUS — $KUMA_MSG"
