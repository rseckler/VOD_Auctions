#!/usr/bin/env bash
#
# VPS cron wrapper for POST /health-sample
# Usage (from crontab) — DIRECT INVOCATION, never source-mode (`. script.sh`):
# Cron's /bin/sh is dash on Ubuntu, which rejects `set -o pipefail` → use direct
# invocation so the `#!/usr/bin/env bash` shebang takes effect (rc52.10 lesson).
#
#   * * * * *    /root/VOD_Auctions/scripts/health-sampler.sh fast                  >> /root/VOD_Auctions/scripts/health_sampler.log 2>&1
#   */5 * * * *  /root/VOD_Auctions/scripts/health-sampler.sh background            >> /root/VOD_Auctions/scripts/health_sampler.log 2>&1
#   */15 * * * * /root/VOD_Auctions/scripts/health-sampler.sh synthetic synthetic_cron >> /root/VOD_Auctions/scripts/health_sampler.log 2>&1
#   30 3 * * *   /root/VOD_Auctions/scripts/health-sampler.sh cleanup               >> /root/VOD_Auctions/scripts/health_cleanup.log 2>&1
#   0 8 * * *    /root/VOD_Auctions/scripts/health-sampler.sh digest                >> /root/VOD_Auctions/scripts/health_digest.log 2>&1
#
# HEALTH_SAMPLER_TOKEN is read from backend/.env (same secret the API route verifies).

set -euo pipefail

CLASS="${1:-fast}"
SOURCE="${2:-sampler}"

# Load backend/.env to get HEALTH_SAMPLER_TOKEN (VPS path is /root/VOD_Auctions)
ENV_FILE="${BACKEND_ENV_FILE:-/root/VOD_Auctions/backend/.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "[$(date -u +%FT%TZ)] ERROR: backend env file not found at $ENV_FILE" >&2
  exit 1
fi

# Extract HEALTH_SAMPLER_TOKEN from .env (handle quotes + whitespace)
TOKEN=$(grep -E '^HEALTH_SAMPLER_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r')
if [ -z "$TOKEN" ]; then
  echo "[$(date -u +%FT%TZ)] ERROR: HEALTH_SAMPLER_TOKEN not set in $ENV_FILE" >&2
  exit 1
fi

BACKEND_URL="${HEALTH_SAMPLER_BACKEND_URL:-http://127.0.0.1:9000}"

# "cleanup" is a separate action (retention policy, §3.4).
if [ "$CLASS" = "cleanup" ]; then
  HTTP_CODE=$(curl -sS -o /tmp/health_sampler_response.json -w '%{http_code}' \
    -X POST \
    -H "X-Sampler-Token: $TOKEN" \
    --max-time 30 \
    "$BACKEND_URL/health-sample/cleanup" 2>&1 || echo "curl_failed")
  if [ "$HTTP_CODE" = "200" ]; then
    BODY=$(cat /tmp/health_sampler_response.json 2>/dev/null || echo "{}")
    DEL_FB=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('deleted_fast_background',0))" 2>/dev/null || echo "?")
    DEL_SY=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('deleted_synthetic',0))" 2>/dev/null || echo "?")
    REMAIN=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('remaining_rows',0))" 2>/dev/null || echo "?")
    echo "[$(date -u +%FT%TZ)] ok cleanup deleted_fb=$DEL_FB deleted_synth=$DEL_SY remaining=$REMAIN"
  else
    echo "[$(date -u +%FT%TZ)] FAIL cleanup http_code=$HTTP_CODE body=$(cat /tmp/health_sampler_response.json 2>/dev/null | head -c 500)"
  fi
  exit 0
fi

# "digest" triggers daily warning-digest email (alerting must be ON).
if [ "$CLASS" = "digest" ]; then
  HTTP_CODE=$(curl -sS -o /tmp/health_sampler_response.json -w '%{http_code}' \
    -X POST \
    -H "X-Sampler-Token: $TOKEN" \
    --max-time 15 \
    "$BACKEND_URL/health-sample/digest" 2>&1 || echo "curl_failed")
  if [ "$HTTP_CODE" = "200" ]; then
    BODY=$(cat /tmp/health_sampler_response.json 2>/dev/null || echo "{}")
    SENT=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('sent', d.get('skipped', '?')))" 2>/dev/null || echo "?")
    COUNT=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('warning_count',0))" 2>/dev/null || echo "?")
    echo "[$(date -u +%FT%TZ)] ok digest sent=$SENT warnings=$COUNT"
  else
    echo "[$(date -u +%FT%TZ)] FAIL digest http_code=$HTTP_CODE body=$(cat /tmp/health_sampler_response.json 2>/dev/null | head -c 500)"
  fi
  exit 0
fi

# Sample-class run (fast/background/synthetic).
HTTP_CODE=$(curl -sS -o /tmp/health_sampler_response.json -w '%{http_code}' \
  -X POST \
  -H "X-Sampler-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  --max-time 45 \
  "$BACKEND_URL/health-sample?class=$CLASS&source=$SOURCE" 2>&1 || echo "curl_failed")

if [ "$HTTP_CODE" = "200" ]; then
  BODY=$(cat /tmp/health_sampler_response.json 2>/dev/null || echo "{}")
  WRITTEN=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('samples_written',0))" 2>/dev/null || echo "?")
  DURATION=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('duration_ms',0))" 2>/dev/null || echo "?")
  echo "[$(date -u +%FT%TZ)] ok class=$CLASS samples=$WRITTEN duration_ms=$DURATION"
else
  echo "[$(date -u +%FT%TZ)] FAIL class=$CLASS http_code=$HTTP_CODE body=$(cat /tmp/health_sampler_response.json 2>/dev/null | head -c 500)"
fi
