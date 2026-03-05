# VOD_Auctions - CLAUDE.md

This file provides guidance to Claude Code when working with the VOD Auctions project.

## Project Overview

**Purpose:** Auktionsplattform für ~30.000 Tonträger (Industrial Music, Nischen-Genres)

**Goal:** Eigene Plattform mit voller Kontrolle über Marke, Kundendaten, Preisgestaltung — statt 8-13% Gebühren an eBay/Discogs

**Status:** Phase 1 — RSE-72 bis RSE-96 + RSE-76 erledigt. Stripe Payment Integration live (Test-Mode). Nächstes: RSE-77 (Testlauf) oder RSE-100–105 (Checkout Flow, Order Tracking, Emails, Legal)

**Sprache:** Storefront und Admin-UI komplett auf Englisch (seit 2026-03-03)

**Created:** 2026-02-10
**Last Updated:** 2026-03-05

### Letzte Änderungen (2026-03-05)
- **RSE-76: Stripe Payment Integration** — Komplette Zahlungsabwicklung implementiert:
  - Transaction Model (Medusa DML): status, shipping, Stripe IDs, Lieferadresse
  - Stripe Checkout Session API (Hosted Page, Auto Capture)
  - Stripe Webhook Handler (checkout.session.completed/expired)
  - Flat-Rate Versand: DE €4.99 / EU €9.99 / Worldwide €14.99
  - Wins-Page mit Pay-Button, Shipping-Zone-Auswahl, Status-Badges (Paid/Shipped/Delivered)
  - Admin Transaction APIs (List + Shipping-Status Update)
  - Stripe Account: VOD Records Sandbox (acct_1T7WaYEyxqyK4DXF)

### Frühere Änderungen (2026-03-03)
- **RSE-87–96:** English Translation, Article Numbers, Discogs Prices, Credits Fix, Admin Fixes, Backfill, VPS Deploy, Cronjobs

**Clickdummy:** https://vodauction.thehotshit.de (VPS, PM2, Port 3005)

**GitHub:** https://github.com/rseckler/VOD_Auctions
**Linear:** VOD Auctions Projekt (rseckler Workspace)

## Key Decisions

- **Keine eBay/Discogs-Validierung nötig** — jahrelange Erfahrung auf beiden Plattformen, Markt ist bekannt
- **Shopify war nur ein Test** — Daten dort sind nicht die primäre Quelle
- **Commerce-Engine:** Medusa.js (Open Source, MIT-Lizenz, 28k+ GitHub Stars)
- **Eigene Plattform direkt bauen** — kein White-Label, kein SaaS
- **Themen-Block-Modell** — Alle Auktionen in kuratierten Blöcken, nie als Einzellistings

## Documentation

1. **[KONZEPT.md](KONZEPT.md)** — Vollständiges Konzeptdokument
   - Plattform-Optionen Analyse
   - Themen-Block-Modell (Kapitel 3A)
   - Technische Architektur & Datenmodell
   - Datenquelle: tape-mag-mvp Supabase (Kapitel 4.1A)
   - Implementierungsplan (5 Phasen)
   - Finanzplanung & ROI

2. **[README.md](README.md)** — Kurzübersicht

## Technology Stack

| Komponente | Technologie |
|------------|-------------|
| **Commerce-Engine** | Medusa.js 2.x |
| **Frontend** | Next.js 16, React 19, TypeScript 5 |
| **Styling** | Tailwind CSS 4, shadcn/ui, Framer Motion |
| **Design** | "Vinyl Culture" Theme (DM Serif Display + DM Sans, Gold #d4a54a, warm dark #1c1915) |
| **Database** | Supabase PostgreSQL (Shared mit tape-mag-mvp) |
| **Real-time** | Supabase Realtime (Live-Bidding) |
| **Cache** | Upstash Redis (Bid-Cache) |
| **Payments** | Stripe (+ Stripe Connect) |
| **Storage** | Supabase Storage (Bilder, Content) |
| **Hosting** | VPS (PM2, nginx reverse proxy) |
| **State** | Zustand (global) + React Query (server) |
| **Rich-Text Editor** | TipTap (Prosemirror) — Admin Langbeschreibung |

### Supabase-Projekt (Shared)

**Projekt-ID:** `bofblwqieuvmqybzxapx` (eu-central-1, Frankfurt)
**URL:** https://bofblwqieuvmqybzxapx.supabase.co
**Dashboard:** https://supabase.com/dashboard/project/bofblwqieuvmqybzxapx

Shared DB für tape-mag-mvp + VOD_Auctions. Schema enthält 20 Tabellen (14 Basis + 6 Auktions-Erweiterung).

**Migrierte Daten (RSE-72, 2026-03-01):**
- 12.451 Artists, 3.077 Labels, 30.158 Releases, 22.302 Images
- Quelle: Legacy MySQL (213.133.106.99/vodtapes)
- IDs: `legacy-artist-{id}`, `legacy-label-{id}`, `legacy-release-{id}`, `legacy-image-{id}`
- Auktions-Tabellen angelegt (leer): auction_blocks, block_items, bids, transactions, auction_users, related_blocks
- 75 Indexes, RLS auf allen 20 Tabellen aktiv

## Implementation Plan

### Phase 1: Prototyp (Monate 1-2)
- ~~RSE-72: Datenbank vorbereiten~~ ✅
- ~~RSE-73: Admin-Panel~~ ✅
- ~~RSE-74: Public Frontend~~ ✅
- ~~RSE-75: Bidding-Engine~~ ✅
- ~~RSE-84: UX Polish & Auktions-Workflow~~ ✅
- ~~RSE-85: Storefront UX Redesign~~ ✅
- ~~RSE-87–94: Translation, Article Numbers, Discogs Prices, Credits, Bugfixes, Backfill, Deploy~~ ✅
- ~~RSE-95–96: Discogs Backfill Completed, VPS Cronjobs Active~~ ✅
- ~~RSE-76: Payment & Stripe Integration~~ ✅
- **RSE-77: Testlauf: 1 Block mit 10-20 Produkten** ← NÄCHSTER SCHRITT
- **RSE-100: Checkout Flow** (Order Summary + Stripe Payment)
- **RSE-101: Order Progress Tracking** (Paid/Shipped/Delivered UI)
- **RSE-102: Transactional Emails** (6 Templates)
- **RSE-103: Shipping Config** (Admin-konfigurierbar)
- RSE-104: Bid Confirmation Modal
- RSE-105: Legal Pages (Impressum, AGB, Datenschutz)

### Phase 2: Launch (Monate 3-4)
- Erste öffentliche Themen-Auktionen
- Marketing an tape-mag.com Kundenbasis
- Domain: vod-auctions.com

### Phase 3: Skalierung (Monate 5-8)
- 5.000+ Items, Marketing-Offensive

### Phase 4: Evaluierung (Monate 9-12)
- Datenbasierte Entscheidung über Vollausbau

### Phase 5: Premium-Features (Jahr 2)
- AI-Preisempfehlungen, Mobile App, Internationalisierung

## Database Schema

### Bestehend (tape-mag-mvp)
- `Release` — ~30.000 Produkte (Vinyl, CDs, Kassetten)
- `Artist`, `Label`, `Genre`, `Tag`, `Image`, `Track`
- `User`, `Comment`, `Rating`, `Favorite`

### Neu (Auktions-Layer, Medusa ORM — Singular-Tabellennamen)
- `auction_block` — Themen-Auktionsblöcke (status, timing, content, settings, results)
- `block_item` — Zuordnung Release → Block (Startpreis, current_price, bid_count, lot_end_time, Status)
- `bid` — Alle Gebote (amount, max_amount, is_winning, is_outbid)
- `transaction` — Zahlungen & Versand (RSE-76: Stripe, status, shipping_status, Adresse)
- `related_blocks` — Verwandte Blöcke

### Release-Erweiterung
```sql
ALTER TABLE "Release" ADD COLUMN estimated_value DECIMAL(10,2);
ALTER TABLE "Release" ADD COLUMN media_condition TEXT;
ALTER TABLE "Release" ADD COLUMN sleeve_condition TEXT;
ALTER TABLE "Release" ADD COLUMN auction_status TEXT DEFAULT 'available';
ALTER TABLE "Release" ADD COLUMN current_block_id TEXT;
ALTER TABLE "Release" ADD COLUMN article_number TEXT;  -- VOD-XXXXX, unique
ALTER TABLE "Release" ADD COLUMN discogs_median_price DECIMAL(10,2);
ALTER TABLE "Release" ADD COLUMN discogs_highest_price DECIMAL(10,2);
```

**Artikelnummern generieren:**
```bash
# SQL-Script ausführen (einmalig, generiert VOD-00001 bis VOD-XXXXX)
psql $SUPABASE_DB_URL -f scripts/generate_article_numbers.sql
```

## Core Concepts

### Themen-Block-Modell
- Auktionen nur in Blöcken (1-500 Produkte pro Block)
- Jeder Block hat redaktionellen Content (Text, Bilder, Video, Audio)
- Dauer: 1 Tag (Flash) bis 30 Tage (Monatsauktion)
- Produkt-Reservierung: available → reserved → in_auction → sold/unsold
- Startpreis-Workflow: estimated_value → Auto-Startpreis (% konfigurierbar) → Admin-Review

### Block-Typen
- **Themen-Block:** Kuratiert nach Genre/Künstler/Epoche
- **Highlight-Block:** Wenige High-Value Items, längere Laufzeit
- **Clearance-Block:** 200-500 Items, 1€ Startpreise
- **Flash-Block:** 24h, 1-10 Items, überraschend

## Project Structure

```
VOD_Auctions/
├── CLAUDE.md                    # Claude Code Guidance
├── KONZEPT.md                   # Vollständiges Konzeptdokument
├── README.md                    # Kurzübersicht
├── backend/                     # Medusa.js 2.x Backend (Port 9000)
│   ├── medusa-config.ts         # Medusa Config (DB, CORS, Modules)
│   ├── .env                     # Backend Env (DATABASE_URL, JWT, CORS)
│   ├── src/
│   │   ├── modules/auction/     # Custom Auction Module
│   │   │   ├── models/
│   │   │   │   ├── auction-block.ts  # AuctionBlock Entity (DML)
│   │   │   │   ├── block-item.ts     # BlockItem Entity (DML)
│   │   │   │   ├── bid.ts            # Bid Entity (DML, RSE-75)
│   │   │   │   └── transaction.ts    # Transaction Entity (DML, RSE-76)
│   │   │   ├── service.ts       # AuctionModuleService (auto-CRUD, 4 models)
│   │   │   └── index.ts         # Module Registration
│   │   ├── api/
│   │   │   ├── admin/           # Admin API (Auth required)
│   │   │   │   ├── auction-blocks/   # CRUD: list, create, update, delete
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── route.ts  # GET/POST with status-transition validation (RSE-75b)
│   │   │   │   │       └── items/    # Block Items: add, update price, remove
│   │   │   │   ├── releases/    # Search 30k Releases (Knex raw SQL, auction_status filter)
│   │   │   │   │   └── filters/route.ts  # GET filter options with counts (format/country/year)
│   │   │   │   ├── media/       # Medien-Verwaltung API (browse, edit, stats)
│   │   │   │   │   └── [id]/route.ts     # GET/POST Release-Detail + Bewertung
│   │   │   │   └── transactions/         # Transaction Management (RSE-76)
│   │   │   │       ├── route.ts          # GET: All transactions (filter by status)
│   │   │   │       └── [id]/route.ts     # GET detail + POST shipping status update
│   │   │   └── store/           # Store API (Publishable Key required)
│   │   │       ├── auction-blocks/   # Public: list, detail, item detail
│   │   │       │   ├── route.ts      # List blocks (items_count, status filter)
│   │   │       │   └── [slug]/
│   │   │       │       ├── route.ts       # Block detail + items + Release data
│   │   │       │       └── items/[itemId]/
│   │   │       │           ├── route.ts   # Item detail + Release + Images
│   │   │       │           └── bids/route.ts  # GET bids + POST bid (auth required)
│   │   │       ├── catalog/          # Katalog API (alle 30k Releases)
│   │   │       │   └── [id]/route.ts # Release-Detail + Images + Related Releases
│   │   │       └── account/          # Account APIs (RSE-75b + RSE-76)
│   │   │           ├── bids/route.ts         # GET: Meine Gebote
│   │   │           ├── wins/route.ts         # GET: Gewonnene Items
│   │   │           ├── checkout/route.ts     # POST: Stripe Checkout Session (RSE-76)
│   │   │           └── transactions/route.ts # GET: Meine Transactions (RSE-76)
│   │   │   ├── webhooks/
│   │   │   │   └── stripe/route.ts  # POST: Stripe Webhook (RSE-76)
│   │   │   ├── middlewares.ts   # Auth middleware (bids + account + webhook raw body)
│   │   │   └── jobs/
│   │   │       └── auction-lifecycle.ts  # Cron: Block activation/ending (every min)
│   │   └── admin/routes/        # Admin Dashboard UI Extensions (Englisch)
│   │       ├── auction-blocks/
│   │       │   ├── page.tsx     # Block-Übersicht (Tabelle)
│   │       │   └── [id]/page.tsx # Block-Detail (Edit + Items + Produkt-Browser)
│   │       ├── media/
│   │       │   ├── page.tsx     # Media Management (30k Releases, Filter, Sortierung)
│   │       │   └── [id]/page.tsx # Release-Detail (Info, Bewertung, Discogs-Daten)
│   │       ├── sync/
│   │       │   └── page.tsx     # Sync-Dashboard (Legacy + Discogs Status)
│   │       └── components/
│   │           └── rich-text-editor.tsx  # TipTap WYSIWYG Editor
│   └── node_modules/
├── storefront/                  # Next.js 16 Storefront (Port 3000)
│   ├── .env.local               # MEDUSA_URL + Publishable API Key
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx       # Layout: Header, Footer, Dark Theme, AuthProvider (lang="en")
│   │   │   ├── page.tsx         # Homepage: Hero, aktive/demnächst Blöcke
│   │   │   ├── auctions/
│   │   │   │   ├── page.tsx     # Auktionsübersicht + AuctionListFilter
│   │   │   │   └── [slug]/
│   │   │   │       ├── page.tsx # Block-Detail: Hero, BlockItemsGrid
│   │   │   │       └── [itemId]/page.tsx  # Item-Detail + ItemBidSection + RelatedSection
│   │   │   ├── catalog/
│   │   │   │   ├── page.tsx     # Katalog-Liste (alle 30k Releases, Suche, Filter)
│   │   │   │   └── [id]/page.tsx # Katalog-Detail + CatalogRelatedSection
│   │   │   └── account/         # Account-Bereich (RSE-75b)
│   │   │       ├── layout.tsx   # Auth-Guard, Sidebar-Nav, Responsive
│   │   │       ├── page.tsx     # Übersicht: Willkommen + Summary-Karten
│   │   │       ├── bids/page.tsx    # Meine Gebote (gruppiert, Status-Badges)
│   │   │       ├── wins/page.tsx    # Gewonnene Items + Stripe Payment (RSE-76)
│   │   │       └── settings/page.tsx # Profil-Informationen (readonly)
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx        # Disc3 Logo + Gold Gradient, sticky header
│   │   │   │   ├── Footer.tsx        # Warm footer mit Disc3 icon
│   │   │   │   └── MobileNav.tsx     # Sheet-based mobile nav
│   │   │   ├── ui/                   # shadcn/ui Komponenten (17 installiert)
│   │   │   ├── AuthProvider.tsx      # Auth Context (JWT, Customer)
│   │   │   ├── AuthModal.tsx         # Login/Register Modal
│   │   │   ├── HeaderAuth.tsx        # Login/Logout/My Account im Header
│   │   │   ├── HomeContent.tsx       # Homepage Sections (Running/Upcoming)
│   │   │   ├── BlockCard.tsx         # BlockCardVertical + BlockCardHorizontal
│   │   │   ├── ItemBidSection.tsx    # BidForm + BidHistory + Countdown + Realtime
│   │   │   ├── AuctionListFilter.tsx # Pill-Filter (All/Running/Upcoming/Ended)
│   │   │   ├── BlockItemsGrid.tsx    # Sort-Pills + Suche + Item-Grid
│   │   │   ├── ImageGallery.tsx      # Lightbox + Thumbnails mit Gold-Ring
│   │   │   ├── RelatedSection.tsx    # Related-Info Tabs (Artist/Label/Block Items) — Auktionen
│   │   │   ├── CatalogRelatedSection.tsx # Related-Tabs (by Artist/Label) — Katalog
│   │   │   └── EmptyState.tsx        # Reusable Empty State
│   │   └── lib/
│   │       ├── api.ts           # medusaFetch Helper
│   │       ├── auth.ts          # Medusa Auth Helpers
│   │       ├── motion.ts        # Framer Motion Variants
│   │       ├── utils.ts         # cn() Helper + cleanCredits() for legacy data cleanup
│   │       └── supabase.ts      # Supabase Client (Realtime)
│   └── node_modules/
├── clickdummy/                  # Interaktiver Clickdummy (Port 3005)
│   ├── ecosystem.config.js      # PM2 Config
│   ├── nginx-vodauction.conf    # Nginx Template
│   ├── src/
│   │   ├── app/                 # 18 Screens (Homepage, Auctions, Account, Emails)
│   │   ├── components/          # Header, Footer, FlowGuide, BidSection, etc.
│   │   ├── context/FlowContext.tsx  # 10-Step Flow State (localStorage)
│   │   └── data/                # Static JSON (50 Items, 3 Blocks, Bids)
│   └── node_modules/
├── scripts/                     # Migration-Scripts (Python)
│   ├── extract_legacy_data.py   # MySQL → JSON
│   ├── load_json_to_supabase.py # JSON → Supabase (psycopg2, Batch 500)
│   ├── requirements.txt         # Python deps
│   └── data/                    # Extrahierte JSON-Daten (git-ignored)
├── supabase/migrations/         # SQL Migrations (RSE-72)
├── data/                        # Lokale Daten (git-ignored)
└── docs/                        # Architektur, Legal, Marketing
```

### Medusa.js Backend

**Port:** 9000
**Admin Dashboard:** http://localhost:9000/app
**Admin User:** admin@vod.de / admin123
**Publishable API Key:** `pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d`

**Starten:**
```bash
cd VOD_Auctions/backend
npx medusa develop    # Backend + Admin UI (hot reload)
```

**Wichtig:**
- SSL-Config in `medusa-config.ts` nötig für Supabase-Verbindung (`rejectUnauthorized: false`)
- Medusa erstellt eigene Tabellen (`auction_block`, `block_item` — Singular) neben den RSE-72 Tabellen (`auction_blocks`, `block_items` — Plural)
- Legacy-Daten (Release, Artist, Label) werden via Knex raw SQL abgefragt, nicht über Medusa ORM
- Store-API braucht `x-publishable-api-key` Header
- Admin Produkt-Browser: Filter (Format-Pills, Land, Jahr-Range, Label, Sortierung) + Grid/Tabellen-Ansicht
- `/admin/releases` unterstützt: q, format, country, label, year_from, year_to, sort, auction_status
- `/admin/releases/filters` liefert verfügbare Filter-Optionen mit Counts
- Block-Update Route strippt `items` aus Body (Items nur über `/items` Endpoint verwaltet)
- `current_block_id` in Release-Tabelle ist UUID-Typ → Medusa ULIDs nicht kompatibel (nur auction_status wird aktualisiert)
- **Admin Custom Routes:** `defineRouteConfig({ label })` NUR auf Top-Level-Seiten (`page.tsx`), NICHT auf `[id]/page.tsx` Detail-Seiten (verursacht Routing-Konflikte)
- **Knex Gotcha — Decimal-Spalten:** Knex gibt DECIMAL-Spalten als Strings zurück, nicht als Numbers. In Admin-UI immer `Number(value)` vor `.toFixed()` verwenden.
- **Knex Gotcha — Subqueries:** `.where("col", pgConnection.raw('(SELECT ...)'))` funktioniert NICHT korrekt. Stattdessen: Wert zuerst abfragen, dann direkt verwenden: `.where("col", fetchedValue)`
- **Admin Build:** `medusa build` legt Admin-Assets in `.medusa/server/public/admin/`, muss nach `public/admin/` kopiert werden (siehe VPS Deploy)
- `/admin/media` unterstützt: q, format, country, label, year_from, year_to, sort (field:dir Format), has_discogs, auction_status
- Admin-UI komplett auf Englisch (Media Management, Release Detail, Sync Dashboard)

### Storefront

**Port:** 3000 (lokal), 3006 (VPS/Produktion)
**URL:** https://vod-auctions.com (VPS, PM2, Port 3006, nginx reverse proxy)
**Sprache:** Englisch (alle UI-Texte, Locale en-US/en-GB)
**Starten:**
```bash
cd VOD_Auctions/storefront
npm run dev                  # Local development (port 3000)
```

**Wichtig:**
- `next.config.ts` muss externe Bild-Domains whitelisten (`tape-mag.com` für Legacy-Bilder)
- Bilder-URLs: `https://tape-mag.com/bilder/gross/{filename}` (Legacy-System)
- Storefront Katalog (`/catalog`): Zeigt alle 30k Releases mit Suche, Format-Filter, Sortierung
- Katalog-Detail (`/catalog/[id]`): Release-Info + Images + Related Releases by Artist/Label
- Auktions-Detail (`/auctions/[slug]/[itemId]`): Item-Info + Bidding + Related Section mit Block Items
- Credits-Text: Wird beim Rendern bereinigt (literal Escape-Sequenzen, CRLF, HTML-Tags → echte Newlines) via `.replace()` in Catalog + Auction Pages
- Artikelnummer: Wird als erstes Feld in Details-Sektion angezeigt (Catalog + Auction)
- Discogs-Preise: Low/Median/High + "View on Discogs" Link auf Detailseiten
- **Related Sections:** `RelatedSection.tsx` (Auktionen, Tabs: by Artist/Label/Block Artists/Labels/All Lots) und `CatalogRelatedSection.tsx` (Katalog, Tabs: by Artist/Label) — beide als kompakte Tabellen

### Clickdummy

**Purpose:** Interaktiver Prototyp der kompletten Customer Journey (18 Screens, 10-Step FlowGuide)
**Port:** 3005
**URL:** https://vodauction.thehotshit.de
**Deployment:** PM2 (`vodauction-clickdummy`) on VPS (72.62.148.205), nginx reverse proxy + Certbot SSL

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Framer Motion, localStorage-State

**Starten:**
```bash
cd VOD_Auctions/clickdummy
npm run dev -- -p 3005    # Local development
npm run build             # Production build
```

**Screens:** Homepage, Auktionsübersicht, Block-Detail (50 Items), Item-Detail (Bidding-Flow mit 10 States), Account (Dashboard, Gebote, Gewonnen, Checkout, Erfolg, Einstellungen), 6 E-Mail-Vorschauen (Phone-Frame Mockup)

**FlowGuide:** Floating bottom bar navigiert durch: Besucher → Registriert → Gebot → Überboten → Erneut geboten → Auktion endet → Gewonnen → Bezahlt → Versendet → Zugestellt

**Key Files:**
- `src/context/FlowContext.tsx` — State-Management (localStorage-backed, 10 steps)
- `src/data/items.ts` — 50 Dark Ambient/Drone Auction Items
- `src/data/blocks.ts` — 3 Auction Blocks
- `src/components/FlowGuide.tsx` — Demo-Navigation
- `src/components/BidSection.tsx` — Bidding mit allen States
- `ecosystem.config.js` — PM2 Config
- `nginx-vodauction.conf` — Nginx Template

## Linear Tracking

**Project:** [VOD Auctions](https://linear.app/rseckler/project/vod-auctions-37f35d4e90be)

### Phase 0 (Setup) — Done
- ~~**RSE-83:** Medusa.js Projekt-Setup & Konfiguration~~ ✅

### Phase 1 (Prototyp)

**Done:**
- ~~**RSE-72:** P1.1 Datenbank vorbereiten~~ ✅
- ~~**RSE-73:** P1.2 Admin-Panel~~ ✅
- ~~**RSE-74:** P1.3 Public Frontend~~ ✅
- ~~**RSE-75:** P1.4 Bidding-Engine~~ ✅
- ~~**RSE-84:** P1.4b UX Polish & Auktions-Workflow~~ ✅
- ~~**RSE-85:** P1.x Storefront UX Redesign~~ ✅
- ~~**RSE-87:** English Translation~~ ✅
- ~~**RSE-88:** Article Numbers (VOD-XXXXX)~~ ✅
- ~~**RSE-89:** Discogs Prices (Low/Median/High)~~ ✅
- ~~**RSE-90:** Credits Cleanup (cleanCredits utility)~~ ✅
- ~~**RSE-91:** Admin Detail Fix (field names + formatPrice)~~ ✅
- ~~**RSE-92:** Related Releases Fix (Knex subquery bug)~~ ✅
- ~~**RSE-93:** Backfill Script (Discogs price suggestions)~~ ✅
- ~~**RSE-94:** VPS Deployment (Backend + Storefront)~~ ✅
- ~~**RSE-95:** Re-run Discogs price backfill~~ ✅
- ~~**RSE-96:** VPS Cronjobs (Legacy + Discogs Sync)~~ ✅

- ~~**RSE-76:** Payment & Stripe Integration~~ ✅

**Next (Backlog/Todo):**
- **RSE-77:** Testlauf (1 Block, 10-20 Produkte) ← NÄCHSTER SCHRITT
- **RSE-100:** Checkout Flow (Order Summary Page)
- **RSE-101:** Order Progress Tracking (Paid/Shipped/Delivered UI)
- **RSE-102:** Transactional Email Templates (6 Emails)
- **RSE-103:** Shipping Configuration (Admin-konfigurierbar)
- **RSE-104:** Bid Confirmation Modal
- **RSE-105:** Legal Pages (Impressum, AGB, Datenschutz)

**Independent (can start now):**
- **RSE-97:** SEO & Meta Tags
- **RSE-98:** Storefront Performance (Image optimization)
- **RSE-99:** Admin Media Bulk Actions

### Phase 2 (Launch) — Backlog
- **RSE-78:** P2.1 Launch-Vorbereitung (Domain, SEO, Legal)
- **RSE-79:** P2.2 Erste öffentliche Themen-Auktionen
- **RSE-80:** P2.3 Marketing (tape-mag.com Kundenbasis)

### Phase 3-4 — Backlog
- **RSE-81:** P3 Skalierung (5.000+ Items)
- **RSE-82:** P4 Evaluierung & Datenanalyse

### Duplicate/Obsolete
- RSE-31, RSE-32, RSE-33 — Duplicate (alte eBay-Test Phase, ersetzt durch eigene Plattform)

## Data Sync & Enrichment Scripts

**Location:** `scripts/`

```bash
cd VOD_Auctions/scripts

# Shared utilities (imported by all scripts)
# scripts/shared.py — DB connections, format mapping, Discogs config, RateLimiter

# Legacy MySQL → Supabase Sync (daily)
python3 legacy_sync.py           # Incremental sync of new/changed entries

# Discogs Price Enrichment
python3 discogs_batch.py          # Initial batch: match all 30k releases (8-12h, resumable)
python3 discogs_weekly_sync.py    # Weekly price update (lowest + median + highest, 4-5h, resumable)
python3 backfill_discogs_prices.py # Two-pass backfill: 1) /releases for basic data, 2) /price_suggestions for median/highest
python3 discogs_price_test.py     # Feasibility test (100 random releases)

# Article Numbers
psql $SUPABASE_DB_URL -f generate_article_numbers.sql  # Generate VOD-XXXXX numbers
```

**Cronjobs (VPS — verifiziert 2026-03-03, alle Dependencies installiert):**
```bash
# Legacy MySQL → Supabase (daily 04:00 UTC)
0 4 * * * cd ~/VOD_Auctions/scripts && ~/VOD_Auctions/scripts/venv/bin/python3 legacy_sync.py >> legacy_sync.log 2>&1
# Discogs Weekly Price Update (Sunday 02:00 UTC)
0 2 * * 0 cd ~/VOD_Auctions/scripts && ~/VOD_Auctions/scripts/venv/bin/python3 discogs_weekly_sync.py >> discogs_weekly.log 2>&1
```

**VPS Python Dependencies (venv at `scripts/venv/`):**
psycopg2-binary, python-dotenv, requests, mysql-connector-python

**New DB columns:** discogs_id, discogs_lowest_price, discogs_median_price, discogs_highest_price, discogs_num_for_sale, discogs_have, discogs_want, discogs_last_synced, legacy_last_synced, article_number
**New DB table:** sync_log (id, release_id, sync_type, sync_date, changes JSONB, status, error_message)

## Admin Panel Extensions

**Media Management:** `/admin/media` — Browse/search/filter alle 30k Releases mit Discogs-Daten
- Spalten: Cover, Artist, Title, Format, Year, Country, Label, Art. No., CatNo, Discogs Price, Discogs ID, Status, Last Sync
- Filter: Search (debounced), Format-Pills, Country, Year (von-bis Range), Label (debounced), Has Discogs, Auction Status
- Sortierung: Alle Spalten sortierbar (field:dir Format)
- API: GET /admin/media, GET /admin/media/:id, POST /admin/media/:id, GET /admin/media/stats

**Sync-Dashboard:** `/admin/sync` — Legacy + Discogs Sync-Status und Reports
- API: GET /admin/sync, GET /admin/sync/legacy, GET /admin/sync/discogs

**Transaction Management:** `/admin/transactions` — Zahlungen & Versand (RSE-76)
- API: GET /admin/transactions (filter: status, shipping_status)
- API: GET /admin/transactions/:id, POST /admin/transactions/:id (shipping_status update)

## Stripe Payment Integration (RSE-76)

**Stripe Account:** VOD Records Sandbox (`acct_1T7WaYEyxqyK4DXF`)
**Dashboard:** https://dashboard.stripe.com (frank@vod-records.com)
**Mode:** Test (sk_test_... / whsec_...)
**Webhook URL:** https://api.vod-auctions.com/webhooks/stripe
**Events:** checkout.session.completed, checkout.session.expired

### Payment Flow
1. Auktion endet → `auction-lifecycle.ts` markiert Items als `sold`
2. Gewinner sieht Items unter `/account/wins`
3. Wählt Shipping-Zone (DE/EU/World) → klickt "Pay Now"
4. POST `/store/account/checkout` erstellt Transaction + Stripe Checkout Session
5. Redirect zu Stripe Hosted Checkout (Kreditkarte, SEPA, Klarna etc.)
6. Nach Zahlung: Stripe Webhook → Transaction `status: "paid"`, Lieferadresse gespeichert
7. Admin: Shipping-Status updaten (shipped/delivered) via POST `/admin/transactions/:id`

### Shipping Rates (Flat-Rate, hardcoded)
- **Germany:** €4.99
- **Europe:** €9.99
- **Worldwide:** €14.99

### Transaction Status
- `status`: pending → paid → refunded (oder failed)
- `shipping_status`: pending → shipped → delivered

### Key Files
- `backend/src/lib/stripe.ts` — Stripe Client + Shipping-Rates Config
- `backend/src/modules/auction/models/transaction.ts` — Transaction Model
- `backend/src/api/store/account/checkout/route.ts` — Checkout Session erstellen
- `backend/src/api/webhooks/stripe/route.ts` — Webhook Handler
- `backend/src/api/store/account/transactions/route.ts` — Meine Transactions
- `backend/src/api/admin/transactions/` — Admin Transaction Management
- `storefront/src/app/account/wins/page.tsx` — Pay-Button + Status-Badges

### Testing
```bash
# Lokal: Stripe CLI für Webhook-Forwarding
stripe listen --forward-to localhost:9000/webhooks/stripe

# Test-Karte
4242 4242 4242 4242 (beliebiges Datum/CVC)
```

## Related Projects

- **[tape-mag-mvp](../VOD/tape-mag-mvp/)** — Shared Supabase DB, Release-Tabelle
- **[tape-mag-migration](../VOD/tape-mag-migration/)** — Legacy → Supabase Migration
- **[VOD_discogs](../VOD_discogs/)** — Discogs-Daten für Preisschätzungen
- **[Blackfire_service](../Blackfire_service/)** — Gleicher Tech-Stack (Next.js + Supabase)

## Credentials (Required)

Store in `.env` (git-ignored), manage via `Passwords/` directory:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Anon Key
- `SUPABASE_PROJECT_ID` — Supabase Project ID (bofblwqieuvmqybzxapx)
- `SUPABASE_DB_URL` — Direct PostgreSQL Connection (für Migration-Scripts)
- `LEGACY_DB_*` — Legacy MySQL Credentials (nur für Migration)
- `STRIPE_SECRET_KEY` — Stripe API Key
- `STRIPE_WEBHOOK_SECRET` — Stripe Webhook Secret
- `UPSTASH_REDIS_REST_URL` — Redis URL
- `UPSTASH_REDIS_REST_TOKEN` — Redis Token

## VPS Deployment

**Server:** 72.62.148.205 (Hostinger Ubuntu)
**SSH:** `ssh root@72.62.148.205`

**URLs:**
- Backend/Admin: https://api.vod-auctions.com (Port 9000, nginx reverse proxy)
- Storefront: https://vod-auctions.com (Port 3006, nginx reverse proxy)
- Clickdummy: https://vodauction.thehotshit.de (Port 3005, nginx reverse proxy)

**PM2 Prozesse:**
- `vodauction-backend` — Medusa.js Backend + Admin Dashboard
- `vodauction-storefront` — Next.js Storefront

**Deploy-Workflow (Backend + Admin):**
```bash
# Lokal: commit & push
cd VOD_Auctions && git add . && git commit -m "..." && git push

# Auf VPS:
ssh root@72.62.148.205
cd /root/VOD_Auctions && git pull
cd backend
npx medusa build                              # Backend + Admin UI kompilieren
rm -rf public/admin                           # Alten Cache löschen (WICHTIG! Sonst alte JS-Bundles)
cp -r .medusa/server/public/admin public/admin  # Admin-Assets kopieren
pm2 restart vodauction-backend
```

**Deploy-Workflow (Storefront):**
```bash
ssh root@72.62.148.205
cd /root/VOD_Auctions && git pull
cd storefront
npm run build
pm2 restart vodauction-storefront
```

**WICHTIG — Admin Build Gotcha:**
- `medusa build` legt Admin-Assets in `.medusa/server/public/admin/`
- `medusa start` erwartet sie in `public/admin/`
- Ohne `cp -r .medusa/server/public/admin public/admin` → 502 Bad Gateway!
- Vor einem Rebuild: `rm -rf public/admin` um alten Cache zu löschen

## Development

```bash
# Backend (Medusa.js 2.x)
cd VOD_Auctions/backend
npx medusa develop           # Start backend + admin dashboard (port 9000)
npx medusa user -e X -p Y    # Create admin user
npx medusa db:generate auction  # Generate migration for auction module
npx medusa db:migrate          # Run migrations

# Storefront (Next.js 16)
cd VOD_Auctions/storefront
npm run dev                  # Start storefront (port 3000)
npm run build                # Build for production

# Clickdummy (Next.js 16, standalone)
cd VOD_Auctions/clickdummy
npm run dev -- -p 3005       # Start clickdummy (port 3005)
npm run build                # Build for production

# API testen
curl http://localhost:9000/health
curl http://localhost:9000/store/auction-blocks -H "x-publishable-api-key: pk_..."
curl http://localhost:9000/admin/auction-blocks -H "Authorization: Bearer $TOKEN"
```

---

**Author:** Robin Seckler (rseckler@gmail.com)
