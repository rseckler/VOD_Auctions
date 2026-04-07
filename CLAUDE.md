# VOD_Auctions — CLAUDE.md

**Purpose:** Auktionsplattform für ~41.500 Produkte (Industrial Music Tonträger + Literatur/Merchandise)
**Goal:** Eigene Plattform statt 8-13% eBay/Discogs-Gebühren
**Status:** Beta Test (platform_mode: beta_test) — Pre-Launch Phase als nächster Schritt
**Language:** Storefront + Admin-UI: Englisch
**Last Updated:** 2026-04-04

**GitHub:** https://github.com/rseckler/VOD_Auctions
**Publishable API Key:** `pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d`

## Tech Stack

| Component | Technology |
|-----------|------------|
| Commerce | Medusa.js 2.x (Port 9000) |
| Frontend | Next.js 16.2, React 19, TypeScript 5 |
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
# Backend + Admin deployen — KOMPLETTE Sequenz, alle Schritte PFLICHT
ssh root@72.62.148.205
cd /root/VOD_Auctions && git pull && cd backend
rm -rf node_modules/.vite .medusa    # clean build (bei neuen Admin-Routes PFLICHT)
npx medusa build
rm -rf public/admin && cp -r .medusa/server/public/admin public/admin   # Admin-Assets PFLICHT
ln -sf /root/VOD_Auctions/backend/.env /root/VOD_Auctions/backend/.medusa/server/.env   # .env PFLICHT
pm2 restart vodauction-backend

# Storefront deployen
cd /root/VOD_Auctions/storefront
npm run build && pm2 restart vodauction-storefront
```

**Warum jede Zeile in der Deploy-Sequenz Pflicht ist:**
- `rm -rf node_modules/.vite .medusa` → neue Admin-Routes werden sonst nicht vom Vite-Plugin registriert (404 / silent crash)
- `cp .medusa/server/public/admin public/admin` → sonst 502 Bad Gateway auf admin.vod-auctions.com
- `ln -sf .env .medusa/server/.env` → PM2 cwd ist `.medusa/server/`, dotenv sucht `.env` im cwd. Jeder `medusa build` löscht `.medusa/` inkl. Symlink neu. Ohne Symlink bootet Medusa mit `JWT_SECRET must be set in production`. **PM2-cwd MUSS `.medusa/server/` sein** (nicht `backend/`) — sonst `Cannot find module '/root/VOD_Auctions/backend/medusa-config'`, weil dort nur die `.ts`-Source liegt und der Prod-Runtime keine TypeScript-Transpilation macht. Siehe `backend/ecosystem.config.js`.

**Git Workflow:** NIE `git pull` auf VPS machen wenn VPS-Code nicht vorher auf GitHub gepusht wurde. Deploy-Reihenfolge IMMER: `git push origin main` auf Mac → dann `git pull` auf VPS. Sonst sagt VPS "Already up to date" obwohl neue Commits fehlen.

## Key Gotchas

- **Knex DECIMAL als String:** `.toFixed()` direkt auf Knex-Ergebnis crasht → immer `Number(value).toFixed()`
- **Knex Subquery:** `.where("col", pgConnection.raw('(SELECT ...)'))` funktioniert nicht → Wert erst abfragen, dann direkt einsetzen
- **Medusa ULID IDs:** Bei Knex-Insert immer `id: generateEntityId()` aus `@medusajs/framework/utils` mitgeben — sonst `NOT NULL violation`
- **Stripe Webhook Raw Body:** `rawBodyMiddleware` in `middlewares.ts` NICHT entfernen — ohne es scheitern ALLE Webhooks mit "No webhook payload"
- **Admin Routes:** `defineRouteConfig()` NUR auf Top-Level `page.tsx`, NICHT auf `[id]/page.tsx` (Routing-Konflikte)
- **Admin Route Pfade:** Niemals native Medusa-Pfade verwenden (`customers`, `orders`, `products`, `settings`, `feature-flags` etc.) → native Route gewinnt immer. Stattdessen eigene Pfade: `crm`, `auction-blocks`, `catalog`, `platform-flags` etc. Verifizieren via `find backend/node_modules/@medusajs/medusa/dist/api/admin -maxdepth 2 -type d` bevor neue Route-Verzeichnisse angelegt werden.
- **Vite Cache bei neuen Admin-Routen:** Neues `src/admin/routes/X/`-Verzeichnis → VPS Vite-Cache MUSS gecleart werden: `rm -rf node_modules/.vite .medusa && npx medusa build`. Sonst findet der Vite-Plugin die neue Route nicht → 404 oder korrupter Bundle → silent crash.
- **CamelCase vs snake_case:** Legacy-Tabellen (`Release`, `Artist`) → camelCase; Auction-Tabellen → snake_case
- **SSL Supabase:** `rejectUnauthorized: false` in `medusa-config.ts` nötig
- **Supabase Admin-Ops nur via Session Pooler:** Direct-Connection `db.<ref>.supabase.co:5432` ist auf Free unzuverlässig (IPv4 disabled, IPv6 slot-limited). Immer Session Pooler nutzen: `aws-0-<REGION>.pooler.supabase.com:5432`, User = `postgres.<project-ref>`, Region muss zum Projekt passen (Prod = eu-central-1, Staging = eu-west-1). Transaction Pooler (Port 6543) unterstützt kein `pg_dump`. Volle Post-Mortem siehe CHANGELOG 2026-04-05.
- **`pg_dump` Version Mismatch + Docker IPv6:** VPS hat `pg_dump 16`, Supabase läuft auf PG17 → Dump refused. Workaround: `docker run --rm --network=host postgres:17 pg_dump ...`. `--network=host` ist Pflicht, sonst hat Container kein IPv6 und erreicht Supabase-Direct-Hosts nicht.
- **Supabase DB-Passwörter alphanumerisch halten:** Sonderzeichen (`*`/`#`/`$`/`&`) machen beim Shell-Paste und URL-Parsing Ärger. Immer Supabase's "Generate password" nutzen oder manuell nur `[a-zA-Z0-9]`.
- **Medusa/Vite Build:** IIFE `(() => {...})()` in JSX-Ternary → silent build failure → Blank Page. Separate Komponenten verwenden.
- **Neue Native-Dependencies:** Wenn `package.json` eine neue Native-Dep bekommt (pdfkit, sharp, bcrypt etc.), nach Deploy `npm install` auf VPS ausführen — sonst `Cannot find module` → PM2 restart-loop. **Niemals `npm install --omit=optional`** — das strippt platform-specific Binaries wie `@swc/core-linux-x64-gnu` und kaputtmacht `medusa build`.
- **Discogs Prices ausgeblendet:** `{/* HIDDEN: ... */}` Marker in 5 Storefront-Dateien. Wiederherstellen wenn echte Sale-Daten verfügbar.
- **LEFT JOIN in Transaction APIs:** Direktkäufe haben kein `block_item_id` → immer LEFT JOIN, nie INNER JOIN
- **COALESCE:** `COALESCE(block_item.release_id, transaction.release_id)` in Transaction-Queries
- **Bid-Input `type="text"`:** Bid-Inputs nutzen `type="text" inputMode="decimal"` (nicht `type="number"`). Parsing IMMER über `parseAmount()` (normalisiert `,` → `.`). Nie `parseFloat()` direkt auf User-Input — EU-Nutzer tippen Komma-Dezimale.
- **`whole_euros_only: true`:** BID_CONFIG erzwingt ganzzahlige Gebote. Betrifft Validation, Increments, Display. Proxy-Max ebenfalls ganzzahlig validiert.
- **UI/UX Governance:** Verbindliche Docs in `docs/UI_UX/` — Style Guide (Source of Truth), Gap Analysis, Optimization Plan, Implementation Report, PR Checklist. Jede UI-Änderung muss Shared Components (`Button`, `Input`, `Label`, `Card`) nutzen. Siehe `docs/UI_UX/CLAUDE.md` für Workflow.

## Database Schema

### Legacy Tabellen (camelCase, Knex-Only)
- `Release` — ~41.500 Produkte (product_category: release/band_literature/label_literature/press_literature). Visibility: `coverImage IS NOT NULL`. Kaufbar: `legacy_price > 0 AND legacy_available = true`.
- `sync_change_log` — Change-Log des Legacy-Sync (sync_run_id, release_id, change_type: inserted/updated, changes JSONB mit old/new je Feld). Befüllt stündlich durch `legacy_sync_v2.py`, trackt alle 14 gesyncten Felder (v2 seit 2026-04-05; v1 trackte nur 4). Admin: `/app/sync` → Tab "Change Log".
- `sync_log` — Run-Summary pro Sync-Lauf. v2-Erweiterung (2026-04-05): zusätzliche Spalten `run_id, script_version, phase, started_at, ended_at, duration_ms, rows_source, rows_written, rows_changed, rows_inserted, images_inserted, validation_status, validation_errors`. Alte Spalten (`sync_type, sync_date, status, changes, error_message`) bleiben für Backward-Compat.
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
- `POST /admin/ai-create-auction` — AI Auction Creator (SSE, Claude Sonnet, 3 write Tools: search_catalog, create_auction_draft, add_items_to_block)
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
- `GET /admin/sync/change-log` — Legacy Sync Change Log (?run_id, ?field, limit, offset) — Runs-Übersicht + paginierte Einträge mit old/new Werten
- `GET /admin/customers/list` — Paginated Customer-Liste mit Stats (?q, sort, limit, offset)
- `GET|PATCH /admin/customers/:id` — Customer-Detail + Edit (name/email/phone/tags/is_vip)
- `POST /admin/customers/recalc-stats` — Force-Recalc aller customer_stats aus live Daten
- `GET /admin/customers/export` — CSV aller Kunden (BOM, 13 Spalten)
- `GET|POST /admin/customers/:id/notes` + `DELETE .../notes/:noteId` — Interne Notizen
- `GET /admin/customers/:id/timeline` — Unified Event-Feed (bid/order/note)
- `POST /admin/customers/:id/block` + `/unblock` | `/anonymize` | `/gdpr-export` | `/delete`
- `GET /admin/erp/locations` — Warehouse Locations Liste
- `POST /admin/erp/locations` — Neuen Lagerort anlegen (code, name required)
- `PATCH /admin/erp/locations/:id` — Lagerort bearbeiten (inkl. is_default setzen)
- `DELETE /admin/erp/locations/:id` — Soft-deactivate (kein Hard-Delete; Default-Location geblockt)

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

**Sender (Technical, Reply-To: support@vod-auctions.com bei allen customer-relevant Mails):**
- **Resend** (`noreply@vod-auctions.com`, Account-Owner: frank@vod-records.com) — Transaktionale Mails (welcome, bid-placed, bid-won, outbid, payment, shipping, feedback-request, payment-reminder, waitlist, invite, password-reset etc.). Zukunfts-Target: `notifications@vod-auctions.com` (deferred).
- **Brevo** (`newsletter@vod-auctions.com`) — 4 Newsletter-Templates (block-teaser/tomorrow/live/ending), CRM (3.580 tape-mag Kontakte, List ID 5). Reply-To auf support@.

**Public Mailboxes (all-inkl):**
- **`support@vod-auctions.com`** (Postfach) — Zentrale Kunden-Anlaufstelle. Footer-Kontakt, Reply-To aller Resend/Brevo-Sends.
- **`privacy@vod-auctions.com`** (Postfach) — DSGVO / Account-Löschung (Account-Settings-Seite).

**Aliase → support@:** `info@`, `billing@`, `orders@`, `abuse@`, `postmaster@` (RFC 2142 + Impressum).
**Aliase → Frank:** `frank@vod-auctions.com`, `press@vod-auctions.com`.

**ENV:** `SUPPORT_EMAIL`, `PRIVACY_EMAIL`, `EMAIL_FROM` in `backend/.env`. Single Source of Truth: `backend/src/lib/email.ts` exportiert `SUPPORT_EMAIL` + `PRIVACY_EMAIL`, Brevo wrapper importiert von dort.

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
# Legacy MySQL → Supabase (stündlich)
0 * * * * cd ~/VOD_Auctions/scripts && venv/bin/python3 legacy_sync_v2.py >> legacy_sync.log 2>&1
# Discogs Daily (Mo-Fr 02:00 UTC, 5 Chunks rotating)
0 2 * * 1-5 cd ~/VOD_Auctions/scripts && venv/bin/python3 discogs_daily_sync.py >> discogs_daily.log 2>&1
```

**Python venv:** `scripts/venv/` — psycopg2-binary, python-dotenv, requests, mysql-connector-python, openai, musicbrainzngs

## Data Sync Scripts

```bash
cd VOD_Auctions/scripts && source venv/bin/activate

python3 legacy_sync_v2.py        # Incremental sync (hourly via cron; v1 legacy_sync.py bleibt als Rollback-Backup)
python3 legacy_sync_v2.py --dry-run                   # Simulate, no writes
python3 legacy_sync_v2.py --pg-url "$STAGING_URL"     # Target staging Supabase
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
│   ├── api/admin/                 # auction-blocks/, media/, transactions/, entity-content/, gallery/, sync/, site-config/, dashboard/, waitlist/, invite-tokens/
│   ├── api/store/                 # auction-blocks/, catalog/, band/, label/, press/, gallery/, account/, waitlist/, invite/, site-mode/
│   ├── api/webhooks/              # stripe/, paypal/, brevo/
│   ├── api/middlewares.ts         # Auth + rawBodyMiddleware (DON'T REMOVE rawBody!)
│   ├── lib/                       # stripe.ts, paypal.ts, checkout-helpers.ts, shipping.ts, brevo.ts, crm-sync.ts, site-config.ts, invite.ts, feature-flags.ts, paths.ts
│   ├── scripts/migrations/         # Raw SQL migrations für non-ORM Tabellen (site_config, sync_log etc.), idempotent, manuell angewendet
│   ├── admin/components/          # admin-nav.tsx, admin-tokens.ts, admin-layout.tsx, admin-ui.tsx (Shared Component Library)
│   └── admin/routes/              # auction-blocks/, media/, transactions/, entity-content/, gallery/, sync/, config/, waitlist/, dashboard/
├── storefront/src/
│   ├── app/                       # catalog/, auctions/, band/, label/, press/, gallery/, about/, account/, apply/, invite/
│   ├── components/                # AuthProvider, Header, Footer, ItemBidSection, BlockItemsGrid, ImageGallery, CollapsibleDescription
│   └── middleware.ts              # Platform mode gate — reads from backend API, supports password + invite cookies
├── scripts/
│   ├── legacy_sync_v2.py          # Hourly MySQL→Supabase sync, active cron target (bilder_typ: release=10, band=13, label=14, press=12). Full 14-field diff, RETURNING-verified image counts, post-run validation, --dry-run / --pg-url flags.
│   ├── legacy_sync.py             # v1 backup, replaced by v2 on 2026-04-05, will be removed after 7 days stable v2 operation
│   ├── discogs_daily_sync.py      # Daily Discogs (5 chunks, exponential backoff)
│   └── entity_overhaul/           # 10-Module Pipeline (orchestrator, enricher, writer, quality_agent, ...)
├── nginx/                         # vodauction-api.conf, vodauction-store.conf, vodauction-admin.conf
└── docs/
    ├── architecture/CHANGELOG.md        # Vollständiger Changelog
    ├── architecture/DEPLOYMENT_METHODOLOGY.md  # Deploy early, activate when ready — verbindlich
    ├── architecture/SYNC_ROBUSTNESS_PLAN.md    # Sync-Architektur v2.3 mit Field-Contract und Phase-Plan
    ├── architecture/STAGING_ENVIRONMENT.md     # Staging DB Setup + Runbook (aebcwjjcextzvflrjgei, eu-west-1)
    ├── UI_UX/                     # UI/UX Governance (Style Guide, Gap Analysis, Plan, Report, PR Checklist)
    ├── DESIGN_GUIDE_BACKEND.md    # Admin Design System v2.0 (verbindlich)
    ├── PRE_LAUNCH_KONZEPT.md      # Waitlist + Invite Flow
    ├── ADMIN_CONFIG_KONZEPT.md    # Config Panel + Platform Modes
    ├── DASHBOARD_KONZEPT.md       # Phase-adaptive Dashboard
    └── mockups/                   # HTML Mockups (pre-launch-flow, admin-config, design-guide)
```

**bilder_typ Mapping (WICHTIG — Regression-Schutz):**
- typ=10: releases | typ=13: band_literature | typ=14: labels_literature | typ=12: pressorga_literature

## Core Concepts

**Themen-Block-Modell:** Alle Auktionen in kuratierten Blöcken (1-500 Items). Redaktioneller Content pro Block. Produkt-Reservierung: available → reserved → in_auction → sold/unsold.

**Block-Typen:** Themen-Block (Genre/Künstler/Epoche) | Highlight-Block (High-Value, lang) | Clearance-Block (200-500 Items, 1€) | Flash-Block (24h, 1-10 Items)

**Platform Modes:** `beta_test` (aktuell) → `pre_launch` → `preview` → `live` → `maintenance`. Gesteuert über `/admin/config` (Access/Launch Tab). Middleware liest `platform_mode` aus Backend API (5-min Cache). `beta_test` = nur Passwort-Gate. `pre_launch` = Invite-System aktiv. `live` = Gate entfernt.

**Pre-Launch System:** `/apply` (Bewerbungsformular) → Admin approves → Invite-Token `VOD-XXXXX-XXXXX` → `/invite/[token]` (Account-Erstellung). Tabellen: `waitlist_applications`, `invite_tokens`, `invite_token_attempts`.

**Admin Design System:** Shared Component Library in `admin/components/` — `admin-tokens.ts` (Farben, Typo), `admin-layout.tsx` (PageHeader, Tabs, StatsGrid), `admin-ui.tsx` (Badge, Toggle, Toast, Modal). Verbindlicher Design Guide: `docs/DESIGN_GUIDE_BACKEND.md` v2.0.

**Admin Navigation:** 8 Sidebar-Items (Dashboard, Auction Blocks, Orders, Catalog, Marketing, Operations, ERP, AI Assistant). Sub-Pages nur über Hub-Karten erreichbar. Kein `defineRouteConfig` auf Sub-Pages.

**Deployment Methodology:** "Deploy early, activate when ready" ist verbindlich für alle nicht-trivialen Features. Feature Flags in `backend/src/lib/feature-flags.ts` (Registry, inkl. `requires`-Dependency-Chain) und `site_config.features` JSONB (State). Admin Toggle unter `/app/config` → Feature Flags (Toggles deaktiviert wenn Deps fehlen). Additive-only Migrationen auf Live-Tabellen, keine `DROP`/`RENAME`/`TYPE`-Änderungen. Prefix `/admin/erp/*` wird aktiv genutzt (Locations live). Siehe [`docs/architecture/DEPLOYMENT_METHODOLOGY.md`](docs/architecture/DEPLOYMENT_METHODOLOGY.md).

**Sync-Architektur:** Legacy-MySQL→Supabase-Sync läuft stündlich via `legacy_sync_v2.py`, schreibt alle 14 gesyncten Felder in `sync_change_log` und strukturierte Run-Summary nach `sync_log` (mit `run_id`, `phase`, `rows_*`, `validation_status`). Feld-Contract und Ownership-Matrix in `SYNC_ROBUSTNESS_PLAN.md` §6. Post-Run-Validation läuft nach jedem Run (V1 Row-Count, V2 NOT-NULL, V3 Referential, V4 Freshness). Staging-DB für Dry-Runs: `aebcwjjcextzvflrjgei` (eu-west-1, backfire account — 1Password: "Supabase 2. Account"). Phase A5/A6 (Dead-Man's-Switch + E-Mail-Alerting) pending.

**Cwd-independente Pfade:** Backend-Code nutzt NIE `process.cwd()` oder relative `__dirname`-Pfade zur Auflösung von Projekt-Files. Immer `getProjectRoot()`, `getScriptsDir()`, `getDataDir()`, `getStorefrontPublicDir()`, `getTestsDir()` aus `backend/src/lib/paths.ts`. Python-Scripts nutzen `Path(__file__).parent.parent` o.ä. Grund: PM2 cwd ist `backend/.medusa/server/`, nicht das Source-Tree (siehe Gotcha-Liste oben). Walk-up-Helper macht's cwd-unabhängig.

**Catalog Visibility:** Artikel mit `coverImage IS NOT NULL` = sichtbar. `legacy_price > 0 AND legacy_available = true` = kaufbar (`is_purchasable`).
**legacy_available:** Spiegelt MySQL `frei`-Feld — `frei=1` → true (verfügbar), `frei=0` → false (gesperrt), `frei>1` (Unix-Timestamp) → false (auf tape-mag verkauft). Wird täglich per Legacy-Sync aktualisiert.

## Linear

**Project:** https://linear.app/rseckler/project/vod-auctions-37f35d4e90be
**Nächster Schritt:** RSE-78 (Launch, offen: AGB-Anwalt)
**In Progress:** RSE-227 (Entity Content Overhaul, P2 paused bis 01.04.2026)
**Backlog:** RSE-78 (Launch, offen: AGB-Anwalt) | RSE-79 (Erste öffentliche Auktionen) | RSE-80 (Marketing)

## Recent Changes

→ Vollständiger Changelog: [`docs/architecture/CHANGELOG.md`](docs/architecture/CHANGELOG.md)

---

**Author:** Robin Seckler (rseckler@gmail.com)
