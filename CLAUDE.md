# VOD_Auctions — CLAUDE.md

**Purpose:** Auktionsplattform für ~41.500 Produkte (Industrial Music Tonträger + Literatur/Merchandise)
**Goal:** Eigene Plattform statt 8-13% eBay/Discogs-Gebühren
**Status:** Phase 1 fertig — RSE-77 (Testlauf) als nächster Schritt
**Language:** Storefront + Admin-UI: Englisch
**Last Updated:** 2026-03-30

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

**Git Workflow:** NIE `git pull` auf VPS machen wenn VPS-Code nicht vorher auf GitHub gepusht wurde.

## Key Gotchas

- **Knex DECIMAL als String:** `.toFixed()` direkt auf Knex-Ergebnis crasht → immer `Number(value).toFixed()`
- **Knex Subquery:** `.where("col", pgConnection.raw('(SELECT ...)'))` funktioniert nicht → Wert erst abfragen, dann direkt einsetzen
- **Medusa ULID IDs:** Bei Knex-Insert immer `id: generateEntityId()` aus `@medusajs/framework/utils` mitgeben — sonst `NOT NULL violation`
- **Stripe Webhook Raw Body:** `rawBodyMiddleware` in `middlewares.ts` NICHT entfernen — ohne es scheitern ALLE Webhooks mit "No webhook payload"
- **Admin Routes:** `defineRouteConfig()` NUR auf Top-Level `page.tsx`, NICHT auf `[id]/page.tsx` (Routing-Konflikte)
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
- `GET /store/account/status` — cart_count + saved_count

### Admin (credentials required)
- `GET/POST /admin/auction-blocks` — Blocks CRUD
- `DELETE /admin/auction-blocks/:id` — Löschen (nur draft/ended/archived, Releases → available)
- `GET /admin/auction-blocks/:id/live-bids` — Live Bid Monitor (volle Namen)
- `GET /admin/auction-blocks/:id/bids-log` — Chronologischer Bid-Log (?limit=300)
- `GET /admin/transactions` — Orders (?q, status, fulfillment_status, payment_provider, shipping_country, date_from, date_to, sort, limit, offset)
- `POST /admin/transactions/:id` — Ship/Refund/Note/Cancel
- `POST /admin/transactions/bulk-ship` — Bulk Mark-as-Shipped
- `POST /admin/transactions/export` — CSV Export (BOM, Excel-kompatibel)
- `GET /admin/media` — 41k Releases (q, category, format, country, label, has_discogs, sort field:dir)
- `GET /admin/entity-content/overhaul-status` — Entity Overhaul Status + Budget
- `GET /admin/sync/discogs-health` | `POST` — Discogs Sync Health + Actions

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
SUPABASE_SERVICE_ROLE_KEY  # Für Anti-Sniping Realtime Broadcast (fehlt noch auf VPS!)
REVALIDATE_SECRET, STOREFRONT_URL=https://vod-auctions.com

# Storefront .env.local
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_PAYPAL_CLIENT_ID
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_BREVO_CLIENT_KEY
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-M9BJGC5D69
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
│   ├── components/                # AuthProvider, Header, Footer, ItemBidSection, BlockItemsGrid, ImageGallery
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

### 2026-03-30 — Zahlungs- und Sicherheitssanierung (7 Fixes)
- **PayPal Betragsprüfung serverseitig** — `capture-paypal-order` ruft jetzt immer `GET /v2/checkout/orders/{id}` bei PayPal ab, prüft `status=COMPLETED` und vergleicht echten Capture-Betrag gegen DB-Erwartung. Client-seitige `captured_amount`-Angabe nicht mehr genutzt. `getPayPalOrder()` in `paypal.ts` ergänzt.
- **PayPal-Orders erhalten jetzt Bestellnummern** — `capture-paypal-order` generiert `order_number` + `order_event` direkt (zuvor fiel beides durch: Webhook skippte wegen `alreadyPaid`-Check). Bonus-Fix.
- **Stripe Webhook idempotent** — `checkout.session.completed` hat jetzt denselben `alreadyPaid`-Guard wie `payment_intent.succeeded`. Doppelte Webhook-Zustellung löst keine zweite Mail, keinen zweiten Promo-Zähler und keine neue Bestellnummer mehr aus.
- **Promo-Code-Rabatt bei Shipping-Update erhalten** — `update-payment-intent` liest `discount_amount` aus bestehenden Transaktionen und rechnet ihn in `total_amount` (per Transaktion) und den Stripe-PaymentIntent-Betrag ein. Vorher: Rabatt nach Adressänderung verloren.
- **`user_id` aus öffentlicher Bid-History entfernt** — GET `/store/auction-blocks/*/items/*/bids` gab interne Customer-IDs zurück. Jetzt nur noch `user_hint` (SHA-256-Hash).
- **Production-Startup-Check JWT/Cookie** — `medusa-config.ts`: `NODE_ENV=production` ohne `JWT_SECRET`/`COOKIE_SECRET` wirft Exception statt `"supersecret"` zu nutzen.
- **`deploy.sh` Credentials ersetzt** — Echte Passwörter (`DATABASE_URL`, `SUPABASE_DB_URL`, `LEGACY_DB_PASSWORD`) durch Platzhalter ersetzt. **Hinweis: Git-History enthält die alten Werte noch — Rotation empfohlen.**

### 2026-03-29 — Admin Backoffice: System Health + Email Preview/Edit
- **System Health Dashboard** `/admin/system-health` — Live-Status für 9 Services: PostgreSQL, Stripe, PayPal, Resend, Brevo, Storefront, Sentry, ContentSquare, GA4. Latenz-Anzeige, Auto-Refresh 30s, Quick Links.
- **Email Template Preview + Edit** — Klick auf Template öffnet Side-Drawer: iframe-Preview (echtes HTML), Edit-Tab (Subject/Preheader-Override → gespeichert in `content_block`), Send Test Tab. `GET/PUT /admin/email-templates/:id` neu.
- **Admin VPS Deploy Gotcha** — `cp -r` auf existierenden Ordner merged → immer erst `rm -rf public/admin` dann kopieren.
- **Pre-Launch Quality Sprint (28 Issues)** — Testing, Email, CRM/Tracking, Code Quality vollständig abgeschlossen. Alle Linear Issues RSE-238–RSE-264 auf Done.

### 2026-03-28 — Hotfix: Backend-Crash
- **pdfkit fehlte auf VPS** → `Cannot find module 'pdfkit'` → PM2 restart-loop. Fix: `npm install pdfkit` auf VPS + in `package.json` committed.

### 2026-03-28 — Auction Workflow Vollimplementierung (P1+P2+P3+K-Series)
- **Tiered Bid Increments:** €0.50→€25 Stufentabelle (Backend + Storefront "Min. bid" Anzeige)
- **Anti-Sniping:** max_extensions (10), extension_count, Admin-UI; Realtime Broadcast via Supabase (**SUPABASE_SERVICE_ROLE_KEY noch auf VPS eintragen!**)
- **Payment Deadline:** 5-Tage-Frist, Tag 1+3 Reminder-Mails, Tag 5 Auto-Relist + Admin-Alert (Cron)
- **Condition Grading:** Discogs-Standard (M/NM/VG+/VG/G+/G/F/P) Admin + ConditionBadge Storefront
- **Public Bid History:** BidHistoryTable (Bidder #N, 30s Poll, Framer Motion) auf Lot-Detail-Seite
- **Watchlist Reminder:** Stündlicher Cron, 24h vor Lot-Ende → Email an Saver
- **Reserve Price:** reserve_price auf block_item, Lifecycle-Check, Storefront-Anzeige (ohne Betrag)
- **Admin Live Monitor:** `/admin/live-monitor` — 10s Auto-Refresh, Rot/Grün Lot-Cards
- **Invoice PDF:** `GET /store/account/orders/:groupId/invoice` — pdfkit-generierte Rechnung
- **Schema.org MusicAlbum:** JSON-LD auf Catalog-Detail-Seiten
- **Post-Block Analytics:** `/admin/auction-blocks/:id/analytics` + Analytics-Tab (Conversion, Revenue, Top-Lots)
- **Newsletter Sequenz:** T-7/T-24h/T+0/T-6h Block-Emails via Brevo Kampagnen-API (List ID 4)
- **Going/Going/Gone:** <5 Min rotes Pulsing-Banner + roter Countdown; <1h Amber
- **"No Buyer's Premium" USP:** Badge auf Lot-Seite, Checkout, Footer
- **Live Auction Banner:** `LiveAuctionBanner` Server-Component auf Homepage/Catalog/Auctions (ISR 60s)
- **1-Click Rebid:** Outbid-Email mit vorgeschlagenem Betrag + `?bid=X` URL param pre-füllt Bid-Input
- **Staggered Ending UI:** Admin Checkbox + Interval-Input + Preview-Text + Header-Badge
- **View Counter:** view_count auf block_item, Fire-and-Forget Increment, Social Proof auf Lot-Seite
- **Preview Block Storefront:** Amber-Banner + Countdown für scheduled/preview Blocks, Save-Buttons statt Bid
- **Bulk Price Editor:** Admin Panel (% vom Schätzwert / Fixed / Manuell), API `/items/bulk-price`
- **Social Sharing:** ShareButton (Web Share API + Twitter/Facebook/WhatsApp/Copy) auf Block + Lot-Seiten
- **Admin Bids Log:** `GET /admin/auction-blocks/:id/bids-log` — chronologisch, volle Bieter-Namen
- **Auction Block löschen:** Delete-Button für draft/ended/archived. `DELETE /admin/auction-blocks/:id` (409 bei active/scheduled/preview)
- **Bid Badges:** Highest Bid = grünes Badge + `animate-pulse`. Countdown überall H:M:S-Format.
- **Medusa Nav Cleanup:** Ungenutzte Nav-Items per CSS-Injection ausgeblendet
- **Migrations:** 20260328-20260330 (auto_extend, payment_reminders, watchlist_reminded_at, reserve_price, newsletter_*_sent_at, view_count)

### 2026-03-23
- Entity Content P2 pausiert (576/3.650, Budget $96/$120). Admin Budget-Dashboard auf `/admin/entity-content` mit Budget-Zeitplan + Progress-Bars.

→ Vollständiger Changelog: `docs/architecture/CHANGELOG.md`

---

**Author:** Robin Seckler (rseckler@gmail.com)
