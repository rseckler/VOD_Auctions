#!/usr/bin/env bash
# Shared library for VOD_Auctions backup scripts.
# Source this from individual backup_*.sh scripts.

set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/root/backups}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_BACKUP="$SCRIPT_DIR/.env.backup"
ENV_MAIN="$(dirname "$SCRIPT_DIR")/.env"
ENV_LEGACY_BACKEND="/root/VOD_Auctions/backend/.env"

# Load env in priority: backend (BREVO/RESEND), main scripts (DATABASE_URL), backup-specific (overrides)
[ -f "$ENV_LEGACY_BACKEND" ] && set -a && . "$ENV_LEGACY_BACKEND" && set +a
[ -f "$ENV_MAIN" ]            && set -a && . "$ENV_MAIN"            && set +a
[ -f "$ENV_BACKUP" ]          && set -a && . "$ENV_BACKUP"          && set +a

mkdir -p "$BACKUP_ROOT"

ts_utc()       { date -u +%Y%m%d_%H%M%SZ; }
ts_iso()       { date -u +%Y-%m-%dT%H:%M:%SZ; }
log()          { echo "[$(ts_iso)] $*"; }
log_error()    { echo "[$(ts_iso)] ERROR: $*" >&2; }

# Returns lifecycle tag based on UTC date: monthly (1st), weekly (Sunday), daily otherwise.
lifecycle_tag() {
  local d
  d=$(date -u +%d)
  local dow
  dow=$(date -u +%u)   # 1=Mon..7=Sun
  if [ "$d" = "01" ]; then echo monthly
  elif [ "$dow" = "7" ]; then echo weekly
  else echo daily
  fi
}

# Encrypt stdin to stdout using GPG_PASSPHRASE.
gpg_encrypt() {
  : "${GPG_PASSPHRASE:?GPG_PASSPHRASE not set in .env.backup}"
  gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase "$GPG_PASSPHRASE"
}

# Push a local file to R2 with path-based lifecycle prefix.
# Cloudflare R2 doesn't support x-amz-tagging; we use path-prefix lifecycle instead.
# Usage: r2_push <local-file> <remote-key>
# Result: r2:vod-backups/<lifecycle>/<remote-key> (lifecycle = daily | weekly | monthly)
r2_push() {
  local src="$1" dest="$2"
  local tag
  tag=$(lifecycle_tag)
  rclone copyto "$src" "r2-backups:vod-backups/$tag/$dest"
}

# Hit Uptime-Kuma push monitor (GET with query params; Kuma rejects POST).
# Usage: kuma_ping <env-var-name> [status] [msg]
kuma_ping() {
  local var="$1" status="${2:-up}" msg="${3:-OK}"
  local url
  url="${!var:-}"
  [ -z "$url" ] && { log "kuma_ping: $var unset, skipping"; return 0; }
  # Strip pre-existing query string from 1Password URL, append ours.
  local base="${url%%\?*}"
  local encoded_msg
  encoded_msg=$(printf '%s' "$msg" | jq -sRr @uri)
  curl -fsS --get --max-time 10 \
    --data-urlencode "status=$status" \
    --data-urlencode "msg=$msg" \
    "$base" >/dev/null 2>&1 || log_error "kuma_ping: $var failed"
}

# Send Resend email alert. Used only on failure.
# Usage: alert_email "<subject>" "<body>"
alert_email() {
  local subject="$1" body="$2"
  : "${RESEND_API_KEY:?RESEND_API_KEY required for alerts}"
  local to="${BACKUP_ALERT_EMAIL:-rseckler@gmail.com}"
  curl -fsS --max-time 30 \
    -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc --arg from "noreply@vod-auctions.com" --arg to "$to" \
                 --arg subject "$subject" --arg body "$body" \
        '{from:$from, to:[$to], subject:$subject, text:$body}')" \
    >/dev/null 2>&1 || log_error "alert_email failed"
}

# Run a backup step with structured error handling.
# Sets KUMA_VAR per script. On failure: send Resend alert + ping Kuma down.
trap_error() {
  local exit_code=$?
  local job="${BACKUP_JOB:-unknown}"
  local kuma_var="${KUMA_VAR:-}"
  log_error "Backup job '$job' failed (exit $exit_code)"
  [ -n "$kuma_var" ] && kuma_ping "$kuma_var" "down" "FAIL: $job (exit $exit_code)"
  alert_email "[VOD Backup FAIL] $job" "Backup job '$job' failed at $(ts_iso) on $(hostname). Exit code: $exit_code. Check /root/backups/backup.log."
  exit $exit_code
}

# Each script must call: setup_traps "<job-name>" "<kuma-env-var>"
setup_traps() {
  BACKUP_JOB="$1"
  KUMA_VAR="$2"
  trap trap_error ERR
}

# Cleanup old local backups (keep last N days).
local_retention_cleanup() {
  local keep_days="${LOCAL_RETENTION_DAYS:-3}"
  find "$BACKUP_ROOT" -maxdepth 2 -type f -mtime "+$keep_days" -delete 2>/dev/null || true
  find "$BACKUP_ROOT" -maxdepth 2 -type d -empty -mtime "+$keep_days" -delete 2>/dev/null || true
}
