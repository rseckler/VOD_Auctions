#!/usr/bin/env bash
#
# Cron-env wrapper for MiniMax bulk scripts (analogous to health-sampler.sh).
# Sources MINIMAX_API_KEY from scripts/.env, falls back to backend/.env.
#
# Usage in crontab (VPS):
#   0 2 * * * . ~/VOD_Auctions/scripts/minimax-cron-env.sh && \
#              cd ~/VOD_Auctions/scripts && \
#              venv/bin/python3 your_minimax_script.py >> your_script.log 2>&1
#
# The minimax_client.py also auto-loads scripts/.env itself, so this wrapper
# is mainly useful when you need the vars available to shell commands too.

set -euo pipefail

BASE_DIR="${BASE_DIR:-/root/VOD_Auctions}"
SCRIPTS_ENV="${BASE_DIR}/scripts/.env"
BACKEND_ENV="${BASE_DIR}/backend/.env"

_loaded=0

if [ -f "$SCRIPTS_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$SCRIPTS_ENV"
  set +a
  _loaded=1
fi

if [ -f "$BACKEND_ENV" ] && [ "$_loaded" -eq 0 ]; then
  set -a
  # shellcheck disable=SC1090
  source "$BACKEND_ENV"
  set +a
fi

if [ -z "${MINIMAX_API_KEY:-}" ]; then
  echo "[$(date -u +%FT%TZ)] ERROR: MINIMAX_API_KEY not found in scripts/.env or backend/.env" >&2
  exit 1
fi
