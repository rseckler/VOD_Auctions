# VOD_Auctions - CLAUDE.md

This file provides guidance to Claude Code when working with the VOD Auctions project.

## Project Overview

**Purpose:** Auktionsplattform für ~30.000 Tonträger (Industrial Music, Nischen-Genres)

**Goal:** Eigene Plattform mit voller Kontrolle über Marke, Kundendaten, Preisgestaltung — statt 8-13% Gebühren an eBay/Discogs

**Status:** Konzeptphase — Prototyp-Entwicklung steht bevor

**Created:** 2026-02-10
**Last Updated:** 2026-03-01

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
| **Frontend** | Next.js 15+, React 19, TypeScript 5 |
| **Styling** | Tailwind CSS, shadcn/ui |
| **Database** | Supabase PostgreSQL (Shared mit tape-mag-mvp) |
| **Real-time** | Supabase Realtime (Live-Bidding) |
| **Cache** | Upstash Redis (Bid-Cache) |
| **Payments** | Stripe (+ Stripe Connect) |
| **Storage** | Supabase Storage (Bilder, Content) |
| **Hosting** | Vercel (Auto-Deploy) |
| **State** | Zustand (global) + React Query (server) |

### Supabase-Projekt (Shared)

**Projekt-ID:** `ouunftsxmuqgfqsoqnxq` (West EU)

Die Auktionsplattform teilt sich die Supabase-Instanz mit tape-mag-mvp. Die `Release`-Tabelle (= Produkt) existiert bereits — Auktions-Tabellen werden als Erweiterung hinzugefügt.

## Implementation Plan

### Phase 1: Prototyp (Monate 1-2) ← NÄCHSTER SCHRITT
- Data Migration (~30.000 Releases → Supabase)
- Auktions-Tabellen anlegen (auction_blocks, block_items, bids, transactions)
- Release-Tabelle um Auktionsfelder erweitern
- Admin-Panel: Block-Erstellung, Produktauswahl, Startpreis-Review
- Public Frontend: Auktionskalender, Block-Detailseite
- Bidding-Engine: Gebote, Real-time, Auto-Extension
- Testlauf: 1 Block mit 10-20 Produkten

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

### Neu (Auktions-Layer)
- `auction_blocks` — Themen-Auktionsblöcke
- `block_items` — Zuordnung Release → Block (mit Startpreis, Status)
- `bids` — Alle Gebote
- `transactions` — Zahlungen & Versand
- `related_blocks` — Verwandte Blöcke

### Release-Erweiterung
```sql
ALTER TABLE "Release" ADD COLUMN estimated_value DECIMAL(10,2);
ALTER TABLE "Release" ADD COLUMN media_condition TEXT;
ALTER TABLE "Release" ADD COLUMN sleeve_condition TEXT;
ALTER TABLE "Release" ADD COLUMN auction_status TEXT DEFAULT 'available';
ALTER TABLE "Release" ADD COLUMN current_block_id TEXT;
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
├── CLAUDE.md              # Claude Code Guidance
├── KONZEPT.md             # Vollständiges Konzeptdokument
├── README.md              # Kurzübersicht
├── .env.example           # Environment Variables Template
├── .gitignore
├── docs/
│   ├── architecture/      # Architektur-Diagramme, ADRs
│   ├── legal/             # AGB, Impressum, Datenschutz
│   └── marketing/         # Marketing-Materialien
├── src/
│   ├── app/               # Next.js App Router (Pages, Layouts, API Routes)
│   ├── components/
│   │   ├── ui/            # shadcn/ui Basis-Komponenten
│   │   ├── auction/       # Auktions-Komponenten (Bidding, Timer, Block-Cards)
│   │   ├── admin/         # Admin-Panel Komponenten
│   │   └── shared/        # Shared Komponenten (Header, Footer, Navigation)
│   ├── lib/
│   │   ├── supabase/      # Supabase Client, Queries, Realtime
│   │   ├── redis/         # Upstash Redis Client, Bid-Cache
│   │   ├── stripe/        # Stripe Integration, Webhooks
│   │   ├── medusa/        # Medusa.js Client, Commerce Logic
│   │   └── utils/         # Helper Functions
│   ├── hooks/             # Custom React Hooks
│   ├── store/             # Zustand Stores
│   └── types/             # TypeScript Type Definitions
├── supabase/
│   ├── migrations/        # SQL Migrations
│   └── seed/              # Seed Data
├── scripts/               # Build-, Migration-, Maintenance-Scripts
├── public/
│   ├── images/            # Statische Bilder
│   └── audio/             # Audio-Previews
└── data/                  # Lokale Daten (git-ignored)
    └── migration/         # Migration-Dateien
```

## Linear Tracking

**Project:** [VOD Auctions](https://linear.app/rseckler/project/vod-auctions-37f35d4e90be)

### Phase 0 (Setup)
- **RSE-83:** Medusa.js Projekt-Setup & Konfiguration

### Phase 1 (Prototyp)
- **RSE-72:** P1.1 Datenbank vorbereiten (Auktions-Tabellen, Release-Erweiterung)
- **RSE-73:** P1.2 Admin-Panel (Block-Erstellung, Produktauswahl)
- **RSE-74:** P1.3 Public Frontend (Auktionskalender, Block-Detailseite)
- **RSE-75:** P1.4 Bidding-Engine (Gebote, Real-time, Auto-Extension)
- **RSE-76:** P1.5 Payment & Stripe Integration
- **RSE-77:** P1.6 Testlauf (1 Block, 10-20 Produkte)

### Phase 2 (Launch)
- **RSE-78:** P2.1 Launch-Vorbereitung (Domain, SEO, Legal)
- **RSE-79:** P2.2 Erste öffentliche Themen-Auktionen
- **RSE-80:** P2.3 Marketing (tape-mag.com Kundenbasis)

### Phase 3-4
- **RSE-81:** P3 Skalierung (5.000+ Items)
- **RSE-82:** P4 Evaluierung & Datenanalyse

## Related Projects

- **[tape-mag-mvp](../VOD/tape-mag-mvp/)** — Shared Supabase DB, Release-Tabelle
- **[tape-mag-migration](../VOD/tape-mag-migration/)** — Legacy → Supabase Migration
- **[VOD_discogs](../VOD_discogs/)** — Discogs-Daten für Preisschätzungen
- **[Blackfire_service](../Blackfire_service/)** — Gleicher Tech-Stack (Next.js + Supabase)

## Credentials (Required)

Store in `.env` (git-ignored), manage via `Passwords/` directory:
- `DATABASE_URL` — Supabase PostgreSQL Connection String
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Anon Key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase Service Key
- `STRIPE_SECRET_KEY` — Stripe API Key
- `STRIPE_WEBHOOK_SECRET` — Stripe Webhook Secret
- `UPSTASH_REDIS_REST_URL` — Redis URL
- `UPSTASH_REDIS_REST_TOKEN` — Redis Token

## Development (once started)

```bash
cd VOD_Auctions
pnpm install
pnpm dev              # Start dev server
pnpm build            # Build for production
pnpm lint             # Run ESLint
pnpm type-check       # TypeScript checking
```

---

**Author:** Robin Seckler (rseckler@gmail.com)
