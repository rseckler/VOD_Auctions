#!/usr/bin/env bash
# One-shot helper: pull credentials from 1Password (Work-Vault) and push .env.backup to VPS.
# Run on Robin's Mac with `op` already signed in.
# Usage: ./setup_env_backup_local.sh

set -euo pipefail

if ! op whoami >/dev/null 2>&1; then
  echo "op not signed in. Run: eval \$(op signin)"
  exit 1
fi

echo "==> Pulling credentials from 1Password (Work-Vault)..."

GPG_PASS=$(op item get u2wtf3nzhon4wk7mafty3mwebm --vault=Work --fields password --reveal)
KUMA_VOD=$(op item get oniyzboj6qrhh6swzfxb6k4igq --vault=Work --fields "Backup-vod-auctions-2h" --reveal | xargs)
KUMA_BF=$(op item get oniyzboj6qrhh6swzfxb6k4igq --vault=Work --fields "Backup-blackfire-daily" --reveal | xargs)
KUMA_VPS=$(op item get oniyzboj6qrhh6swzfxb6k4igq --vault=Work --fields "Backup-vps-daily" --reveal | xargs)
KUMA_R2=$(op item get oniyzboj6qrhh6swzfxb6k4igq --vault=Work --fields "Backup-r2-images-2h" --reveal | xargs)
KUMA_BREVO=$(op item get oniyzboj6qrhh6swzfxb6k4igq --vault=Work --fields "Backup-brevo-daily" --reveal | xargs)
KUMA_REPL=$(op item get oniyzboj6qrhh6swzfxb6k4igq --vault=Work --fields "Replication-Lag" --reveal | xargs)
# Blackfire Supabase DB password — Item ist im PERSÖNLICH-Vault unter "Supabase" mit Username "blackfire-service"
# (das gespeicherte Password gehört trotz username-Label tatsächlich zum postgres-Superuser)
BF_DB_PASS=$(op item get svuu4vwwzxbx6pkmfh45x7ou5q --vault=Persönlich --fields password --reveal 2>/dev/null \
          || op item get "Supabase Blackfire" --vault=Persönlich --fields password --reveal 2>/dev/null \
          || op item get "Supabase Blackfire" --vault=Work --fields password --reveal 2>/dev/null)

# Sanity checks
[ -z "$GPG_PASS" ]   && { echo "GPG_PASSPHRASE empty"; exit 2; }
[ -z "$KUMA_VOD" ]   && { echo "KUMA_BACKUP_VOD_AUCTIONS empty"; exit 2; }
[ -z "$KUMA_BF" ]    && { echo "KUMA_BACKUP_BLACKFIRE empty"; exit 2; }
[ -z "$KUMA_VPS" ]   && { echo "KUMA_BACKUP_VPS empty"; exit 2; }
[ -z "$KUMA_R2" ]    && { echo "KUMA_BACKUP_R2_IMAGES empty"; exit 2; }
[ -z "$KUMA_BREVO" ] && { echo "KUMA_BACKUP_BREVO empty"; exit 2; }
[ -z "$KUMA_REPL" ]  && { echo "KUMA_REPLICATION_LAG empty"; exit 2; }
[ -z "$BF_DB_PASS" ] && { echo "Blackfire DB password not found in 1Password — check item 'Supabase Blackfire'"; exit 2; }

echo "  GPG passphrase: ${#GPG_PASS} chars"
echo "  Blackfire DB password: ${#BF_DB_PASS} chars"
echo "  KUMA URLs: 6 of 6 fetched"

TMP=$(mktemp /tmp/env.backup.XXXXXX)
trap "rm -f $TMP" EXIT

cat > "$TMP" <<EOF
# Auto-generated $(date -u +%Y-%m-%dT%H:%M:%SZ) — do not commit
GPG_PASSPHRASE='${GPG_PASS}'
SUPABASE_VOD_AUCTIONS_URL=
SUPABASE_BLACKFIRE_URL='postgres://postgres:${BF_DB_PASS}@db.lglvuiuwbrhiqvxcriwa.supabase.co:5432/postgres?sslmode=require'
LOCAL_RETENTION_DAYS=3
BACKUP_ROOT=/root/backups
BACKUP_ALERT_EMAIL='rseckler@gmail.com'
KUMA_BACKUP_VOD_AUCTIONS='${KUMA_VOD}'
KUMA_BACKUP_BLACKFIRE='${KUMA_BF}'
KUMA_BACKUP_VPS='${KUMA_VPS}'
KUMA_BACKUP_R2_IMAGES='${KUMA_R2}'
KUMA_BACKUP_BREVO='${KUMA_BREVO}'
KUMA_REPLICATION_LAG='${KUMA_REPL}'
EOF

echo "==> Deploying .env.backup to VPS..."
scp -q "$TMP" vps:/root/VOD_Auctions/scripts/backup/.env.backup
ssh vps "chmod 600 /root/VOD_Auctions/scripts/backup/.env.backup && \
         set -a && . /root/VOD_Auctions/scripts/backup/.env.backup && set +a && \
         echo \"  GPG: \${#GPG_PASSPHRASE} chars\" && \
         echo \"  KUMA_BACKUP_VOD_AUCTIONS: \${KUMA_BACKUP_VOD_AUCTIONS:0:60}...\" && \
         echo \"  KUMA_BACKUP_BLACKFIRE: \${KUMA_BACKUP_BLACKFIRE:0:60}...\""

echo "==> .env.backup deployed and verified"
