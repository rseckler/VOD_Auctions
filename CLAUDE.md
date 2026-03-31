# VOD_Auctions — CLAUDE.md

**Purpose:** Auktionsplattform für ~41.500 Produkte (Industrial Music Tonträger + Literatur/Merchandise)
**Goal:** Eigene Plattform statt 8-13% eBay/Discogs-Gebühren
**Status:** Phase 1 fertig — RSE-77 (Testlauf) als nächster Schritt
**Language:** Storefront + Admin-UI: Englisch
**Last Updated:** 2026-04-07

**GitHub:** https://github.com/rseckler/VOD_Auctions
**Publishable API Key:** `pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d`

## Tech Stack

| Component | Technology |
|-----------|------------|
| Commerce | Medusa.js 2.x (Port 9000) |
| Frontend | Next.js 16, React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, shadcn/ui, Framer Motion |
| Design | "Vinyl Culture" — DM Serif Display + DM Sans, Gold #d4a54a, dark #1c1915 |
| Database | Supabase PostgreSQL (proj: `bofblwqieuvmqybzxapx`, eu-central-1) |
| Realtime | Supabase Realtime (Live-Bidding) |
| Cache | Upstash Redis |
| Payments | Stripe + PayPal Direct |
| Hosting | VPS 72.62.148.205 (PM2 + nginx), Medusa Admin |
| State | Zustand (global) + React Query (server) |

## Dev Commands

```bash
# Backend (port 9000)
cd backend && npx medusa develop

# Storefront (port 3000 local, 3006 VPS)
cd storefront && npm run dev

# Admin: http://localhost:9000/app — admin@vod.de / admin123
# Clickdummy (port 3005): cd clickdummy && npm run dev -- -p 3005

# Migrations
cd backend && npx medusa db:generate auction && npx medusa db:migrate
```

## VPS Deploy

**URLs:** https://vod-auctions.com (port 3006) | https://api.vod-auctions.com (port 9000) | https://admin.vod-auctions.com
**PM2:** `vodauction-backend` | `vodauction-storefront`

**SSH Rate-Limiting:** Hostinger sperrt IP nach 2-3 schnellen Verbindungen (~10-15 Min). SSH ControlMaster in `~/.ssh/config` (ControlPersist 30m) nutzen. Nie parallele SSH-Calls.

```bash
# Backend + Admin deployen
ssh root@72.62.148.205
cd /root/VOD_Auctions && git pull && cd backend
npx medusa build
rm -rf public/admin && cp -r .medusa/server/public/admin public/admin  # PFLICHT!
pm2 restart vodauction-backend

# Storefront deployen
cd /root/VOD_Auctions/storefront
npm run build && pm2 restart vodauction-storefront
```

**Admin Build Gotcha:** `medusa build` → `.medusa/server/public/admin/`. Muss nach `public/admin/` kopiert werden — sonst 502 Bad Gateway!

**Neue Admin-Route hinzugefügt?** Vite-Cache clearen vor dem Build: `rm -rf node_modules/.vite .medusa && npx medusa build`. Sonst registriert der Vite-Plugin die neue Route nicht (→ 404 oder silent crash).

**Git Workflow:** NIE `git pull` auf VPS machen wenn VPS-Code nicht vorher auf GitHub gepusht wurde. Deploy-Reihenfolge IMMER: `git push origin main` auf Mac → dann `git pull` auf VPS. Sonst sagt VPS "Already up to date" obwohl neue Commits fehlen.

**Neue API-Route nicht in Build:** Wenn `backend/src/api/admin/X/route.ts` nach dem Build nicht in `.medusa/server/src/api/admin/X/` erscheint → Clean Build: `rm -rf .medusa node_modules/.vite && npx medusa build`. Inkrementelle Builds registrieren neue Route-Verzeichnisse nicht zuverlässig.

## Key Gotchas

- **Knex DECIMAL als String:** `.toFixed()` direkt auf Knex-Ergebnis crasht → immer `Number(value).toFixed()`
- **Knex Subquery:** `.where("col", pgConnection.raw('(SELECT ...)'))` funktioniert nicht → Wert erst abfragen, dann direkt einsetzen
- **Medusa ULID IDs:** Bei Knex-Insert immer `id: generateEntityId()` aus `@medusajs/framework/utils` mitgeben — sonst `NOT NULL violation`
- **Stripe Webhook Raw Body:** `rawBodyMiddleware` in `middlewares.ts` NICHT entfernen — ohne es scheitern ALLE Webhooks mit "No webhook payload"
- **Admin Routes:** `defineRouteConfig()` NUR auf Top-Level `page.tsx`, NICHT auf `[id]/page.tsx` (Routing-Konflikte)
- **Admin Route Pfade:** Niemals native Medusa-Pfade verwenden (`customers`, `orders`, `products`, `settings` etc.) → native Route gewinnt immer. Stattdessen eigene Pfade: `crm`, `auction-blocks`, `catalog` etc.
- **Vite Cache bei neuen Admin-Routen:** Neues `src/admin/routes/X/`-Verzeichnis → VPS Vite-Cache MUSS gecleart werden: `rm -rf node_modules/.vite .medusa && npx medusa build`. Sonst findet der Vite-Plugin die neue Route nicht → 404 oder korrupter Bundle → silent crash.
- **CamelCase vs snake_case:** Legacy-Tabellen (`Release`, `Artist`) → camelCase; Auction-Tabellen → snake_case
- **SSL Supabase:** `rejectUnauthorized: false` in `medusa-config.ts` nötig
- **Medusa/Vite Build:** IIFE `(() => {...})()` in JSX-Ternary → silent build failure → Blank Page. Separate Komponenten verwenden.
- **pdfkit auf VPS:** Nach jedem Deploy `npm install` ausführen wenn neue Native-Dependencies dazu kommen. `pdfkit` fehlt → `Cannot find module` → PM2 restart-loop. Steht jetzt in `package.json`.
- **Discogs Prices ausgeblendet:** `{/* HIDDEN: ... */}` Marker in 5 Storefront-Dateien. Wiederherstellen wenn echte Sale-Daten verfügbar.
- **LEFT JOIN in Transaction APIs:** Direktkäufe haben kein `block_item_id` → immer LEFT JOIN, nie INNER JOIN
- **COALESCE:** `COALESCE(block_item.release_id, transaction.release_id)` in Transaction-Queries

## Database Schema

### Legacy Tabellen (camelCase, Knex-Only)
- `Release` — ~41.500 Produkte (product_category: release/band_literature/label_literature/press_literature). Visibility: `coverImage IS NOT NULL`. Kaufbar: `legacy_price > 0`.
- `Artist`, `Label`, `PressOrga`, `Format` (39 Einträge), `Image` (+`rang` für Ordering), `Track`, `ReleaseArtist`
- `entity_content` — CMS für Band/Label/Press Seiten (description, short_description, genre_tags TEXT[], external_links JSONB, is_published, ai_generated)
- `gallery_media` — Gallery CMS (section, position, is_active). 9 Sektionen.
- `content_block` — CMS für Homepage/About/Auctions (JSONB, page+section unique)
- `shipping_method`, `shipping_rate`, `shipping_zone`, `shipping_item_type`, `shipping_config`
- `site_config` — catalog_visibility (all/visible)
- `musician`, `musician_role`, `musician_project` — Musikerdatenbank (897 Musiker, 189 Bands)
- `promo_code` — Rabatt-Codes (code UNIQUE, discount_type, discount_value, max_uses, used_count, valid_from/to)
- `order_event` — Audit Trail (order_group_id, event_type, title, details JSONB, actor)
- `LabelPerson` + `LabelPersonLink` — Backend-Referenzdaten (nicht public, 458 Personen)

### Medusa Auction Tabellen (snake_case, ORM+Knex)
- `auction_block` — Themen-Auktionsblöcke (status: draft/scheduled/preview/active/ended/archived)
- `block_item` — Release → Block (lot_number, start_price, current_price, bid_count, lot_end_time)
- `bid` — Gebote (amount, max_amount, is_winning, is_outbid, user_id)
- `transaction` — Zahlungen (status: pending/paid/refunded/failed, fulfillment_status, order_number VOD-ORD-XXXXXX, payment_provider: stripe/paypal, order_group_id, block_item_id NULLABLE, release_id, item_type: auction/direct_purchase)
- `cart_item` — Direktkauf-Warenkorb (user_id, release_id, price)
- `saved_item` — Merkliste (user_id, release_id, soft-delete via deleted_at)

### CRM Tabellen (snake_case)
- `customer_stats` — Aggregierte Kundendaten (total_spent, total_purchases, total_bids, total_wins, last_purchase_at, last_bid_at, tags TEXT[], is_vip ≥€500, is_dormant >90 Tage kein Kauf). Stündlicher Recalc via Cron-Job. Manueller Refresh: `POST /admin/customers/recalc-stats`.
- `customer_note` — Interne Admin-Notizen (customer_id, body, author_email, soft-delete)
- `customer_audit_log` — DSGVO-Audit-Trail (customer_id, action, details JSONB, admin_email)

### Release sale_mode
- `auction_only` (default) | `direct_purchase` | `both`

### Migrierte Daten
- 12.451 Artists, 3.077 Labels, ~41.529 Releases, ~75.124 Images, 1.983 PressOrga
- Releases: 30.159 release + 3.915 band_literature + 1.129 label_literature + 6.326 press_literature
- CoverImage: release 97%+, band_lit 93.5%, label_lit 95.7%, press_lit 94.2%
- IDs: `legacy-artist-{id}`, `legacy-label-{id}`, `legacy-release-{id}`, etc.

## API Quickref

### Store (x-publishable-api-key required)
- `GET /store/auction-blocks` — Öffentliche Blöcke
- `GET /store/auction-blocks/:slug` — Block + Items
- `GET /store/catalog` — 41k Releases (q, category, format, country, year_from/to, label, for_sale, sort, order, limit, offset)
- `GET /store/catalog/:id` — Release-Detail + Images + Related
- `GET /store/band/:slug` | `/store/label/:slug` | `/store/press/:slug` — Entity-Seiten
- `GET /store/gallery` — Gallery Media + Content (?absolute_urls=true für Newsletter)
- `POST /store/account/bids` — Gebot abgeben (auth)
- `POST /store/account/create-payment-intent` — Stripe Checkout
- `POST /store/account/create-paypal-order` / `capture-paypal-order` — PayPal
- `GET /store/account/cart` | `POST` | `DELETE /store/account/cart/:id` — Warenkorb
- `GET /store/account/orders` — Order History (grouped by order_group_id)
- `GET /store/account/orders/:groupId/invoice` — PDF-Rechnung (pdfkit)
- `GET /store/account/saved` — Merkliste (inkl. block_item_id + block_slug wenn Lot aktiv → Link direkt zu Auktion)
- `GET /store/account/status` — cart_count + saved_count + wins_count
- `GET /store/account/gdpr-export` — DSGVO Datenexport (auth)

### Admin (credentials required)
- `POST /admin/ai-chat` — AI Assistant Chat (SSE Streaming, Claude Haiku, 5 read-only Tools)
- `GET/POST /admin/auction-blocks` — Blocks CRUD
- `DELETE /admin/auction-blocks/:id` — Löschen (nur draft/ended/archived, Releases → available)
- `GET /admin/auction-blocks/:id/live-bids` — Live Bid Monitor (volle Namen)
- `GET /admin/auction-blocks/:id/bids-log` — Chronologischer Bid-Log (?limit=300)
- `GET /admin/transactions` — Orders (?q, status, fulfillment_status, payment_provider, shipping_country, date_from, date_to, sort, limit, offset)
- `POST /admin/transactions/:id` — Ship/Refund/Note/Cancel/mark_refunded
- `GET /admin/transactions/:id/shipping-label` — Shipping Label PDF (pdfkit)
- `POST /admin/transactions/bulk-ship` — Bulk Mark-as-Shipped
- `POST /admin/transactions/export` — CSV Export (BOM, Excel-kompatibel)
- `GET /admin/media` — 41k Releases (q, category, format, country, label, has_discogs, sort field:dir)
- `GET /admin/entity-content/overhaul-status` — Entity Overhaul Status + Budget
- `GET /admin/sync/discogs-health` | `POST` — Discogs Sync Health + Actions
- `GET /admin/customers/list` — Paginated Customer-Liste mit Stats (?q, sort, limit, offset)
- `GET|PATCH /admin/customers/:id` — Customer-Detail + Edit (name/email/phone/tags/is_vip)
- `POST /admin/customers/recalc-stats` — Force-Recalc aller customer_stats aus live Daten
- `GET /admin/customers/export` — CSV aller Kunden (BOM, 13 Spalten)
- `GET|POST /admin/customers/:id/notes` + `DELETE .../notes/:noteId` — Interne Notizen
- `GET /admin/customers/:id/timeline` — Unified Event-Feed (bid/order/note)
- `POST /admin/customers/:id/block` + `/unblock` | `/anonymize` | `/gdpr-export` | `/delete`

## Payment

**Stripe:** `acct_1T7WaYEyxqyK4DXF`, frank@vod-records.com, Live-Mode
**Webhook:** `https://api.vod-auctions.com/webhooks/stripe` (Events: checkout.session.completed/expired + payment_intent.succeeded/payment_failed)
**Methoden:** Card, Klarna, Bancontact (BE), EPS (AT), Link

**PayPal:** frank@vod-records.com, Live-Mode
**Webhook:** `https://api.vod-auctions.com/webhooks/paypal` (ID: `95847304EJ582074L`)
**Events:** PAYMENT.CAPTURE.COMPLETED/DENIED/REFUNDED
**Architektur:** JS SDK client-side Order-Erstellung (`actions.order.create()`) wegen Sandbox-Bug mit EUR/DE-Accounts

**Transaction Status:**
- `status`: pending → paid → refunded/partially_refunded/cancelled/failed
- `fulfillment_status`: unfulfilled → packing → shipped → delivered/returned
- `order_number`: VOD-ORD-XXXXXX (generiert bei Payment-Success)

## Checkout Flow (One-Page, Two-Column)

Shipping Address → Shipping Method → Stripe PaymentElement inline → "Pay Now" → `stripe.confirmPayment()`
- Kein Redirect für Cards, Redirect für Klarna/EPS/Bancontact → `?redirect_status=succeeded`
- PayPal: separater Radio-Selector + `PayPalButton.tsx`
- Checkout Phase C offen: Apple Pay/Google Pay, Google Places, gespeicherte Adressen

## Shipping

Gewichtsbasiert, 3 Zonen (DE/EU/World), 13 Artikeltypen, 15 Gewichtsstufen.
Admin: `/admin/shipping` (5 Tabs: Settings, Item Types, Zones & Rates, Methods, Calculator)
Fallback: DE €4.99 / EU €9.99 / World €14.99

## Email

**Resend** (`noreply@vod-auctions.com`, frank@vod-records.com) — 6 Transaktionale Mails (welcome, bid-won, outbid, payment, shipping, feedback-request)
**Brevo** (`newsletter@vod-auctions.com`) — 4 Newsletter-Templates (IDs 2-5), CRM (3.580 tape-mag Kontakte, List ID 5)

## Entity Content Overhaul (RSE-227)

**Status:** P2 PAUSED — 576/3.650 Entities (Budget $96/$120). Resumes 2026-04-01 mit $100 Budget.
**Pipeline:** `scripts/entity_overhaul/` — 10 Python-Module, GPT-4o Writer + GPT-4o-mini
**Kosten:** ~$0.035/Entity. Restliche ~15.574 Entities (P2+P3) = ~$553 geschätzt.
**P1 Done:** 1.013 accepted, Score Ø 82.3
**Budget-Zeitplan:** Apr $100 → Mai $100 → ... (~6 Monate bis fertig)
**Admin:** `/admin/entity-content` (Status + Budget Dashboard) + `/admin/musicians`
**Pipeline starten:** `cd scripts && source venv/bin/activate && python3 entity_overhaul/orchestrator.py`

## Credentials (in .env / .env.local, git-ignored)

```
# Backend .env
DATABASE_URL, MEDUSA_ADMIN_ONBOARDING_TYPE
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE=live, PAYPAL_WEBHOOK_ID
RESEND_API_KEY
BREVO_API_KEY, BREVO_LIST_VOD_AUCTIONS=4, BREVO_LIST_TAPE_MAG=5
SUPABASE_SERVICE_ROLE_KEY  # Für Anti-Sniping Realtime Broadcast
REVALIDATE_SECRET, STOREFRONT_URL=https://vod-auctions.com
RUDDERSTACK_WRITE_KEY, RUDDERSTACK_DATA_PLANE_URL=secklerrovofrz.dataplane.rudderstack.com
ANTHROPIC_API_KEY  # AI Assistant (Claude Haiku)

# Storefront .env.local
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_PAYPAL_CLIENT_ID
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_BREVO_CLIENT_KEY
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-M9BJGC5D69
RUDDERSTACK_WRITE_KEY, RUDDERSTACK_DATA_PLANE_URL
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
GATE_PASSWORD=vod2026, REVALIDATE_SECRET

# scripts/.env
OPENAI_API_KEY, LASTFM_API_KEY, YOUTUBE_API_KEY, BRAVE_API_KEY
SUPABASE_DB_URL, LEGACY_DB_*
```

## Test Accounts

- `bidder1@test.de` / `test1234` (Customer: `cus_01KJPXG37THC2MRPPA3JQSABJ1`)
- `bidder2@test.de` / `test1234` (Customer: `cus_01KJPXRK22VAAK3ZPHHXRYMYQT`) — winning bid Lot #1
- `testuser@vod-auctions.com` / `TestPass123!` (Customer: `cus_01KJZ9AKFPNQ82QCNB3Q6ZX92T`) — Direktkauf-Tests
- Test Block: "Industrial Classics 1980-1985" (`01KJPSH37MYWW9MSJZDG58FT1G`, status: ended)
- Lot #1: Cabaret Voltaire (`01KJPSJ04Z7CW37FY4E8KZ1SVJ`) — bidder2
- Lot #2: release-4104 (`01KJPSJ0BP5K9JH4EKARB6T3S3`) — testuser
- Stripe Test-Karte: `4242 4242 4242 4242`
- Stripe Webhook lokal: `stripe listen --forward-to localhost:9000/webhooks/stripe`

## Cronjobs (VPS)

```bash
# Legacy MySQL → Supabase (täglich 04:00 UTC)
0 4 * * * cd ~/VOD_Auctions/scripts && venv/bin/python3 legacy_sync.py >> legacy_sync.log 2>&1
# Discogs Daily (Mo-Fr 02:00 UTC, 5 Chunks rotating)
0 2 * * 1-5 cd ~/VOD_Auctions/scripts && venv/bin/python3 discogs_daily_sync.py >> discogs_daily.log 2>&1
```

**Python venv:** `scripts/venv/` — psycopg2-binary, python-dotenv, requests, mysql-connector-python, openai, musicbrainzngs

## Data Sync Scripts

```bash
cd VOD_Auctions/scripts && source venv/bin/activate

python3 legacy_sync.py           # Incremental sync (daily)
python3 discogs_daily_sync.py    # Daily Discogs price update (Mon-Fri chunks)
python3 discogs_daily_sync.py --chunk 2 --rate 25  # Specific chunk

# Entity Content Overhaul
python3 entity_overhaul/orchestrator.py --type artist --phase P2
python3 entity_overhaul/orchestrator.py --dry-run --limit 5

# Label Enrichment (3-Phase Pipeline)
python3 validate_labels.py       # All 3 phases → review CSV
python3 validate_labels.py --commit data/label_validation_review.csv

# CRM Import
python3 crm_import.py --phase 2  # tape-mag contacts
```

## Project Structure (Key Files)

```
VOD_Auctions/
├── backend/src/
│   ├── modules/auction/models/    # auction-block, block-item, bid, transaction, cart-item, saved-item
│   ├── api/admin/                 # auction-blocks/, media/, transactions/, entity-content/, gallery/, sync/
│   ├── api/store/                 # auction-blocks/, catalog/, band/, label/, press/, gallery/, account/
│   ├── api/webhooks/              # stripe/, paypal/, brevo/
│   ├── api/middlewares.ts         # Auth + rawBodyMiddleware (DON'T REMOVE rawBody!)
│   ├── lib/                       # stripe.ts, paypal.ts, checkout-helpers.ts, shipping.ts, brevo.ts, crm-sync.ts
│   └── admin/routes/              # auction-blocks/, media/, transactions/, entity-content/, gallery/, sync/
├── storefront/src/
│   ├── app/                       # catalog/, auctions/, band/, label/, press/, gallery/, about/, account/
│   ├── components/                # AuthProvider, Header, Footer, ItemBidSection, BlockItemsGrid, ImageGallery, CollapsibleDescription
│   └── middleware.ts              # Pre-launch password gate (GATE_PASSWORD=vod2026)
├── scripts/
│   ├── legacy_sync.py             # Daily MySQL→Supabase sync (bilder_typ: release=10, band=13, label=14, press=12)
│   ├── discogs_daily_sync.py      # Daily Discogs (5 chunks, exponential backoff)
│   └── entity_overhaul/           # 10-Module Pipeline (orchestrator, enricher, writer, quality_agent, ...)
├── nginx/                         # vodauction-api.conf, vodauction-store.conf, vodauction-admin.conf
└── docs/
    ├── architecture/CHANGELOG.md  # Vollständiger Changelog
    ├── architecture/AUCTION_WORKFLOW_KONZEPT_REVIEW_2026.md
    └── ux/UX_UI_AUDIT_2026-03-15.md  # 95 Findings (alle erledigt)
```

**bilder_typ Mapping (WICHTIG — Regression-Schutz):**
- typ=10: releases | typ=13: band_literature | typ=14: labels_literature | typ=12: pressorga_literature

## Core Concepts

**Themen-Block-Modell:** Alle Auktionen in kuratierten Blöcken (1-500 Items). Redaktioneller Content pro Block. Produkt-Reservierung: available → reserved → in_auction → sold/unsold.

**Block-Typen:** Themen-Block (Genre/Künstler/Epoche) | Highlight-Block (High-Value, lang) | Clearance-Block (200-500 Items, 1€) | Flash-Block (24h, 1-10 Items)

**Password Gate:** `middleware.ts` + `gate/page.tsx`. Entfernen beim Launch: `middleware.ts` löschen + `layout.tsx` Cookie-Check entfernen.

**Catalog Visibility:** Artikel mit `coverImage IS NOT NULL` = sichtbar. `legacy_price > 0` = kaufbar (`is_purchasable`).

## Linear

**Project:** https://linear.app/rseckler/project/vod-auctions-37f35d4e90be
**Nächster Schritt:** RSE-77 (Testlauf — 1 Block mit 10-20 Produkten)
**In Progress:** RSE-227 (Entity Content Overhaul, P2 paused bis 01.04.2026)
**Backlog:** RSE-78 (Launch, offen: AGB-Anwalt) | RSE-79 (Erste öffentliche Auktionen) | RSE-80 (Marketing)

## Recent Changes

### 2026-04-07 — Prio 1/2/3 Fix Session: 14 Fixes (Bugs, UX, Visual Polish)

- **Newsletter URL fix:** `newsletter/route.ts` — confirmation link used `localhost:9000` in production; now uses `BACKEND_URL ?? MEDUSA_BACKEND_URL ?? "https://api.vod-auctions.com"`
- **BlockItemsGrid price sort:** "Price ↑" was sorting by `start_price`; now sorts by `current_price || start_price` (correct live auction price)
- **Catalog country filter:** Changed text input to `<select>` dropdown with 19 countries + "Other"
- **Safari number spinners:** Added CSS to remove native spinner arrows on number inputs (`-webkit-appearance: none`, `-moz-appearance: textfield`)
- **Back button on catalog detail:** Added "← Back" button above breadcrumb using existing `CatalogBackLink` client component
- **Footer:** Removed "Navigation" column; added "Contact" section (shop@vod-records.com, Mon–Fri hours, Open in Maps); removed Instagram icon
- **Format tags moved:** Removed absolute-positioned image overlay badges in BlockItemsGrid + CatalogClient; format now appears as inline text tag below the image in the card body
- **Pulse animation toned down:** Custom `@keyframes pulse` in globals.css — opacity 1→0.6 (was 1→0.1), duration 2s (was 1s)
- **User avatar:** Removed name text from HeaderAuth dropdown trigger (avatar circle only); saved-count badge changed from rose-500 to gold (`#d4a54a`)
- **Gallery quote:** "Browse the full catalogue →" → "Explore the archive →"
- **Card text readability:** Increased low-opacity card footer text from `/40` to `/70`

### 2026-04-07 — Prio 1–4: UX, Loading, Gallery Redesign (19 Fixes)

#### Prio 1 — Functional Bugs
- **Newsletter-URL:** Bestätigungsmail verwendete `localhost:9000` → jetzt `BACKEND_URL ?? https://api.vod-auctions.com`
- **Preis-Sort:** `BlockItemsGrid` sortiert jetzt nach `current_price || start_price` (live Gebotspreis)
- **Back-Button:** Catalog-Detailseite (`catalog/[id]`) hat jetzt einen `← Back`-Button oben

#### Prio 2 — UX
- **Country-Filter:** Text-Input → Select-Dropdown mit 19 Ländern + "Other"
- **Safari-Spinner:** `-webkit-appearance: none` in globals.css — keine Zahlenpfeile in Number-Inputs
- **Footer:** "Navigation"-Spalte entfernt, "Contact"-Sektion (E-Mail, Öffnungszeiten, Google Maps) hinzugefügt, Instagram-Link entfernt

#### Prio 3 — Visual Polish
- **Skeleton-Farbe:** `bg-accent` (#d4a54a gold) → `bg-[#2a2520]` (dunkles Grau, kaum sichtbar auf #1c1915) — betrifft alle 7 loading.tsx-Dateien auf einmal
- **TopLoadingBar:** Neues `TopLoadingBar.tsx` — 2px Gold-Fortschrittsbalken beim Seitenwechsel (YouTube-Style), in layout.tsx eingebunden
- **Stagger-Animation:** Halbiert (delay 80ms→40ms, y 16→8, duration 350ms→200ms) via `storefront/src/lib/motion.ts`
- **Pulse-Animation:** Gedämpft (opacity 1→0.6, 2s Dauer) in globals.css
- **Format-Tags:** Von Bild-Overlay in den Card-Body verschoben (kein absolutes Positioning mehr)
- **Card-Text:** `/40` → `/70` Opacity für bessere Lesbarkeit
- **User-Avatar:** Kein Name-Text mehr im Trigger (nur Avatar-Icon)
- **Saved-Badge:** Farbe → Gold `#d4a54a`
- **Gallery-Quote:** "Browse the full catalogue →" → "Explore the archive →"

#### Prio 4 — Gallery Redesign (`gallery/page.tsx`)
- **Section 3 (Visual Gallery):** Hero-Bild #1 full-width `aspect-[16/9]` + 5 einheitliche Tiles `aspect-[4/3]` 3-Spalten-Grid, Container max-w-7xl
- **Section 4 (The Collection):** Overlay-Cards → Vertikal (Bild oben, Text darunter), 2-Spalten, letztes Element (5.) automatisch `col-span-2` full-width
- **Section 5 (From the Archive):** Horizontales 192px-Thumbnail → Vertikale Karte mit `aspect-[4/3]` Vollbreiten-Bild (~580px auf Desktop, 3× größer)
- **Section 6 (Listening Room):** Asymmetrisches Grid `1fr 1.2fr`, `aspect-[3/2]` statt 4/3

---

### 2026-04-06 — Bug-Fix Session: 7 Fixes (Rendering, Bidding, Webhooks, UX)

#### Stripe Webhook: charge.refunded Handler
- **Problem:** Refund über Stripe-Dashboard setzte `auction_status` nie zurück → Release blieb "Sold".
- `case "charge.refunded"` in `webhooks/stripe/route.ts`: findet TX via `stripe_payment_intent_id`, setzt `refunded` + `auction_status = available` + Audit-Event.
- DB-Fix: `legacy-release-28352` ("Das Spiel") manuell via Supabase korrigiert.
- `charge.refunded` im Stripe-Dashboard Webhook-Endpoint aktiviert.

#### Catalog Mobile: All Items / For Sale Toggle
- Toggle war auf Mobile im horizontalen Scroll versteckt (ml-auto). Jetzt eigene Zeile auf `< sm`, Desktop unverändert.

#### FOUC Fix: html background-color
- `html { background-color: #1c1915; }` in `globals.css` — eliminiert weißes Aufblitzen zwischen Seitenwechseln.

#### Bid Form: 4 Bugs (`ItemBidSection.tsx`)
- **Amount-Reset:** `useEffect` fehlte `suggestedBidUsed.current = true` → Realtime-Updates überschrieben User-Eingabe. Fix: functional setState + korrektes Flag.
- **Modal €0.00:** Folge des Amount-Reset-Bugs — behoben.
- **Native Validation Blocker:** `min` Attribut auf `<input type="number">` blockierte Submit mit Browser-Bubble. Fix: `min` entfernt, `type="button"` + manuelle Toast-Validierung.
- **Proxy-Toggle Layout-Shift:** `flex flex-col gap-3` + `AnimatePresence initial={false}` + transition duration.

#### Z-Index Hover — Lot-Karten (`BlockItemsGrid.tsx`)
- Gehovertes Lot erschien hinter Nachbarkarte. Fix: `className="relative hover:z-10"` auf `motion.div` Wrapper.

#### Account Skeleton
- `account/loading.tsx`: Statt 5 Overview-Kacheln jetzt 3 generische Rows (neutral für alle Sub-Pages).
- Cart-Skeleton: Von 2× `h-24` Blöcken zu layout-passendem Skeleton (64px Bild + Text + Preis).

---

### 2026-04-05 — Admin Mobile Overflow: Deep Fix (Medusa DOM + Deploy Bug)

#### Deploy-Bug (Ursache aller vorherigen gescheiterten Fix-Runden)
- `cp -r .medusa/server/public/admin public/admin` ohne vorheriges `rm -rf public/admin` legt den neuen Bundle als Unterverzeichnis `public/admin/admin/` ab — alter Bundle bleibt aktiv. Alle vorherigen Runs hatten damit keinerlei Wirkung.
- **Korrekte Deploy-Sequenz** (jetzt in Gotchas dokumentiert): `rm -rf public/admin && cp -r .medusa/server/public/admin public/admin`

#### CSS-Fix — `admin-nav.tsx` `injectNavCSS()`
- Medusa's `<main>` nutzt `items-center` in `flex-col`: Flex-Children mit `min-width: auto` + breitem Tabelleninhalt expandieren über den Gutter → `items-center` zentriert den überbreiten Div → linker Rand unsichtbar im negativen x-Bereich.
- Neue Regeln: `main { align-items: flex-start }` + `main > * { min-width: 0 }` + `main > * > * { min-width: 0; overflow-x: hidden }`.
- JS `fixMobileScrollContainers()` setzt Inline-Styles direkt auf `<main>` und läuft alle Ancestors bis `<body>` durch (`overflow-x: hidden`, `scrollLeft = 0`).

#### Per-Page Root Divs (7 Dateien)
- `minWidth: 0, width: "100%", overflowX: "hidden", boxSizing: "border-box"` in: `media/page.tsx`, `crm/page.tsx`, `entity-content/page.tsx`, `musicians/page.tsx`, `sync/page.tsx`, `media/[id]/page.tsx`

---

### 2026-04-04 — Admin Mobile Overflow Fix (5 Pages)

#### Admin Header Rows: flex-wrap
- `auction-blocks/page.tsx`: Header `flex-wrap` + `gap-3` → Title + "Create New Auction" Button wrappen auf Mobile.
- `auction-blocks/[id]/page.tsx`: Header + Button-Row (Send Newsletter, Storefront, Back, Save) `flex-wrap` → kein Overflow mehr.
- `crm/page.tsx`: Header-Row (Search + Recalc Stats + Export CSV) `flexWrap: "wrap"`.
- `transactions/page.tsx`: Header-Row (Orders + Export CSV) `flexWrap: "wrap"`.
- `media/page.tsx`: Header-Row (Media Management + Browse Images) `flexWrap: "wrap"`.
- `overflow-x: hidden` auf `html`/`body` war bereits via `injectNavCSS()` aktiv — fehlende `flex-wrap` war die Ursache der Darstellungsfehler.

### 2026-04-03 — Code Review Pass: 14 Fixes (Backend, Components, Pages, Types)

#### Backend
- `catalog/route.ts` + `catalog/[id]/route.ts` + `auction-blocks/[slug]/route.ts` + `items/[itemId]/route.ts`: `product_category` im SELECT ergänzt wo fehlend.
- `account/status/route.ts`: `active_bids_count` filtert jetzt nur `["active"]` statt `["active","preview"]` — kein UX-Mismatch mehr.

#### Types & Utils
- `types/index.ts`: `pressorga_*` → `press_orga_*`, `product_category?: string` → `product_category?: string | null`.
- Category-aware `contextName`/`contextHref`-Logik in allen 6 Dateien konsistent: release/band_lit → artist, label_lit → label, press_lit → press_orga.

#### Components
- `BlockItemsGrid.tsx`: Suche + Sort "artist" category-aware (PressOrga, Label, Artist).
- `CatalogClient.tsx`: Doppeltes `product_category` entfernt, subtitle category-aware.
- `CatalogRelatedSection.tsx` + `RelatedSection.tsx`: Category-aware subtitle.
- `AuthProvider.tsx`: `setBidsCount(0)` auf Logout ergänzt.
- `ItemBidSection.tsx`: `max_updated` Branch updatet `currentPrice`/`bidCount` State vor Toast.

#### Pages
- `catalog/[id]/page.tsx`: `formatColorKey()` ergänzt, Format Badge fix, JSON-LD byArtist nur für release/band_lit, `contextName ?? null` für TypeScript.
- `auctions/[slug]/[itemId]/page.tsx`: Breadcrumb, subtitle, ShareButton, JSON-LD, RelatedSection — alle category-aware.
- `label/[slug]/page.tsx`: `|| "Unknown"` Fallback entfernt.

### 2026-04-03 — PressOrga Subtitle vollständig (alle 6 Bereiche)

#### PressOrga JOIN + Category-aware Context
- `press_literature` (6.326 Items) hatte alle `pressOrgaId` verknüpft — aber kein JOIN im Backend.
- Backend: LEFT JOIN `PressOrga` in allen 4 Store-Routes → `press_orga_name` + `press_orga_slug`.
- Storefront: `contextName`/`contextHref` in `BlockItemsGrid`, `CatalogClient`, `CatalogRelatedSection`, `RelatedSection`, `catalog/[id]/page.tsx`, `auctions/[slug]/[itemId]/page.tsx`.
- Logik: `release`/`band_literature` → artist, `label_literature` → label, `press_literature` → press_orga.
- "Unknown" komplett entfernt aus allen Subtitle-Bereichen.

### 2026-04-03 — Mag/Lit/Photo Subtitle, Bid UX, Mobile, SEO, Security

#### Mag/Lit/Photo Subtitle Logic
- `BlockItemsGrid.tsx`: Karten-Untertitel zeigt `label_name` für Lit/Mag/Photo-Kategorien statt `artist_name`.
- `auctions/[slug]/[itemId]/page.tsx`: Breadcrumb, Subtitle-Link, ShareButton, JSON-LD — alle nutzen `contextName` (category-aware). Backend: `Release.product_category` in beiden Block-Routes ergänzt.

#### Bid UX
- Bereits Höchstbietende können Gebot erhöhen. Backend: `amount` als neues Maximum wenn kein `max_amount`. Response `max_updated: true` + Success-Toast "Maximum bid raised".
- Outbid-Toast: Klarer Fehler mit aktuellem Preis statt generischem "You are not the highest bidder".

#### Mobile
- `overflow-x: hidden` auf `html`/`body` — kein horizontales Schieben mehr auf mobilen Seiten.
- "My Bids (N)" im Mobile Nav via `active_bids_count` aus `/store/account/status`.
- Sticky "Auction ended" Footer ausgeblendet (nur noch bei echter Bid-Action sichtbar).

#### SEO, Rudderstack, Security
- SEO Phase 1+2: Canonicals, OG, JSON-LD, Robots. Rudderstack: identify + unsaved event. PostgreSQL: `listen_addresses = 'localhost'`.

### 2026-04-03 — SEO, Rudderstack, UX-Fixes, Security, Mobile

#### Rudderstack + Tracking
- `rudderIdentify` auf Login/Register/Mount in `AuthProvider.tsx`. `Item Unsaved` Event in `SaveForLaterButton.tsx`.

#### UX Fixes
- Facebook-Link korrigiert (`vinylondemandrecords`). Discogs-Link aus Footer entfernt. Outbid-Email ohne Preistabelle. Sticky Mobile CTA auf beendeten Lots ausgeblendet.

#### SEO Phase 1+2
- Canonical URLs auf allen dynamischen Seiten. OG-Images für band/label/press. JSON-LD Event-Schema (Auktionen) + MusicGroup-Schema (Bands). sr-only H1 auf Catalog. Noindex `gate/layout.tsx`. Alt-Texte ImageGallery + BlockItemsGrid.

#### Admin Password Reset Fix
- Subscriber `password-reset.ts`: Frühes `return` für `actor_type !== "customer"` entfernt. `else if (actor_type === "user")` Branch ergänzt → Admin-Reset-Mail wird jetzt gesendet.

#### Adressen
- Gallery: Eugenstrasse 57/2. VOD Records (Impressum, AGB, Datenschutz, Widerruf, Invoice): Alpenstrasse 25/1.

#### PostgreSQL Security
- `listen_addresses = 'localhost'` → Port 5432 nur noch lokal erreichbar (kein öffentlicher Zugriff). Hostinger-Warning behoben.

#### Mobile Fixes
- `overflow-x: hidden` auf `html`/`body` in `globals.css` + Admin via `injectNavCSS()` — kein horizontales Schieben mehr.
- `active_bids_count` in `/store/account/status` → "My Bids (N)" im Mobile Nav.

### 2026-04-02 — Bugfixes Fehler 8–13 (Format, CRM, Bid Email, Countdown, Translate)

#### Format Badge Fix (Fehler 10)
- Backend: `Format.name as format_name` via LEFT JOIN in `/store/auction-blocks/[slug]/items/[itemId]`. Storefront: `formatLabel()` + `formatColorKey()` Helper — "Vinyl-7"" statt "LP".

#### CRM Staleness Fix (Fehler 9)
- KPI-Karten im Drawer nutzen live `data`-Counts. Auto-Recalc `POST /admin/customers/recalc-stats` im Hintergrund beim Seitenaufruf.

#### Bid Confirmation Email (Fehler 11)
- `backend/src/emails/bid-placed.ts` (NEU) — "You are the highest bidder" Mail nach Gebot. Cover-Bild + Lot-Details. Admin Email Preview (`/app/emails`) inkl. Cover-Bilder für alle Item-Mails.

#### Lot Page Winning Indicator (Fehler 11 Teil 2)
- `ItemBidSection.tsx`: `GET /store/account/bids` auf Mount identifiziert eigene Bids. Banner "You are the highest bidder" (grün) / "You have been outbid" (orange).

#### Saved Items Bid Status (Fehler 12)
- `/account/saved`: "Highest bid · €X.XX" / "Outbid · €X.XX" Badge via `GET /store/account/bids`.

#### Countdown Seconds (Fehler 13)
- Sekunden erst wenn < 60 Minuten. 4 Dateien: `ItemBidSection.tsx`, `auctions/[slug]/page.tsx`, `BlockItemsGrid.tsx`, `PreviewCountdown.tsx`.

#### Address + Translate
- Gallery: Eugenstrasse 57/2. VOD Records: Alpenstrasse 25/1.
- `translate="no"` + `<meta name="google" content="notranslate">` im Root Layout.

### 2026-04-01 — Bugfixes Fehler 1–7 (Live Bidding, Tracklist, Saved Items, CRM Stats)

#### Live Bidding Fixes (Fehler 1–6) — `ItemBidSection.tsx`
- **Fehler 1 — `isActive` nie true:** `itemStatus === "active"` passte nicht — DB speichert `"open"` für aktive Lots. Fix: `liveItemStatus === "active" || liveItemStatus === "open"`. Reaktiver State (`liveBlockStatus`, `liveItemStatus`) statt direkter Props.
- **Fehler 2 — Stale ISR-Props:** Mount-fetch überschreibt Next.js ISR-gecachte Props mit Live-Daten von `/store/auction-blocks/:slug/items/:itemId`. Aktualisiert `currentPrice`, `bidCount`, `lotEndTime`, `liveBlockStatus`, `liveItemStatus`.
- **Fehler 3 — Garbled Description / HTML-Tags sichtbar:** `release.description` enthält rohes Discogs-HTML. Inline-Strip in `auctions/[slug]/[itemId]/page.tsx` (`<br>` → `\n`, Tags entfernen, HTML-Entities dekodieren). Guard: Description-Sektion nur wenn kein Tracklist + keine Credits.
- **Fehler 4 — Bid Silence bei "Already Highest Bidder":** Backend gibt 400 mit Meldung zurück. `toast.error(msg, { duration: 8000 })` + Beschreibung "Use 'Set maximum bid'..." wenn already-winning erkannt.
- **Fehler 5 — Toast zu kurz:** Alle Success/Warning-Toasts auf `{ duration: 6000 }`, Errors auf `{ duration: 8000 }`.
- **Fehler 6 — Saved Items Link:** `/account/saved` verlinkte auf `/catalog/:id` statt auf aktiven Auktions-Lot. Fix: `GET /store/account/saved` joinent jetzt `block_item` + `auction_block` und gibt `block_item_id` + `block_slug` zurück. Link-Logik: auction-Lot wenn vorhanden, sonst catalog-Fallback.

#### Tracklist Parser Fixes — `storefront/src/lib/utils.ts`
- **`POSITION_RE`** — War `/^[A-Z]?\d{1,2}\.?$/` → matched nicht "A", "B" (ohne Ziffern). Neu: `/^([A-Z]{1,2}\d{0,2}|\d{1,2})\.?$/` — unterstützt Vinyl-Seiten A/B, AA/BB, A1/B2, I/II, 1/12.
- **Minimum-Threshold** — `extractTracklistFromText` gab bei < 3 Tracks zurück. Gesenkt auf < 2, damit 7"-Singles (2 Tracks) erkannt werden.
- **`parseUnstructuredTracklist`** — `alreadyStructured`-Bail-out entfernt. War fälschlicherweise aktiv bei JSONB-Einträgen wie `{position:"I", title:"Confess"}` → kein Parsing.
- **Resultat:** 7"-Single "I Confess / Softness" zeigt jetzt korrekt: `A / I Confess / 3:11` und `B / Softness / 2:08`.

#### Collapsible Block Description — `CollapsibleDescription.tsx` (NEU)
- Auction-Block-Seite: `long_description` war immer vollständig ausgeklappt → viel Scroll bis zu den Lots.
- Neuer Client-Component `CollapsibleDescription` in `storefront/src/components/`. Zeigt max. 3 Zeilen (CSS `-webkit-line-clamp`), "Show more / Show less" Toggle mit Chevron. Nur bei Texten > 300 Zeichen oder mehreren Absätzen.

#### CRM Stats Recalculation (Fehler 7) — `customer_stats`
- **Problem:** `customer_stats`-Tabelle wird nur stündlich via Cron aktualisiert. Kunden mit neuen Bids zeigten 0 in der Tabelle weil Cron noch nicht lief.
- **`POST /admin/customers/recalc-stats`** (NEU) — Führt vollständigen UPSERT aller Customer-Stats aus live `bid`- + `transaction`-Daten aus. Kein Cron-Wait nötig.
- **"↻ Recalc Stats" Button** im CRM-Listenheader — ruft Endpoint auf, refreshed Tabelle automatisch.

### 2026-03-31 — E2E Tests + Storefront OOM-Fix
- Playwright Test Suite: **66 passed, 3 skipped, 0 failed**. `tests/helpers/auction-setup.ts` (NEU) — Helper erstellt/teardown Live-Auktionsblock für Tests.
- Storefront PM2-Restart-Loop behoben: `max_memory_restart` 300MB → 600MB, `--max-old-space-size=512`. `ecosystem.config.js` neu.

→ Ältere Einträge: `docs/architecture/CHANGELOG.md`

---

**Author:** Robin Seckler (rseckler@gmail.com)
