# VOD Auctions

**Vinyl-on-Demand Auctions** — A self-hosted auction platform for ~41,500 industrial music releases, books, and merchandise. Built to replace eBay/Discogs and eliminate 8–13% platform fees.

**Status:** Pre-launch · Internal test auction upcoming (RSE-77)

---

## What It Does

- **Curated auction blocks** — themed collections (genre, artist, era) with 1–500 lots each
- **Live bidding** — real-time proxy bidding with anti-sniping auto-extension
- **Full checkout** — Stripe (Card, Klarna, EPS, Bancontact) + PayPal, weight-based shipping calculator
- **Catalog** — 41,500+ releases browsable by artist, label, format, country, year
- **Customer portal** — bid history, saved items, order tracking, PDF invoices
- **Admin backoffice** — auction management, CRM, fulfillment workflow, AI assistant

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Commerce Backend | Medusa.js 2.x |
| Frontend | Next.js 16, React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, shadcn/ui, Framer Motion |
| Database | PostgreSQL via Supabase |
| Realtime | Supabase Realtime (live bidding) |
| Cache | Upstash Redis |
| Payments | Stripe + PayPal |
| Email | Resend (transactional) + Brevo (newsletter) |
| Tracking | Rudderstack |
| Hosting | VPS (PM2 + nginx) |

---

## Key Features

### Storefront
- Auction calendar with block overview + live countdown timers
- Lot detail pages with proxy bidding, bid history, winning indicator
- Full-text catalog search with filters (format, country, year, category)
- Artist, label, and press organization entity pages (AI-enriched descriptions)
- Image gallery, tracklist parser, Discogs price reference
- One-page checkout (Stripe inline + PayPal)
- Customer account: orders, bids, saved items, GDPR export

### Admin
- Auction block CRUD with live bid monitor
- Post-auction fulfillment workflow (Winner Emails → Payments → Pack & Ship → Archive)
- Shipping label PDF generation (pdfkit)
- CRM: customer list, stats, notes, timeline, audit log, CSV export
- AI Assistant (Claude Haiku, 5 read-only tools, streaming SSE)
- Entity Content dashboard (AI overhaul pipeline status + budget)
- Discogs sync health monitor

### Infrastructure
- Weight-based shipping zones (DE / EU / World, 13 item types, 15 weight tiers)
- Stripe webhooks + PayPal webhooks with server-side amount verification
- Race condition protection on bid submissions (SELECT FOR UPDATE)
- E2E test suite (Playwright, 66 tests)
- Password gate for pre-launch (removable at launch)

---

## Project Structure

```
VOD_Auctions/
├── backend/          # Medusa.js 2.x — API, auction module, webhooks
├── storefront/       # Next.js 16 — public-facing storefront
├── scripts/          # Data sync (legacy MySQL → Supabase, Discogs)
├── nginx/            # Reverse proxy configs
└── docs/             # Architecture docs, UX audit, changelog
```

---

## Dev Setup

```bash
# Backend (port 9000)
cd backend && npx medusa develop

# Storefront (port 3000)
cd storefront && npm run dev

# Admin: http://localhost:9000/app
```

Copy `.env.example` to `.env` (backend) and `.env.local` (storefront) and fill in credentials.

**Required services:** PostgreSQL (Supabase), Redis (Upstash), Stripe, PayPal, Resend

---

## Deployment

**Production URLs:**
- Storefront: https://vod-auctions.com
- API: https://api.vod-auctions.com
- Admin: https://admin.vod-auctions.com

```bash
# Backend
ssh root@VPS && cd /root/VOD_Auctions
git pull && cd backend
npx medusa build
rm -rf public/admin && cp -r .medusa/server/public/admin public/admin
pm2 restart vodauction-backend

# Storefront
cd storefront && npm run build && pm2 restart vodauction-storefront
```

---

## Data

- **41,529 releases** (vinyl, CD, cassette, books, merchandise)
- **12,451 artists** · **3,077 labels** · **1,983 press organizations**
- **75,124 images** · migrated from legacy MySQL/PHP system
- Categories: `release` / `band_literature` / `label_literature` / `press_literature`

---

*Built by [Robin Seckler](https://github.com/rseckler)*
