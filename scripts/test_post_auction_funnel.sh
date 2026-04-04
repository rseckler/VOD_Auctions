#!/bin/bash
# RSE-292: Post-Auction Marketing Funnel — E2E Test
# Tests: wins, shipping-savings, recommendations endpoints
# Requires: user with auction wins
# Usage: ./test_post_auction_funnel.sh [email] [password]
# Default: robin@seckler.de / vod2026

set -euo pipefail

API="https://api.vod-auctions.com"
PK="pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d"
TEST_EMAIL="${1:-robin@seckler.de}"
TEST_PASSWORD="${2:-vod2026}"
PASS=0
FAIL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

ok() { ((PASS++)); echo -e "${GREEN}✓ $1${NC}"; }
fail() { ((FAIL++)); echo -e "${RED}✗ $1${NC}"; }
info() { echo -e "${YELLOW}→ $1${NC}"; }

echo "═══════════════════════════════════════════════════════"
echo "  RSE-292: Post-Auction Funnel E2E Test"
echo "═══════════════════════════════════════════════════════"
echo ""

# --- Auth: Login ---
info "Authenticating as ${TEST_EMAIL}..."
TOKEN=$(curl -s "${API}/auth/customer/emailpass" \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: ${PK}" \
  -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}" | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  echo -e "${RED}FATAL: Login failed. Cannot proceed.${NC}"
  exit 1
fi
ok "Login successful (token received)"
echo ""

AUTH_HEADERS="-H \"Authorization: Bearer ${TOKEN}\" -H \"x-publishable-api-key: ${PK}\""

# ═══════════════════════════════════════════════════════
# TEST 1: GET /store/account/wins
# ═══════════════════════════════════════════════════════
echo "─── Test 1: Wins Endpoint ───"

WINS_RESPONSE=$(curl -s "${API}/store/account/wins" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "x-publishable-api-key: ${PK}")

WINS_COUNT=$(echo "$WINS_RESPONSE" | jq '.count // 0')
HAS_RELEASE_ID=$(echo "$WINS_RESPONSE" | jq '[.wins[]? | .item.release_id] | length')
FIRST_RELEASE_ID=$(echo "$WINS_RESPONSE" | jq -r '.wins[0]?.item.release_id // empty')

if [ "$WINS_COUNT" -gt 0 ]; then
  ok "Wins endpoint returns ${WINS_COUNT} win(s)"
else
  fail "Wins endpoint returns 0 wins (expected >0 for test bidder)"
fi

if [ "$HAS_RELEASE_ID" -gt 0 ] && [ -n "$FIRST_RELEASE_ID" ]; then
  ok "release_id present in item object: ${FIRST_RELEASE_ID}"
else
  fail "release_id MISSING in item object (critical bug)"
fi

# Check all required fields
ITEM_FIELDS=$(echo "$WINS_RESPONSE" | jq -r '.wins[0]?.item | keys[]' 2>/dev/null | sort | tr '\n' ',')
for field in id release_id lot_number status release_title release_artist release_cover release_format; do
  if echo "$ITEM_FIELDS" | grep -q "$field"; then
    ok "item.${field} present"
  else
    fail "item.${field} MISSING"
  fi
done

BLOCK_FIELDS=$(echo "$WINS_RESPONSE" | jq -r '.wins[0]?.block | keys[]' 2>/dev/null | sort | tr '\n' ',')
for field in id title slug; do
  if echo "$BLOCK_FIELDS" | grep -q "$field"; then
    ok "block.${field} present"
  else
    fail "block.${field} MISSING"
  fi
done
echo ""

# ═══════════════════════════════════════════════════════
# TEST 2: GET /store/account/shipping-savings
# ═══════════════════════════════════════════════════════
echo "─── Test 2: Shipping-Savings Endpoint ───"

for COUNTRY in DE FR US; do
  info "Testing country=${COUNTRY}..."
  SS_RESPONSE=$(curl -s "${API}/store/account/shipping-savings?country=${COUNTRY}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "x-publishable-api-key: ${PK}")

  # Check all required fields
  for field in unpaid_wins unpaid_wins_weight_g cart_items cart_weight_g total_weight_g shipping_cost next_tier_at_g remaining_capacity_g estimated_items_capacity savings_vs_individual items_count zone_slug; do
    VAL=$(echo "$SS_RESPONSE" | jq ".${field} // \"__MISSING__\"")
    if [ "$VAL" != "\"__MISSING__\"" ]; then
      ok "${COUNTRY}: ${field} = ${VAL}"
    else
      fail "${COUNTRY}: ${field} MISSING"
    fi
  done

  # Zone correctness
  ZONE=$(echo "$SS_RESPONSE" | jq -r '.zone_slug')
  case $COUNTRY in
    DE) [ "$ZONE" = "de" ] && ok "${COUNTRY}: zone_slug=de (correct)" || fail "${COUNTRY}: zone_slug=${ZONE} (expected de)" ;;
    FR) [ "$ZONE" = "eu" ] && ok "${COUNTRY}: zone_slug=eu (correct)" || fail "${COUNTRY}: zone_slug=${ZONE} (expected eu)" ;;
    US) [ "$ZONE" = "world" ] && ok "${COUNTRY}: zone_slug=world (correct)" || fail "${COUNTRY}: zone_slug=${ZONE} (expected world)" ;;
  esac

  # Shipping cost correctness
  COST=$(echo "$SS_RESPONSE" | jq '.shipping_cost')
  case $COUNTRY in
    DE) [ "$COST" = "4.99" ] && ok "${COUNTRY}: shipping_cost=4.99 (correct)" || fail "${COUNTRY}: shipping_cost=${COST} (expected 4.99)" ;;
    FR) [ "$COST" = "9.99" ] && ok "${COUNTRY}: shipping_cost=9.99 (correct)" || fail "${COUNTRY}: shipping_cost=${COST} (expected 9.99)" ;;
    US) [ "$COST" = "14.99" ] && ok "${COUNTRY}: shipping_cost=14.99 (correct)" || fail "${COUNTRY}: shipping_cost=${COST} (expected 14.99)" ;;
  esac

  # Weight sanity check
  TOTAL_W=$(echo "$SS_RESPONSE" | jq '.total_weight_g')
  WINS_W=$(echo "$SS_RESPONSE" | jq '.unpaid_wins_weight_g')
  CART_W=$(echo "$SS_RESPONSE" | jq '.cart_weight_g')
  SUM_W=$((WINS_W + CART_W))
  [ "$TOTAL_W" -eq "$SUM_W" ] && ok "${COUNTRY}: total_weight = wins_weight + cart_weight (${TOTAL_W}g)" || fail "${COUNTRY}: weight mismatch total=${TOTAL_W} != wins+cart=${SUM_W}"

  # Capacity sanity check
  NEXT_TIER=$(echo "$SS_RESPONSE" | jq '.next_tier_at_g')
  REMAINING=$(echo "$SS_RESPONSE" | jq '.remaining_capacity_g')
  EXPECTED_REMAINING=$((NEXT_TIER - TOTAL_W))
  [ "$EXPECTED_REMAINING" -lt 0 ] && EXPECTED_REMAINING=0
  [ "$REMAINING" -eq "$EXPECTED_REMAINING" ] && ok "${COUNTRY}: remaining_capacity correct (${REMAINING}g)" || fail "${COUNTRY}: remaining_capacity ${REMAINING} != expected ${EXPECTED_REMAINING}"

  echo ""
done

# ═══════════════════════════════════════════════════════
# TEST 3: GET /store/account/recommendations
# ═══════════════════════════════════════════════════════
echo "─── Test 3: Recommendations Endpoint ───"

# Collect release_ids from wins
RELEASE_IDS=$(echo "$WINS_RESPONSE" | jq -r '[.wins[]? | .item.release_id] | join(",")')

if [ -z "$RELEASE_IDS" ]; then
  fail "No release_ids from wins — cannot test recommendations"
else
  info "Requesting recommendations for release_ids: ${RELEASE_IDS}"
  REC_RESPONSE=$(curl -s "${API}/store/account/recommendations?release_ids=${RELEASE_IDS}&limit=4" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "x-publishable-api-key: ${PK}")

  REC_COUNT=$(echo "$REC_RESPONSE" | jq '.recommendations | length')

  if [ "$REC_COUNT" -gt 0 ]; then
    ok "Recommendations returned ${REC_COUNT} items"
  else
    fail "Recommendations returned 0 items (expected >0)"
  fi

  # Check recommendation fields
  if [ "$REC_COUNT" -gt 0 ]; then
    for field in id title coverImage legacy_price format reason; do
      VAL=$(echo "$REC_RESPONSE" | jq -r ".recommendations[0].${field} // \"__MISSING__\"")
      if [ "$VAL" != "__MISSING__" ]; then
        ok "rec[0].${field} = ${VAL}"
      else
        fail "rec[0].${field} MISSING"
      fi
    done

    # Check reason values
    REASONS=$(echo "$REC_RESPONSE" | jq -r '[.recommendations[].reason] | unique | join(", ")')
    ok "Recommendation reasons: ${REASONS}"

    # Verify no input releases in results
    for RID in $(echo "$RELEASE_IDS" | tr ',' ' '); do
      IN_RESULTS=$(echo "$REC_RESPONSE" | jq --arg rid "$RID" '[.recommendations[] | select(.id == $rid)] | length')
      [ "$IN_RESULTS" -eq 0 ] && ok "Input release ${RID} correctly excluded" || fail "Input release ${RID} found in results (should be excluded)"
    done

    # Verify all have positive prices
    ZERO_PRICES=$(echo "$REC_RESPONSE" | jq '[.recommendations[] | select(.legacy_price <= 0)] | length')
    [ "$ZERO_PRICES" -eq 0 ] && ok "All recommendations have price > 0" || fail "${ZERO_PRICES} recommendations have price <= 0"

    # Verify all have coverImage
    NO_COVER=$(echo "$REC_RESPONSE" | jq '[.recommendations[] | select(.coverImage == null)] | length')
    [ "$NO_COVER" -eq 0 ] && ok "All recommendations have coverImage" || fail "${NO_COVER} recommendations missing coverImage"
  fi
fi
echo ""

# ═══════════════════════════════════════════════════════
# TEST 4: Empty/edge cases
# ═══════════════════════════════════════════════════════
echo "─── Test 4: Edge Cases ───"

# Empty release_ids
EMPTY_REC=$(curl -s "${API}/store/account/recommendations?release_ids=&limit=4" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "x-publishable-api-key: ${PK}")
EMPTY_COUNT=$(echo "$EMPTY_REC" | jq '.recommendations | length')
[ "$EMPTY_COUNT" -eq 0 ] && ok "Empty release_ids returns empty array" || fail "Empty release_ids returned ${EMPTY_COUNT} items"

# No release_ids param
NO_PARAM_REC=$(curl -s "${API}/store/account/recommendations?limit=4" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "x-publishable-api-key: ${PK}")
NO_PARAM_COUNT=$(echo "$NO_PARAM_REC" | jq '.recommendations | length')
[ "$NO_PARAM_COUNT" -eq 0 ] && ok "Missing release_ids param returns empty array" || fail "Missing param returned ${NO_PARAM_COUNT} items"

# Unauthenticated
UNAUTH_WINS=$(curl -s -o /dev/null -w "%{http_code}" "${API}/store/account/wins" \
  -H "x-publishable-api-key: ${PK}")
[ "$UNAUTH_WINS" = "401" ] && ok "Wins returns 401 without auth" || fail "Wins returned ${UNAUTH_WINS} without auth (expected 401)"

UNAUTH_SS=$(curl -s -o /dev/null -w "%{http_code}" "${API}/store/account/shipping-savings" \
  -H "x-publishable-api-key: ${PK}")
[ "$UNAUTH_SS" = "401" ] && ok "Shipping-savings returns 401 without auth" || fail "Shipping-savings returned ${UNAUTH_SS} without auth (expected 401)"

UNAUTH_REC=$(curl -s -o /dev/null -w "%{http_code}" "${API}/store/account/recommendations?release_ids=x" \
  -H "x-publishable-api-key: ${PK}")
[ "$UNAUTH_REC" = "401" ] && ok "Recommendations returns 401 without auth" || fail "Recommendations returned ${UNAUTH_REC} without auth (expected 401)"

echo ""

# ═══════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════
TOTAL=$((PASS + FAIL))
echo "═══════════════════════════════════════════════════════"
echo -e "  Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC} (${TOTAL} total)"
echo "═══════════════════════════════════════════════════════"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
