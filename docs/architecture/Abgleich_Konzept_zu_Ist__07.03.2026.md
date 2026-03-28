# Abgleich: KONZEPT.md vs. Umsetzung

**Stand:** 2026-03-07
**Projekt:** VOD Auctions Platform

---

## Umgesetzt (gemäß Konzept)

| Konzept-Bereich | Status |
|---|---|
| **Block-Modell (3A)** — Kuratierte Themen-Blöcke, Lebenszyklus (Draft→Scheduled→Active→Ended) | Vollständig |
| **Datenbank-Erweiterung (4.2)** — auction_blocks, block_items, bids, transactions, Release-Erweiterung | Vollständig |
| **Shared Supabase DB (4.1A)** — Gleiche DB wie tape-mag-mvp | Vollständig |
| **Data Migration (4.4)** — ~41.500 Releases migriert (mehr als die geplanten 30k) | Übertroffen |
| **Bidding-Engine (4.3.1–4.3.3)** — Proxy Bidding, Auto-Extension, Realtime via Supabase | Vollständig |
| **Stripe Payment (4.3.4)** — Checkout, Webhook, Transactions | Vollständig |
| **Admin Panel (4.5)** — Block-Erstellung, Produkt-Browser, Startpreis-Review, Media Management | Vollständig |
| **Redaktioneller Content pro Block (3A.5)** — Titel, Beschreibung, Rich Text, Headerbild | Teilweise (s.u.) |
| **Produkt-Reservierung (3A.6)** — available → reserved → in_auction → sold/unsold | Vollständig |
| **Legal/Compliance (5)** — Impressum, AGB, Datenschutz, Widerruf, Cookies | 5 Seiten |
| **Domain vod-auctions.com** | Live |
| **Versandkosten** | Gewichtsbasiert, besser als Konzept (dort nur erwähnt, nicht detailliert) |

---

## Über das Konzept hinaus umgesetzt (nicht im Konzept)

| Feature | Details |
|---|---|
| **Literature-Migration (RSE-109)** | 11.370 zusätzliche Artikel (Band/Label/Press Literature) — Konzept sprach nur von ~30k Releases |
| **5-Kategorie-Filter** | Tapes, Vinyl, Artists/Bands Lit, Labels Lit, Press/Org Lit |
| **Direktkauf / Warenkorb (RSE-111)** | Hybrid-Modell: Auktions-Gewinner können auch direkt kaufen — Konzept erwähnte "Buy It Now" nur als Auktionsoption, nicht als separates Cart-System |
| **Discogs-Preisintegration** | Low/Median/High Preise, Batch-Scripts, Cronjobs — Konzept nannte es nur als "Anreicherung" |
| **Artikelnummern (VOD-XXXXX)** | Nicht im Konzept |
| **CMS Content Management (RSE-117)** | Admin-Editor für Homepage/About/Auctions Content |
| **Clickdummy** | 18-Screen Prototyp mit FlowGuide — nicht im Konzept |
| **Cookie Consent + GA4** | Detaillierter als im Konzept |
| **Sentry Error Tracking** | Nicht im Konzept |
| **Transaktionale Emails (6 Templates)** | Im Konzept nur "Email Notifications" erwähnt |
| **Sync Dashboard** | Admin-Dashboard für Legacy + Discogs Sync-Status |
| **SEO (Sitemap, OG Images, Meta Tags)** | Nur am Rande im Konzept |
| **Inventory-Verwaltung** | Nicht im Konzept |
| **Catalog Visibility Toggle** | Admin-Steuerung der Sichtbarkeit |
| **Credits/Tracklist Parsing** | Aufwändige Datenbereinigung, nicht geplant |

---

## Noch NICHT umgesetzt (im Konzept beschrieben)

### Auktionsformate (Kap. 3.2)

| Feature | Konzept | Status |
|---|---|---|
| **B) Private Auktion** — Gebotshöhe unsichtbar, nur "X Gebote" | Beschrieben | Fehlt |
| **C) Reverse Auction** — Preis sinkt täglich | Beschrieben | Fehlt |
| **D) Buy It Now + Auktion (Hybrid)** — Sofortkauf parallel zur Auktion | Beschrieben | Teilweise (Direktkauf existiert, aber nicht als parallele Option im Auktions-Item) |
| **Reserve Price** — Geheimer Mindestpreis | Im Schema vorhanden (`reserve_price`) | Kein UI/Logik |
| **Gestaffeltes Ende** — Lots enden im 2-Min-Takt | Im Schema vorhanden (`staggered_ending`, `stagger_interval_seconds`) | Keine Implementierung |

### Community & Engagement (Kap. 3.4)

| Feature | Status |
|---|---|
| **Newsletter** — wöchentlich/monatlich, Early Access | Fehlt |
| **Collector Profiles** — Öffentliche Sammler-Profile, Leaderboard | Fehlt |
| **Content Marketing** — Blog, Videos, Podcast | Fehlt |
| **"Erinnerung setzen"** — Notification bei Block-Start | Fehlt |

### Auktionskalender (Kap. 3A.8)

| Feature | Status |
|---|---|
| **Monatsansicht-Kalender** | Fehlt (nur Filter-Ansicht: All/Running/Upcoming/Ended) |
| **iCal-Export** | Fehlt |
| **Newsletter-Abo für neue Blocks** | Fehlt |

### Redaktioneller Content (Kap. 3A.5)

| Feature | Status |
|---|---|
| **Bildergalerie im Block** | Schema hat `gallery_images`, kein Upload-UI |
| **Video-Embed (YouTube/Vimeo)** | Schema hat `video_url`, kein Frontend-Rendering |
| **Audio-Samples / Playlist** | Schema hat `audio_url`, kein Player |
| **Tags für Block-Filterung** | Schema hat `tags[]`, nicht in UI |

### Admin-Features (Kap. 4.5)

| Feature | Status |
|---|---|
| **Bulk-Upload via CSV** | Fehlt |
| **Item-Fotografie-Workflow** | Fehlt |
| **Reporting Dashboard** (Revenue, Conversion, Top Items) | Fehlt |
| **Gebots-Monitoring Live-Dashboard** | Fehlt |
| **Bulk-Aktionen** für Startpreise ("Alle auf 1€") | Fehlt (RSE-99 offen) |

### Technisch (Kap. 4.3)

| Feature | Konzept | Status |
|---|---|---|
| **Redis Bid-Cache** | Hybrid Redis + PostgreSQL für Sub-second Latency | Redis-URL konfiguriert, aber Bidding läuft direkt über PostgreSQL |
| **Escrow / Manual Capture** | `capture_method: 'manual'` | Stripe Checkout Session statt Payment Intent mit Manual Capture |
| **Mindestgeboterhöhung** | "5-10% des aktuellen Gebots" | Unklar ob implementiert |

### Phase 3-5 Features

| Feature | Status |
|---|---|
| **AI-Preisempfehlungen** | Phase 5 |
| **Watchlist & Saved Searches** | Phase 3 |
| **Forum/Discord** | Phase 3 |
| **Mobile App / PWA** | Phase 5 |
| **Internationalisierung (EN/DE/JP)** | Nur Englisch |
| **Best Offers System** | Phase 3 |

---

## Abweichungen vom Konzept

| Bereich | Konzept | Umsetzung |
|---|---|---|
| **Tech Stack** | Next.js 15 | Next.js 16 |
| **Commerce-Engine** | Im Konzept: Medusa.js + Next.js | Tatsächlich: Medusa.js als Backend (Port 9000), separates Next.js Storefront |
| **Admin Panel** | "React Admin oder Refine.dev" | Medusa Admin UI Extensions (custom routes) |
| **Email** | "Sendgrid" | Resend |
| **Versand** | "Shippo (Versandlabels)" | Eigene Gewichts-Berechnung, kein Label-Service |
| **Hosting** | "Vercel Free + Supabase Free" | VPS (Hostinger) + PM2 + nginx |
| **Supabase-Projekt** | `ouunftsxmuqgfqsoqnxq` (West EU) | `bofblwqieuvmqybzxapx` (eu-central-1, Frankfurt) |
| **User-System** | Eigene `users`-Tabelle (Konzept) | Medusa Customer Auth (`auction_users` Tabelle) |
| **Sprache** | Implizit Deutsch im Konzept | Englisch (seit 2026-03-03) |
| **Produktsegmentierung** | 3 Tiers (Premium >100€, Standard 20-100€, Festpreis <20€) | Kein Tier-System, stattdessen flexibles `sale_mode` |

---

## Zusammenfassung

**Phase 1 ist zu ~90% umgesetzt** — die Kern-Features (Block-Modell, Bidding, Payment, Admin, Legal, Deployment) stehen. Was fehlt, sind vor allem die **erweiterten Auktionsformate** (Private, Reverse, Reserve Price) und die **Community/Marketing-Features** (Newsletter, Collector Profiles, Kalender). Der nächste Schritt lt. Tracking ist RSE-77 (Testlauf mit echtem Block), danach Phase 2 (erste öffentliche Auktionen + Marketing).
