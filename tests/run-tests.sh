#!/usr/bin/env bash
# ============================================================
# VOD Auctions — Playwright E2E Test Runner
# Usage:
#   ./tests/run-tests.sh                    # Run against localhost
#   BASE_URL=https://vod-auctions.com ./tests/run-tests.sh   # Run against prod
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
STOREFRONT_DIR="$PROJECT_ROOT/storefront"
RESULTS_FILE="$SCRIPT_DIR/TEST_RESULTS.md"

BASE_URL="${BASE_URL:-http://localhost:3000}"
MEDUSA_URL="${MEDUSA_URL:-http://localhost:9000}"
ADMIN_URL="${ADMIN_URL:-http://localhost:9000}"

echo "============================================================"
echo "VOD Auctions E2E Test Suite"
echo "Date:        $(date '+%Y-%m-%d %H:%M:%S')"
echo "Storefront:  $BASE_URL"
echo "Backend:     $MEDUSA_URL"
echo "Admin:       $ADMIN_URL/app"
echo "============================================================"

# Check that storefront directory exists
if [ ! -d "$STOREFRONT_DIR" ]; then
  echo "ERROR: storefront directory not found at $STOREFRONT_DIR"
  exit 1
fi

# Run Playwright tests
cd "$STOREFRONT_DIR"

export BASE_URL
export MEDUSA_URL
export ADMIN_URL

# Run tests, capturing exit code
EXIT_CODE=0
npx playwright test --reporter=list 2>&1 | tee /tmp/playwright-output.txt || EXIT_CODE=$?

# Extract test results from output
PASSED=$(grep -c "✓\|passed" /tmp/playwright-output.txt 2>/dev/null || echo "0")
FAILED=$(grep -c "✗\|failed" /tmp/playwright-output.txt 2>/dev/null || echo "0")
SKIPPED=$(grep -c "skipped\|-" /tmp/playwright-output.txt 2>/dev/null || echo "0")

# Generate TEST_RESULTS.md
cat > "$RESULTS_FILE" << MARKDOWN
# VOD Auctions — E2E Test Results

**Last Run:** $(date '+%Y-%m-%d %H:%M:%S')
**Environment:** $BASE_URL
**Backend:** $MEDUSA_URL
**Status:** $([ $EXIT_CODE -eq 0 ] && echo "PASSED" || echo "FAILED")

## Summary

| Metric | Value |
|--------|-------|
| Exit Code | $EXIT_CODE |
| Storefront URL | $BASE_URL |
| Backend URL | $MEDUSA_URL |
| Run Date | $(date '+%Y-%m-%d') |

## Test Files

| File | Description |
|------|-------------|
| 01-discovery.spec.ts | Password Gate + Homepage |
| 02-catalog.spec.ts | Catalog Browse + Filter + Detail |
| 03-auth.spec.ts | Register + Login + Logout |
| 04-watchlist.spec.ts | Watchlist (Save for Later) |
| 05-auction-browse.spec.ts | Auction Discovery + Lot Detail |
| 06-bidding.spec.ts | Bid Placement + Bid History |
| 07-direct-purchase.spec.ts | Direct Purchase + Cart |
| 08-payment.spec.ts | Stripe Checkout Flow |
| 09-orders.spec.ts | Order History + Invoice Download |
| 10-admin.spec.ts | Admin: Block Creation + Live Monitor |

## Last Run Output

\`\`\`
$(cat /tmp/playwright-output.txt 2>/dev/null || echo "No output captured")
\`\`\`

## Notes

- Tests in spec files 06-10 may skip gracefully when live auction data is not available.
- Admin tests (10) target localhost:9000/app — requires Medusa backend running.
- Stripe payment tests (08) require Stripe test mode configured on the backend.
- To run against production: \`BASE_URL=https://vod-auctions.com ./tests/run-tests.sh\`
- HTML report: \`cd storefront && npx playwright show-report\`
MARKDOWN

echo ""
echo "============================================================"
echo "Test run complete. Results saved to: $RESULTS_FILE"
echo "HTML report: cd storefront && npx playwright show-report"
echo "============================================================"

exit $EXIT_CODE
