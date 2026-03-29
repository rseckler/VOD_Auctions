# VOD Auctions — E2E Test Results

**Last Run:** (not yet run)
**Environment:** http://localhost:3000
**Backend:** http://localhost:9000
**Status:** PENDING

## Summary

| Metric | Value |
|--------|-------|
| Exit Code | - |
| Storefront URL | http://localhost:3000 |
| Backend URL | http://localhost:9000 |
| Run Date | - |

## Detailed Results

| # | Test | Spec File | Status | Notes |
|---|------|-----------|--------|-------|
| 01 | Password Gate — redirect without cookie | 01-discovery.spec.ts | ⬜ pending | |
| 02 | Password Gate — wrong password error | 01-discovery.spec.ts | ⬜ pending | |
| 03 | Password Gate — correct password grants access | 01-discovery.spec.ts | ⬜ pending | |
| 04 | Homepage — loads with hero section | 01-discovery.spec.ts | ⬜ pending | |
| 05 | Homepage — navigation links | 01-discovery.spec.ts | ⬜ pending | |
| 06 | Homepage — Login button visible | 01-discovery.spec.ts | ⬜ pending | |
| 07 | Homepage — Browse Catalog navigates | 01-discovery.spec.ts | ⬜ pending | |
| 08 | Catalog — loads with release grid | 02-catalog.spec.ts | ⬜ pending | |
| 09 | Catalog — search filters results | 02-catalog.spec.ts | ⬜ pending | |
| 10 | Catalog — category filter CD | 02-catalog.spec.ts | ⬜ pending | |
| 11 | Catalog — tapes filter | 02-catalog.spec.ts | ⬜ pending | |
| 12 | Catalog — sort by price | 02-catalog.spec.ts | ⬜ pending | |
| 13 | Catalog — product detail page loads | 02-catalog.spec.ts | ⬜ pending | |
| 14 | Catalog — product detail shows content | 02-catalog.spec.ts | ⬜ pending | |
| 15 | Catalog — breadcrumb navigation | 02-catalog.spec.ts | ⬜ pending | |
| 16 | Auth — Login button opens modal | 03-auth.spec.ts | ⬜ pending | |
| 17 | Auth — Error for wrong credentials | 03-auth.spec.ts | ⬜ pending | |
| 18 | Auth — Successful login bidder1 | 03-auth.spec.ts | ⬜ pending | |
| 19 | Auth — Successful login testuser | 03-auth.spec.ts | ⬜ pending | |
| 20 | Auth — Modal switches to Register | 03-auth.spec.ts | ⬜ pending | |
| 21 | Auth — Modal switches to Forgot Password | 03-auth.spec.ts | ⬜ pending | |
| 22 | Auth — Register new account | 03-auth.spec.ts | ⬜ pending | |
| 23 | Auth — Register validates password match | 03-auth.spec.ts | ⬜ pending | |
| 24 | Auth — Register requires T&C | 03-auth.spec.ts | ⬜ pending | |
| 25 | Auth — Logout via header dropdown | 03-auth.spec.ts | ⬜ pending | |
| 26 | Watchlist — Save button hidden when logged out | 04-watchlist.spec.ts | ⬜ pending | |
| 27 | Watchlist — Save button shown after login | 04-watchlist.spec.ts | ⬜ pending | |
| 28 | Watchlist — Can save and view item | 04-watchlist.spec.ts | ⬜ pending | |
| 29 | Watchlist — Saved page loads | 04-watchlist.spec.ts | ⬜ pending | |
| 30 | Watchlist — Account shows Saved count | 04-watchlist.spec.ts | ⬜ pending | |
| 31 | Auction Browse — Auctions page loads | 05-auction-browse.spec.ts | ⬜ pending | |
| 32 | Auction Browse — Shows blocks or empty | 05-auction-browse.spec.ts | ⬜ pending | |
| 33 | Auction Browse — Block detail loads | 05-auction-browse.spec.ts | ⬜ pending | May skip (no active block) |
| 34 | Auction Browse — Lot grid visible | 05-auction-browse.spec.ts | ⬜ pending | May skip (no active block) |
| 35 | Auction Browse — Lot detail loads | 05-auction-browse.spec.ts | ⬜ pending | May skip (no active block) |
| 36 | Auction Browse — Live Auction Banner | 05-auction-browse.spec.ts | ⬜ pending | |
| 37 | Bidding — Bid button hidden when logged out | 06-bidding.spec.ts | ⬜ pending | May skip (no active block) |
| 38 | Bidding — Bid form shown when logged in | 06-bidding.spec.ts | ⬜ pending | May skip (no active block) |
| 39 | Bidding — Bid history table shown | 06-bidding.spec.ts | ⬜ pending | May skip (no active block) |
| 40 | Bidding — Place a bid (bidder1) | 06-bidding.spec.ts | ⬜ pending | May skip (no active block) |
| 41 | Direct Purchase — Add to Cart button hidden (logged out) | 07-direct-purchase.spec.ts | ⬜ pending | |
| 42 | Direct Purchase — Can add to cart | 07-direct-purchase.spec.ts | ⬜ pending | |
| 43 | Direct Purchase — Cart page loads | 07-direct-purchase.spec.ts | ⬜ pending | |
| 44 | Direct Purchase — Cart empty state | 07-direct-purchase.spec.ts | ⬜ pending | |
| 45 | Direct Purchase — For sale filter | 07-direct-purchase.spec.ts | ⬜ pending | |
| 46 | Payment — Checkout page loads | 08-payment.spec.ts | ⬜ pending | |
| 47 | Payment — Checkout page has shipping section | 08-payment.spec.ts | ⬜ pending | |
| 48 | Payment — Checkout shows order summary | 08-payment.spec.ts | ⬜ pending | |
| 49 | Payment — Payment methods visible | 08-payment.spec.ts | ⬜ pending | Requires cart items |
| 50 | Payment — Shipping address fields present | 08-payment.spec.ts | ⬜ pending | |
| 51 | Payment — Can fill shipping address | 08-payment.spec.ts | ⬜ pending | |
| 52 | Orders — Orders page loads | 09-orders.spec.ts | ⬜ pending | |
| 53 | Orders — Shows orders or empty state | 09-orders.spec.ts | ⬜ pending | |
| 54 | Orders — testuser has orders | 09-orders.spec.ts | ⬜ pending | |
| 55 | Orders — Order card expands | 09-orders.spec.ts | ⬜ pending | |
| 56 | Orders — Download Invoice button visible | 09-orders.spec.ts | ⬜ pending | |
| 57 | Orders — Invoice PDF download initiates | 09-orders.spec.ts | ⬜ pending | |
| 58 | Orders — Account shows order count | 09-orders.spec.ts | ⬜ pending | |
| 59 | Admin — Login page loads at /app | 10-admin.spec.ts | ⬜ pending | |
| 60 | Admin — Login with credentials | 10-admin.spec.ts | ⬜ pending | |
| 61 | Admin — auction-blocks route accessible | 10-admin.spec.ts | ⬜ pending | |
| 62 | Admin — live-monitor route accessible | 10-admin.spec.ts | ⬜ pending | |
| 63 | Admin — transactions route accessible | 10-admin.spec.ts | ⬜ pending | |
| 64 | Admin — Create + delete draft block via API | 10-admin.spec.ts | ⬜ pending | |

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Test passed |
| ❌ | Test failed |
| ⏭️ | Test skipped (no test data available) |
| ⬜ | Not yet run |

## Environment Notes

- Tests in spec files 06-10 may skip gracefully when live auction data is not available.
- Admin tests (10) target localhost:9000/app — requires Medusa backend running.
- Stripe payment tests (08) require Stripe test mode configured on the backend.

## How to Run

\`\`\`bash
# Run against local dev server
cd VOD_Auctions
./tests/run-tests.sh

# Run specific spec
cd storefront && npx playwright test tests/01-discovery.spec.ts

# Run with UI mode (interactive)
npm run test:e2e:ui

# Open last HTML report
npm run test:e2e:report

# Run against production
BASE_URL=https://vod-auctions.com MEDUSA_URL=https://api.vod-auctions.com ./tests/run-tests.sh
\`\`\`
