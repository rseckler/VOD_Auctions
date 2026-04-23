#!/usr/bin/env bash
#
# VPS cron wrapper for POST /health-sample
# Usage (from crontab):
#   * * * * *   . ~/VOD_Auctions/scripts/health-sampler.sh fast        >> ~/VOD_Auctions/scripts/health_sampler.log 2>&1
#   */5 * * * * . ~/VOD_Auctions/scripts/health-sampler.sh background  >> ~/VOD_Auctions/scripts/health_sampler.log 2>&1
#   */15 * * * * . ~/VOD_Auctions/scripts/health-sampler.sh synthetic synthetic_cron >> ~/VOD_Auctions/scripts/health_sampler.log 2>&1
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

# Fire POST. Capture body + status. Don't fail hard on backend down — just log.
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
