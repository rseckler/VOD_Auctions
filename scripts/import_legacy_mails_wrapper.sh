#!/bin/bash
# Cron-Wrapper für import_legacy_mails_v3.py mit Auto-Cleanup.
#
# Wenn der Importer beim letzten Lauf den DONE-Marker geschrieben hat (JSONL
# komplett durch, pull_run auf 'done'), entfernt sich der Wrapper beim
# nächsten Cron-Tick selbst aus der Crontab + räumt Marker/State auf.
# Sonst startet er den Importer regulär.
#
# Aufruf via Cron:
#   15,45 * * * * /root/VOD_Auctions/scripts/import_legacy_mails_wrapper.sh \
#                 >> /root/VOD_Auctions/scripts/import_legacy_mails.log 2>&1

DONE_MARKER="/tmp/import_legacy_mails_v3.done"
STATE_FILE="/tmp/import_legacy_mails_v3.state.json"
SCRIPTS_DIR="/root/VOD_Auctions/scripts"
LOG_FILE="$SCRIPTS_DIR/import_legacy_mails.log"
JSONL="/root/imports/vod-mails-export.jsonl.gz"

if [ -f "$DONE_MARKER" ]; then
  TS=$(date +%Y%m%d-%H%M%S)
  echo "[$(date -Iseconds)] [wrapper] DONE marker found — auto-cleanup starting" >> "$LOG_FILE"

  # Crontab-Backup vor Modifikation
  crontab -l > "/tmp/crontab.bak.before-mail-cleanup-$TS" 2>/dev/null

  # Atomare Crontab-Modifikation: 3 Zeilen entfernen (2 Comments + Cron-Line)
  TMPFILE=$(mktemp)
  crontab -l 2>/dev/null > "$TMPFILE"
  sed -i '/Mail-Import legacy_mail_archive/d' "$TMPFILE"
  sed -i '/Offset 15,45 um Kollision/d' "$TMPFILE"
  sed -i '/import_legacy_mails_wrapper.sh/d' "$TMPFILE"
  crontab "$TMPFILE"
  rm -f "$TMPFILE"

  # Marker + State aufräumen (idempotent)
  rm -f "$DONE_MARKER" "$STATE_FILE"

  echo "[$(date -Iseconds)] [wrapper] Cron entry removed, marker+state cleaned. Backup: /tmp/crontab.bak.before-mail-cleanup-$TS" >> "$LOG_FILE"
  exit 0
fi

# Regulärer Run — wir delegieren ans Python-Skript, das selber Pre-flight
# (UNIQUE-Index, Self-Lock, parallel-job-skip) macht.
cd "$SCRIPTS_DIR" && exec venv/bin/python3 import_legacy_mails_v3.py \
  --jsonl "$JSONL" \
  --load-tier low
