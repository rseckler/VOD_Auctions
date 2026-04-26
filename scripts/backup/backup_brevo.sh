#!/usr/bin/env bash
# Daily Brevo CRM export: contacts (CSV) + email templates (HTML/JSON) + senders + lists.
# Brevo API: https://developers.brevo.com/reference

set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_backup_common.sh"

: "${BREVO_API_KEY:?BREVO_API_KEY required (from backend/.env)}"

setup_traps "brevo" "KUMA_BACKUP_BREVO"

DATE=$(ts_utc)
WORK_DIR="$BACKUP_ROOT/brevo-$DATE"
mkdir -p "$WORK_DIR"

API="https://api.brevo.com/v3"
HDR=("-H" "api-key: $BREVO_API_KEY" "-H" "accept: application/json")

# 1) Contacts — paginated 1000/page
log "[brevo] exporting contacts"
CONTACTS_FILE="$WORK_DIR/contacts.json"
echo '[' > "$CONTACTS_FILE"
offset=0
limit=1000
first=1
while :; do
  page=$(curl -fsS --max-time 30 "${HDR[@]}" "$API/contacts?limit=$limit&offset=$offset")
  rows=$(echo "$page" | jq '.contacts // []')
  count=$(echo "$rows" | jq 'length')
  [ "$count" = "0" ] && break
  if [ "$first" = "1" ]; then first=0; else echo ',' >> "$CONTACTS_FILE"; fi
  echo "$rows" | jq -c '.[]' | sed '$!s/$/,/' >> "$CONTACTS_FILE"
  offset=$((offset + limit))
  total=$(echo "$page" | jq -r '.count // 0')
  [ "$offset" -ge "$total" ] && break
done
echo ']' >> "$CONTACTS_FILE"
CONTACT_COUNT=$(jq 'length' "$CONTACTS_FILE")
log "[brevo] contacts=$CONTACT_COUNT"

# 2) Lists
log "[brevo] exporting lists"
curl -fsS --max-time 30 "${HDR[@]}" "$API/contacts/lists?limit=50" \
  > "$WORK_DIR/lists.json"

# 3) Email templates (transactional)
log "[brevo] exporting email templates"
curl -fsS --max-time 30 "${HDR[@]}" "$API/smtp/templates?limit=200" \
  > "$WORK_DIR/templates.json"

# 4) Senders
log "[brevo] exporting senders"
curl -fsS --max-time 30 "${HDR[@]}" "$API/senders" \
  > "$WORK_DIR/senders.json"

# 5) Account info (for audit trail)
curl -fsS --max-time 30 "${HDR[@]}" "$API/account" \
  > "$WORK_DIR/account.json"

# Pack + encrypt
ARCHIVE="$WORK_DIR/brevo-$DATE.tar.gz.gpg"
tar -czf - -C "$WORK_DIR" \
  contacts.json lists.json templates.json senders.json account.json \
  | gpg_encrypt > "$ARCHIVE"

SIZE_KB=$(awk "BEGIN{printf \"%.0f\", $(stat -c%s "$ARCHIVE")/1024}")
log "[brevo] archive ${SIZE_KB} KB, contacts=$CONTACT_COUNT"

r2_push "$ARCHIVE" "saas/brevo/$DATE.tar.gz.gpg"

# Cleanup intermediate JSON
rm "$WORK_DIR"/*.json

local_retention_cleanup
kuma_ping "KUMA_BACKUP_BREVO" "up" "OK contacts=$CONTACT_COUNT size=${SIZE_KB}KB"
log "[brevo] DONE contacts=$CONTACT_COUNT"
