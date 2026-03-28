# VOD Auctions — Projektübersicht

> Eigenständige Auktions- und Direktkauf-Plattform für industrielle Musik, Literatur und Merchandise.
> **URL:** [vod-auctions.com](https://vod-auctions.com) (Pre-Launch, Passwort-geschützt)

---

## 1. Was ist VOD Auctions?

VOD Auctions ist eine E-Commerce-Plattform für den Verkauf von ca. **41.500 Produkten** aus dem Bestand von VOD Records — einem der größten Archive für Industrial Music weltweit. Die Plattform ersetzt den bisherigen Verkauf über eBay und Discogs (8–13 % Gebühren) durch ein eigenes System mit voller Kontrolle über Branding, Preisgestaltung und Kundendaten.

### Produktkategorien

| Kategorie | Anzahl | Beschreibung |
|-----------|--------|--------------|
| Releases (Musik) | 30.159 | Vinyl, CD, Kassette, etc. |
| Band-Literatur | 3.915 | Bücher, Zines über Bands |
| Label-Literatur | 1.129 | Label-bezogene Publikationen |
| Press-Literatur | 6.326 | Musik-Magazine, Zeitschriften |

### Verkaufsmodell

- **Auktionen:** Kuratierte thematische Blöcke (1–500 Produkte pro Block), mit Countdown, Proxy-Bidding und Live-Updates
- **Direktkauf:** 13.571 Artikel zum Festpreis (für alle registrierten Nutzer)
- **Blocktypen:** Thematic, Highlight, Clearance, Flash

---

## 2. Technologie-Stack

### Frontend (Storefront)
- **Next.js 16** + React 19 + TypeScript 5
- **Tailwind CSS 4** + shadcn/ui + Framer Motion
- **Port 3006** (Produktion), erreichbar unter `vod-auctions.com`

### Backend
- **Medusa.js 2.13** (Open-Source E-Commerce Engine, MIT-Lizenz)
- TypeScript, eigene API-Routen für Auktionen, Versand, CMS, Newsletter
- **Port 9000**, erreichbar unter `api.vod-auctions.com`

### Datenbank
- **Supabase PostgreSQL** (Region: eu-central-1, Frankfurt)
- 24 Tabellen, 75+ Indizes, Row Level Security auf allen Tabellen
- Realtime-Subscriptions für Live-Bidding

### Infrastruktur
- **Hosting:** Hostinger VPS (Ubuntu 24.04 LTS), PM2 als Process Manager
- **Webserver:** Nginx (Reverse Proxy + SSL via Certbot/Let's Encrypt)
- **Cache:** Upstash Redis (Bid-Cache)
- **Domains:** `vod-auctions.com`, `api.vod-auctions.com`, `admin.vod-auctions.com`

### Daten-Pipeline (Python)
- 20+ Python-Skripte für Datenmigration, Sync und Enrichment
- Täglicher Legacy-Sync (MySQL → Supabase, 04:00 UTC)
- Discogs-Preisabgleich (Mo–Fr, 02:00 UTC, 5 Chunks/Tag)
- AI-Content-Generierung via Claude Haiku (Band-/Label-/Press-Beschreibungen)

---

## 3. Architektur-Überblick

```
┌─────────────────────────────────────────────────────────┐
│                    Nginx (SSL)                          │
│  vod-auctions.com → :3006   api.vod-auctions.com → :9000│
└──────────┬──────────────────────────────┬───────────────┘
           │                              │
    ┌──────▼──────┐               ┌───────▼───────┐
    │  Storefront  │◄────────────►│    Backend     │
    │  Next.js 16  │   REST API   │  Medusa.js 2   │
    └──────┬──────┘               └───────┬───────┘
           │                              │
           │         ┌────────────────────┼────────────┐
           │         │                    │            │
    ┌──────▼──────┐  │  ┌────────────┐  ┌▼──────┐  ┌──▼───┐
    │   Stripe     │  │  │  Supabase  │  │ Redis │  │Resend│
    │  (Payments)  │  │  │ PostgreSQL │  │(Cache)│  │(Mail)│
    └─────────────┘  │  └────────────┘  └───────┘  └──────┘
                     │
              ┌──────▼──────┐
              │Python Scripts│
              │  (Cron Jobs) │
              │ Legacy Sync  │
              │ Discogs Sync │
              │ AI Content   │
              └─────────────┘
```

---

## 4. Kerndatenmodell

### Bestehende Tabellen (aus tape-mag-mvp)
- **Release** — 41.529 Einträge (Musik + Literatur)
- **Artist** — 12.451 Bands/Künstler
- **Label** — 3.077 (+ 2.829 neue durch Katalognummer-Enrichment)
- **Image** — 75.124+ Bilder (97%+ Cover-Abdeckung bei Musik)
- **Track, Genre, Tag, Format, PressOrga** — Stammdaten

### Auktions-spezifische Tabellen (Medusa ORM)
- **auction_block** — Thematische Auktionsblöcke
- **block_item** — Zuordnung Release → Block (inkl. Start-/Mindestpreis)
- **bid** — Gebote mit Proxy-Bidding (max_amount)
- **transaction** — Zahlungen und Versand-Tracking
- **cart_item** — Warenkorb (Direktkauf)
- **shipping_zone/rate/config/method** — Versandkonfiguration (3 Zonen: DE, EU, Welt)
- **entity_content** — CMS-Inhalte für SEO-Seiten
- **site_config** — Globale Plattform-Einstellungen

---

## 5. Wichtige Features

### Auktionssystem
- Thematische Blöcke mit Countdown-Timer
- Proxy-Bidding (automatisches Mitbieten bis Maximalbetrag)
- Live-Updates via Supabase Realtime
- Gebotsbestätigungs-Modal
- Bid-History pro Artikel

### Direktkauf
- 13.571 Artikel zum Festpreis
- Warenkorb mit Multi-Item-Checkout
- Stripe-Integration (Live Mode)

### Versand
- 3 Zonen (Deutschland, EU, Welt)
- 13 Artikeltypen mit individuellen Gewichten
- 15 Gewichtsstufen pro Zone
- Carrier-Management mit Tracking-URLs
- Automatische Kostenberechnung

### SEO & Content
- Entity Pages für Bands, Labels, Presse-Organisationen
- AI-generierte Beschreibungen (Claude Haiku)
- Schema.org Markup (MusicGroup, Organization)
- Google Search Console integriert

### E-Mail & CRM
- 6 Transaktions-E-Mail-Templates (Resend API)
- Newsletter-System (Brevo/Sendinblue)
- CRM-Dashboard mit 3.580 importierten Kontakten (tape-mag.com)
- Behavior-Tracking (Consent-basiert)

### Rechtliches (deutsches Recht)
- Impressum, AGB, Datenschutzerklärung, Widerrufsbelehrung
- Cookie-Consent-Banner (DSGVO-konform)
- Google Analytics nur mit Einwilligung

---

## 6. Externe Dienste & Integrationen

| Dienst | Zweck | Kosten |
|--------|-------|--------|
| Supabase | Datenbank + Realtime | Free Tier |
| Stripe | Zahlungsabwicklung | Transaktionsgebühren |
| Resend | Transaktions-E-Mails | Free Tier |
| Brevo | Newsletter + CRM | Free Tier |
| Upstash Redis | Bid-Cache | Free Tier |
| Discogs API | Preisdaten + Matching | Kostenlos |
| Claude Haiku | AI-Content-Generierung | ~$0.05/Tag |
| Google Analytics | Traffic-Analyse | Kostenlos |
| Sentry | Error-Tracking | Free Tier |
| Certbot | SSL-Zertifikate | Kostenlos |

**Geschätzte Gesamtkosten:** < $5/Monat (exkl. VPS und Stripe-Gebühren)

---

## 7. Projektstruktur

```
VOD_Auctions/
├── backend/                 # Medusa.js 2.x Backend
│   ├── src/api/             #   Admin- und Store-API-Routen
│   ├── src/modules/         #   Medusa-Module (Auction, etc.)
│   └── medusa-config.ts     #   Backend-Konfiguration
├── storefront/              # Next.js 16 Frontend
│   ├── src/app/             #   Seiten (App Router)
│   ├── src/components/      #   UI-Komponenten
│   └── src/lib/             #   Utilities, API-Client
├── scripts/                 # Python-Skripte
│   ├── legacy_sync.py       #   MySQL → Supabase (täglich)
│   ├── discogs_daily_sync.py#   Discogs-Preise (Mo–Fr)
│   ├── generate_entity_content.py # AI-Content
│   └── shared.py            #   DB-Verbindungen, Helpers
├── supabase/migrations/     # SQL-Migrationen
├── nginx/                   # Reverse-Proxy-Konfiguration
├── docs/                    # Weitere Dokumentation
├── deploy.sh                # Automatisiertes Deployment
├── CLAUDE.md                # Technische Detaildokumentation
└── KONZEPT.md               # Geschäftskonzept
```

---

## 8. Deployment & Betrieb

### Server
- **VPS:** Hostinger (72.62.148.205), Ubuntu 24.04 LTS
- **Process Manager:** PM2 (3 Prozesse: Backend, Storefront, Clickdummy)
- **Webserver:** Nginx mit SSL (Let's Encrypt)

### Automatisierte Prozesse (Cronjobs)
| Zeitpunkt | Skript | Aufgabe |
|-----------|--------|---------|
| Täglich 04:00 UTC | `legacy_sync.py` | MySQL → Supabase Sync |
| Mo–Fr 02:00 UTC | `discogs_daily_sync.py` | Discogs-Preisupdate (5 Chunks) |

### Deployment-Ablauf
1. Code via Git auf VPS pushen
2. `deploy.sh` ausführen (Build + PM2 Restart + Nginx Reload)
3. SSL-Zertifikate werden automatisch erneuert

---

## 9. Projektstatus

**Phase:** Pre-Launch (Phase 1 zu 95 % abgeschlossen)

### Erledigt
- Vollständige Auktions- und Direktkauf-Funktionalität
- Versandkonfiguration (3 Zonen, 13 Artikeltypen, Carrier-Management)
- Zahlungsabwicklung (Stripe Live)
- 6 Transaktions-E-Mail-Templates
- Newsletter + CRM (3.580 Kontakte importiert)
- SEO Entity Pages mit AI-Content
- Rechtliche Seiten (Impressum, AGB, Datenschutz, Widerruf, Cookies)
- Discogs-Integration (täglicher Preisabgleich)
- Pre-Launch-Passwortschutz

### Ausstehend
- **RSE-77:** Testlauf mit 1 Block (10–20 Produkte)
- **RSE-78:** Launch (wartet auf AGB-Prüfung durch E-Commerce-Anwalt)

---

## 10. Design & Branding

- **Theme:** "Vinyl Culture" — warmes Dunkelbraun (#1c1915) mit Gold-Akzenten (#d4a54a)
- **Typografie:** DM Serif Display (Headlines) + DM Sans (Body)
- **Besonderheit:** "Vinyl Groove"-Effekt auf Produktdetailseiten
- **Responsive:** Mobile-first Design

---

## 11. Kontakt

**Betreiber:** Robin Seckler
**E-Mail:** rseckler@gmail.com
**GitHub:** github.com/rseckler
