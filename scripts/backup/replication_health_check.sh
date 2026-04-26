#!/usr/bin/env bash
# Logical Replication Health Check
# Runs every 5 min via cron. Pings Kuma when lag <60s, alerts when >5min.
#
# Pro Subscription:
# - Pull pg_stat_subscription.latest_end_time
# - Calculate lag in seconds
# - If lag > MAX_LAG_CRITICAL (1800s = 30min): emergency email + Kuma-down
# - If lag > MAX_LAG_WARN (300s = 5min): Resend warning email + Kuma-up-with-warn
# - Else: Kuma-up
#
# Plus per-Subscription disabled-detection (subenabled=false → critical alert).

set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_backup_common.sh"

setup_traps "replication-health-check" "KUMA_REPLICATION_LAG"

PGPASS_FILE="/root/pg17-replica-pass.txt"
[ -f "$PGPASS_FILE" ] || { log_error "$PGPASS_FILE missing"; exit 1; }

MAX_LAG_WARN=${MAX_REPLICATION_LAG_SECONDS:-300}
MAX_LAG_CRITICAL=$((MAX_LAG_WARN * 6))   # 30 min default

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
    alert_email "[VOD Replication CRITICAL] $name disabled" \
      "Subscription '$name' is not enabled on pg17-replica. Re-enable via: docker exec -u postgres pg17-replica psql -d <db> -c 'ALTER SUBSCRIPTION $name ENABLE;'"
    continue
  fi

  if [ "$lag" = "NULL" ]; then
    OVERALL_STATUS="down"
    SUMMARY="$SUMMARY $name=NULL"
    log_error "[$name] lag is NULL (no recent stream)"
    continue
  fi

  if [ "$lag" -gt "$MAX_LAG_CRITICAL" ]; then
    OVERALL_STATUS="down"
    SUMMARY="$SUMMARY $name=${lag}s(CRIT)"
    log_error "[$name] lag ${lag}s > critical threshold ${MAX_LAG_CRITICAL}s"
    alert_email "[VOD Replication CRITICAL] $name lag ${lag}s" \
      "Subscription '$name' has fallen ${lag} seconds behind (threshold: ${MAX_LAG_CRITICAL}s). Backups will fall back to Supabase Direct until lag recovers. Investigate via: docker exec -u postgres pg17-replica psql -d <db> -c 'SELECT * FROM pg_stat_subscription;'"
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
