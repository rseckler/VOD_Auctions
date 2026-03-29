# VOD Auctions — Implementation Plan 2026-03-29

**Status:** In Progress
**Sprint:** Pre-Launch Quality & Feature Sprint
**Erstellt:** 2026-03-29
**Letzte Aktualisierung:** 2026-03-29

---

## Übersicht

Vier parallele Workstreams aus dem 2026-03-29 Audit:

| Workstream | Thema | Issues | Status |
|-----------|-------|--------|--------|
| A — Testing | E2E Testplan, Playwright Suite, Dashboard | 3 | ✅ Done |
| B — Email | Lücken schließen, Admin UI, Professionelle Templates | 4 | ✅ Done |
| C — CRM & Tracking | Config, Hotjar, Uptime, GA4 E-Commerce | 7 | ⏳ Todo |
| D — Code Quality | 16 Code-Review Issues (Critical → Low) | 14 | ⏳ Todo |

**Gesamt: 28 Issues**

---

## A — Testing

### A1 — Test Concept Document ✅ DONE
**Priorität:** High | **Status:** Fertig (2026-03-29)
**Datei:** `docs/TEST_CONCEPT.md`
Strukturiertes Testkonzept: Scope, 15 User Journeys, Testarten, Environments, CI/CD-Integration

### A2 — Playwright E2E Suite ✅ DONE
**Priorität:** High | **Status:** Fertig (2026-03-29)
64 Tests in 10 Spec-Dateien. Läuft lokal + auf Production.
```bash
cd VOD_Auctions/storefront && npx playwright test
BASE_URL=https://vod-auctions.com ./tests/run-tests.sh
```

### A3 — Test Results Dashboard UI ✅ DONE
**Priorität:** Normal | **Status:** Fertig (2026-03-29)
Webbasierte UI im Admin-Panel um Playwright-Ergebnisse anzuzeigen, Testläufe zu triggern und Historien zu verwalten. Route: `/admin/test-runner`

---

## B — Email System

### B1 — Unsubscribe Links implementieren ✅ Done
**Priorität:** High | **Status:** Fertig (2026-03-29)
- Backend: HMAC token system + `GET /store/email-preferences/unsubscribe` — already existed
- **New:** `storefront/src/app/email-preferences/unsubscribed/page.tsx` — dark-theme confirmation page with re-subscribe panel

### B2 — Double Opt-In Newsletter ✅ Done
**Priorität:** High | **Status:** Fertig (2026-03-29)
- **New:** `backend/src/emails/newsletter-confirm.ts` — confirmation email template via emailLayout
- **Rewritten:** `POST /store/newsletter` — sends confirmation email instead of direct Brevo insert
- **New:** `GET /store/newsletter/confirm` — validates daily HMAC (today + yesterday), inserts to Brevo
- **New:** `storefront/src/app/newsletter/confirmed/page.tsx` — success/error state

### B3 — Admin Email Template Management UI ✅ Done
**Priorität:** High | **Status:** Fertig (2026-03-29)
- **New:** `GET /admin/email-templates` — 15 template metadata objects
- **New:** `POST /admin/email-templates` — renders preview + sends Resend test email
- **New:** `backend/src/admin/routes/emails/page.tsx` — filter tabs, template cards with Channel/Category badges, Send Test modal

### B4 — Professional Email HTML Redesign ✅ Done
**Priorität:** High | **Status:** Fertig (2026-03-29)
- `layout.ts` — VML xmlns, format-detection meta, `#0d0b08` body bg, `<div role="article">`, plain span header, explicit divider row, MSO style block, `buildFooter` as `<tr><td>` (inline)
- All 10 Resend transactional templates: preheader texts updated to exact spec

---

## C — CRM & Tracking

### C1 — Brevo List IDs + ENV Config ✅ Done
**Priorität:** Urgent | **Status:** Fertig (2026-03-29)
`VOD_AUCTIONS_LIST_ID`/`TAPE_MAG_LIST_ID` mit sicheren Defaults (4/5) in `brevo.ts`. Backward-compat Aliase erhalten. `backend/.env.example` vollständig dokumentiert.

### C2 — Sentry Error Tracking Setup ✅ Done
**Priorität:** High | **Status:** Fertig (2026-03-29)
- `sentry.client.config.ts`: Replay-Integration (maskAllText, blockAllMedia, 0.1 session sample rate, env-basierter tracesSampleRate)
- `sentry.server.config.ts` + `sentry.edge.config.ts`: aktualisiert mit env-basiertem tracesSampleRate
- `next.config.ts`: vollständige `withSentryConfig`-Optionen (authToken, widenClientFileUpload, tunnelRoute, hideSourceMaps, disableLogger, Source Maps nur in Production)
- `storefront/.env.local.example` erstellt mit allen erforderlichen Keys dokumentiert

### C3 — Gate Password Policy ✅ Done
**Priorität:** Urgent | **Status:** Fertig (2026-03-29)
- Hardcoded Fallback `"vod2026"` entfernt aus `middleware.ts` + `api/gate/route.ts`
- Gate deaktiviert wenn `GATE_PASSWORD` ENV nicht gesetzt (statt Fallback)
- Launch-Checklist-Kommentar in beiden Dateien hinzugefügt

### C4 — Double-Opt-In vs Privacy Policy ✅ Done
**Priorität:** High | **Status:** Fertig (2026-03-29)
- Resolved by B2: Double-Opt-In fully implemented (DSGVO-Best Practice)
- Newsletter subscribe now sends confirmation email; Brevo insert only on confirmed click

### C5 — Hotjar Integration ✅ Done
**Priorität:** Normal | **Status:** Fertig (2026-03-29)
- `components/providers/HotjarProvider.tsx` — Script-Tag Injection (kein npm package nötig)
- Lädt nur wenn `NEXT_PUBLIC_HOTJAR_ID` gesetzt + Marketing-Consent in localStorage
- In `layout.tsx` nach CookieConsent eingebunden
- `NEXT_PUBLIC_HOTJAR_ID` in `.env.local` als Kommentar dokumentiert

### C6 — Uptime Monitoring ✅ Done
**Priorität:** Normal | **Status:** Fertig (2026-03-29)
- `docs/UPTIME_KUMA_SETUP.md` mit vollständiger Anleitung: Docker Compose, Nginx Reverse Proxy, Certbot SSL
- 4 Monitore dokumentiert: Storefront, API /health, Admin, Supabase
- Alert per E-Mail an frank@vod-records.com

### C7 — GA4 E-Commerce Purchase Events ✅ Done
**Priorität:** High | **Status:** Fertig (2026-03-29)
- `lib/analytics.ts`: `trackViewItem`, `trackAddToCart`, `trackBeginCheckout`, `trackPurchase` hinzugefügt
- `CatalogViewTracker.tsx` Client-Wrapper für Server-Component (Catalog-Detail-Seite)
- `trackBeginCheckout` + `trackPurchase` in Checkout-Page (Stripe + PayPal, beide Flows)
- Server-Side Measurement Protocol: nicht implementiert (offen für spätere Phase)

---

## D — Code Quality

### D1 — Race Condition in Bid Submission ✅ Done
**Priorität:** Urgent | **Status:** Fertig (2026-03-29)
`bid`-Tabelle mit `.forUpdate()` gelockt in bid/route.ts Transaktion. Verhindert doppelte Gewinner.

### D2 — Silent Email/CRM Error Handling ✅ Done
**Priorität:** Urgent | **Status:** Fertig (2026-03-29)
Alle `.catch(() => {})` durch `.catch((err) => console.error(...))` ersetzt in bids/route.ts, auction-lifecycle.ts, webhooks/stripe/route.ts.

### D3 — Input Validation Admin Routes ✅ Done
**Priorität:** High | **Status:** Fertig (2026-03-29)
`lib/validation.ts` mit `CreateAuctionBlockSchema`, `CreateBlockItemSchema`, `UpdateTransactionSchema`, `BulkShipSchema` + `validateBody` Helper. Admin-Routes POST `/admin/auction-blocks`, `/admin/auction-blocks/:id/items`, `/admin/transactions/:id`, `/admin/transactions/bulk-ship` validieren `req.body` und geben strukturierte 400-Fehler zurück. `zod@^3.23.8` in `package.json`.

### D4 — Checkout Transaction Atomicity ✅ Done
**Priorität:** High | **Status:** Fertig (2026-03-29)
DELETE + INSERT in einer DB-Transaktion gewrapped in `checkout-helpers.ts`.

### D5 — Error Boundaries Frontend ✅ Done
**Priorität:** High | **Status:** Fertig (2026-03-29)
- `components/ErrorBoundary.tsx` React Class Component mit Fallback-UI + Try Again Button
- Lot-Detail-Seite: `<ItemBidSection>` in `<ErrorBoundary name="BidSection">` gewrapped
- Account-Layout: `AccountLayoutClient` wraps `{children}` in `<ErrorBoundary name="AccountPage">` (deckt Checkout + alle Account-Pages ab)

### D6 — Fix N+1 Queries in Live-Bids ✅ Done
**Priorität:** High | **Status:** Fertig (2026-03-29)
`live-bids/route.ts`: Batch-Load aller Bids, Releases, Customers in je 1 Query statt pro Item. O(1) In-Memory Maps.

### D7 — Reduce TypeScript `any` Types ✅ Done
**Priorität:** Normal | **Status:** Fertig (2026-03-29)
`any`-Types in `ItemBidSection.tsx` (Supabase Realtime payloads) + `checkout/page.tsx` (WinEntry release_id, items array, body object) durch konkrete Inline-Types ersetzt. `release_id?: string` zu `WinEntry.item` in `types/index.ts` ergänzt. `lib/types.ts` nicht erstellt — `types/index.ts` war bereits vollständig.

### D8 — Fix Silent Fetch Errors in Checkout ✅ Done
**Priorität:** Normal | **Status:** Fertig (2026-03-29)
- `fetchError` State in Checkout-Page hinzugefügt
- `catch { /* silent */ }` → `catch (err)` mit `console.error` + `setFetchError()`
- Rote Fehlermeldung mit Refresh-Hinweis in JSX angezeigt wenn `fetchError !== null`

### D9 — Fix Bid Validation Null start_price ✅ Done
**Priorität:** Normal | **Status:** Fertig (2026-03-29)
`parseFloat(null)` → NaN Guard in bid/route.ts. Null-Check für `item.start_price` mit `isFinite()` Guard.

### D10 — Improve Loading States Frontend ✅ Done
**Priorität:** Normal | **Status:** Fertig (2026-03-29)
- `ItemBidSection`: "Place Bid" Button + Confirm-Modal-Button — SVG Spinner + `disabled` + `disabled:opacity-50 disabled:cursor-not-allowed`
- Checkout `PaymentForm`: "Pay Now" Button — SVG Spinner, bereits `disabled={paying}` vorhanden, jetzt visuell verbessert
- Shipping Estimate: auto-triggered (kein Button), kein Handlungsbedarf

### D11 — Improve Bidder Anonymization ✅ Done
**Priorität:** Normal | **Status:** Fertig (2026-03-29)
`"R***"` durch `"Bidder A3F2C1"` (SHA-256 Hash, 6 Hex-Zeichen der userId) ersetzt. Konsistent per User, nicht bruteforceable. Kein DB-Lookup mehr für Anonymisierung nötig.

### D12 — Add Explicit CORS Configuration ✅ Done
**Priorität:** Normal | **Status:** Fertig (2026-03-29)
`medusa-config.ts`: storeCors/adminCors/authCors mit Fallback-Kette: STORE_CORS → STOREFRONT_URL → localhost.

### D13 — Magic Strings → Constants ✅ Done
**Priorität:** Low | **Status:** Fertig (2026-03-29)
`backend/src/lib/constants.ts` erstellt mit LOG, AUCTION_STATUS, ITEM_STATUS, TRANSACTION_STATUS, FULFILLMENT_STATUS, PAYMENT_DEADLINE_DAYS, ANTI_SNIPE_*-Konstanten.

### D14 — Bundle Size Optimization ✅ Done
**Priorität:** Low | **Status:** Fertig (2026-03-29)
`PayPalButton` in `checkout/page.tsx` auf `next/dynamic` mit `ssr: false` + Skeleton-Loader umgestellt. PayPal JS SDK wird nur geladen wenn User PayPal wählt. `ShareButton` + `BidHistoryTable` in Lot-Detail Server Component — Code-Split bereits durch Client/Server-Boundary, kein `dynamic()` nötig.

---

## Fortschritt

| Issue | Titel | Status | Fertig |
|-------|-------|--------|--------|
| A1 | Test Concept Document | ⏳ Todo | — |
| A2 | Playwright E2E Suite | ✅ Done | 2026-03-29 |
| A3 | Test Results Dashboard UI | ⏳ Todo | — |
| B1 | Unsubscribe Links | ⏳ Todo | — |
| B2 | Double Opt-In Newsletter | ⏳ Todo | — |
| B3 | Admin Email Template UI | ⏳ Todo | — |
| B4 | Professional Email Templates | ⏳ Todo | — |
| C1 | Brevo List IDs Config | ✅ Done | 2026-03-29 |
| C2 | Sentry Setup | ✅ Done | 2026-03-29 |
| C3 | Gate Password Policy | ✅ Done | 2026-03-29 |
| C4 | Double-Opt-In Fix | ⏳ Todo | — |
| C5 | Hotjar Integration | ✅ Done | 2026-03-29 |
| C6 | Uptime Monitoring | ✅ Done | 2026-03-29 |
| C7 | GA4 E-Commerce Events | ✅ Done | 2026-03-29 |
| D1 | Race Condition Bid | ✅ Done | 2026-03-29 |
| D2 | Silent Error Handling | ✅ Done | 2026-03-29 |
| D3 | Input Validation Admin | ✅ Done | 2026-03-29 |
| D4 | Checkout Atomicity | ✅ Done | 2026-03-29 |
| D5 | Error Boundaries | ✅ Done | 2026-03-29 |
| D6 | N+1 Queries Live-Bids | ✅ Done | 2026-03-29 |
| D7 | TypeScript any Types | ✅ Done | 2026-03-29 |
| D8 | Silent Fetch Errors | ✅ Done | 2026-03-29 |
| D9 | Bid Null Validation | ✅ Done | 2026-03-29 |
| D10 | Loading States | ✅ Done | 2026-03-29 |
| D11 | Bidder Anonymization | ✅ Done | 2026-03-29 |
| D12 | CORS Config | ✅ Done | 2026-03-29 |
| D13 | Magic Strings | ✅ Done | 2026-03-29 |
| D14 | Bundle Size | ✅ Done | 2026-03-29 |

---

## Agent-Partitionierung (No-Conflict)

| Agent | Workstream | Dateien |
|-------|-----------|---------|
| Agent-Backend | D1,D2,D4,D6,D9,D12 | `bid/route.ts`, `checkout-helpers.ts`, `live-bids/route.ts`, `webhooks/` |
| Agent-Email | B1,B2,B3,B4 | `emails/`, `lib/email-helpers.ts`, `api/admin/emails/` (new) |
| Agent-Frontend | C5,C7,D3,D5,D7,D8,D10,D11,D14 | `storefront/src/` |
| Agent-Config | C1,C2,C3,D12,D13 | `medusa-config.ts`, `storefront/.env`, config files |
| Agent-Testing | A1,A3 | `docs/TEST_CONCEPT.md`, `storefront/src/app/admin/test-runner/` |
