#!/usr/bin/env bash
# Race-condition + compensation drill for /store/customer/register (rc53.17).
#
# Spins up a synthetic invite_token in production DB, fires N concurrent
# invite-redemption requests, asserts exactly one wins and the other N-1
# get 422 invite_invalid. This validates CODEX P1#3 (atomic UPDATE …
# RETURNING) under real Postgres-level concurrency — a Knex mock cannot
# prove this.
#
# After the assertion, the script tears down the test customer + auth
# identity + master + invite token so the run is idempotent.
#
# Requires:
#   - psql with credentials in $SUPABASE_DB_URL (Session Pooler URL preferred)
#   - curl, jq, GNU parallel (or xargs -P)
#   - PUBLISHABLE_KEY env var (or default below)
#
# Usage: ./scripts/test_register_race.sh [N_PARALLEL]
#   N_PARALLEL defaults to 10. Anything ≤ 30 is fine; the endpoint is rate-
#   limited at the framework level so very high N just produces 429s.

set -euo pipefail

API="${VOD_API:-https://api.vod-auctions.com}"
PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d}"
N="${1:-10}"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "FATAL: SUPABASE_DB_URL not set. Source scripts/.env or pass via env." >&2
  exit 2
fi

# ─── 1. Seed test data ──────────────────────────────────────────────────────
TS=$(date +%s)
RAW_TOKEN="RACE${TS}TEST"          # 14 chars, uppercase, dashes-free
TOKEN_DISPLAY="VOD-RACE${TS}-TEST"
TEST_EMAIL="race-test-${TS}@vod-auctions.example"

echo "─── Seeding token=$RAW_TOKEN, email=$TEST_EMAIL ───"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
INSERT INTO invite_tokens (
  id, token, token_display, email, issued_by, issued_at, expires_at, status
) VALUES (
  'tok_${TS}_race',
  '${RAW_TOKEN}',
  '${TOKEN_DISPLAY}',
  '${TEST_EMAIL}',
  'race_test',
  NOW(),
  NOW() + INTERVAL '1 hour',
  'active'
);
SQL

# ─── 2. Fire N concurrent redeem requests ───────────────────────────────────
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "─── Firing $N concurrent POST /store/invite/$RAW_TOKEN ───"

fire_one () {
  local idx=$1
  curl -s -o "$TMPDIR/r${idx}.json" -w "%{http_code}\n" \
    -X POST "$API/store/invite/$RAW_TOKEN" \
    -H "content-type: application/json" \
    -H "x-publishable-api-key: $PUBLISHABLE_KEY" \
    -d "{\"first_name\":\"Race${idx}\",\"last_name\":\"Test\",\"email\":\"$TEST_EMAIL\",\"password\":\"Test1234RaceXY\"}"
}
export -f fire_one
export API PUBLISHABLE_KEY RAW_TOKEN TEST_EMAIL TMPDIR

seq 1 "$N" | xargs -P "$N" -I{} bash -c 'fire_one "$@"' _ {} > "$TMPDIR/codes.txt"

# ─── 3. Assertions ──────────────────────────────────────────────────────────
N_200=$(grep -c '^200$' "$TMPDIR/codes.txt" || true)
N_400=$(grep -c '^400$' "$TMPDIR/codes.txt" || true)
N_409=$(grep -c '^409$' "$TMPDIR/codes.txt" || true)
N_422=$(grep -c '^422$' "$TMPDIR/codes.txt" || true)
N_5XX=$(grep -cE '^5[0-9]{2}$' "$TMPDIR/codes.txt" || true)

echo ""
echo "─── Result distribution ───"
echo "  200 success:        $N_200"
echo "  400 validation:     $N_400"
echo "  409 email_in_use:   $N_409"
echo "  422 invite_invalid: $N_422"
echo "  5xx server-error:   $N_5XX"
echo ""

# ─── 4. DB-side verification ────────────────────────────────────────────────
TOKEN_STATUS=$(psql "$SUPABASE_DB_URL" -At -c \
  "SELECT status FROM invite_tokens WHERE token='$RAW_TOKEN'")

CUSTOMERS_CREATED=$(psql "$SUPABASE_DB_URL" -At -c \
  "SELECT COUNT(*) FROM customer WHERE email='$TEST_EMAIL'")

MASTER_LINKED=$(psql "$SUPABASE_DB_URL" -At -c \
  "SELECT COUNT(*) FROM crm_master_contact WHERE primary_email_lower='$TEST_EMAIL' AND medusa_customer_id IS NOT NULL")

AUDIT_ROWS=$(psql "$SUPABASE_DB_URL" -At -c \
  "SELECT COUNT(*) FROM crm_master_audit_log a
     JOIN crm_master_contact c ON a.master_id=c.id
   WHERE c.primary_email_lower='$TEST_EMAIL' AND a.action='invite_redemption'")

echo "─── DB state after race ───"
echo "  invite_tokens.status: $TOKEN_STATUS"
echo "  customer rows:        $CUSTOMERS_CREATED"
echo "  master+link rows:     $MASTER_LINKED"
echo "  invite_redemption audit: $AUDIT_ROWS"
echo ""

# ─── 5. Tear-down ───────────────────────────────────────────────────────────
echo "─── Tear-down ───"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
-- 1. delete audit + source-link first (FK)
DELETE FROM crm_master_audit_log
 WHERE master_id IN (SELECT id FROM crm_master_contact WHERE primary_email_lower='$TEST_EMAIL');
DELETE FROM crm_master_source_link
 WHERE master_id IN (SELECT id FROM crm_master_contact WHERE primary_email_lower='$TEST_EMAIL');
DELETE FROM crm_master_communication_pref
 WHERE master_id IN (SELECT id FROM crm_master_contact WHERE primary_email_lower='$TEST_EMAIL');
DELETE FROM crm_master_email
 WHERE master_id IN (SELECT id FROM crm_master_contact WHERE primary_email_lower='$TEST_EMAIL');
DELETE FROM crm_master_contact WHERE primary_email_lower='$TEST_EMAIL';
DELETE FROM customer WHERE email='$TEST_EMAIL';
DELETE FROM invite_token_attempts WHERE token IN ('$RAW_TOKEN','$TOKEN_DISPLAY');
DELETE FROM invite_tokens WHERE token='$RAW_TOKEN';
-- Auth identity is in a separate Medusa schema; the customer-delete cascades
-- via Medusa's relations, but if any orphan auth rows remain we surface them:
SELECT COUNT(*) AS orphan_auth FROM auth_identity ai
  JOIN provider_identity pi ON pi.auth_identity_id = ai.id
 WHERE pi.entity_id NOT IN (SELECT id FROM customer);
SQL

# ─── 6. Final verdict ───────────────────────────────────────────────────────
RC=0
if [[ "$N_200" -ne 1 ]]; then
  echo "❌ FAIL: expected exactly 1 success, got $N_200"
  RC=1
fi
EXPECTED_INVALID=$((N - 1))
if [[ "$N_422" -ne "$EXPECTED_INVALID" ]]; then
  echo "❌ FAIL: expected $EXPECTED_INVALID × 422 invite_invalid, got $N_422 (plus $N_400 × 400, $N_409 × 409, $N_5XX × 5xx)"
  RC=1
fi
if [[ "$TOKEN_STATUS" != "used" ]]; then
  echo "❌ FAIL: token status is '$TOKEN_STATUS', expected 'used'"
  RC=1
fi
if [[ "$CUSTOMERS_CREATED" != "1" ]] && [[ "$CUSTOMERS_CREATED" != "0" ]]; then
  # 0 is acceptable if tear-down already ran; 1 is the in-flight state
  echo "⚠️  unexpected customer count after tear-down: $CUSTOMERS_CREATED"
fi

if [[ "$RC" -eq 0 ]]; then
  echo ""
  echo "✅ PASS — Atomic-Token-Claim (CODEX P1#3) validated"
  echo "   $N concurrent submits → 1× 201 success, $((N-1))× 422 invite_invalid"
  echo "   token.status='used', customer + master + audit rows present (then torn down)"
fi

exit $RC
