# CRM & Customer Management — Analyse, Marktvergleich & Konzept

**Datum:** 2026-03-30
**Status:** Freigabe ausstehend
**Betrifft:** Admin CRM (`/app/customers`), Storefront Account, Backend APIs, Event-Infrastruktur

---

## 1. IST-ZUSTAND — Was existiert

### 1.1 Überblick

Das System hat **drei getrennte Datenschichten** für Kundendaten — ohne einheitlichen Zugriff:

```
Medusa DB (lokal)          Brevo (extern)             Lokale Auction-Tabellen
─────────────────          ──────────────             ──────────────────────
customer                   Kontakt-Attribute           transaction
  - id, email              - TOTAL_SPENT               bid
  - first_name             - TOTAL_PURCHASES            cart_item
  - last_name              - TOTAL_BIDS_PLACED          saved_item
  - phone                  - TOTAL_AUCTIONS_WON         order_event
  - email_verified         - CUSTOMER_SEGMENT
customer_address           - NEWSLETTER_OPTIN
customer_verification      - LAST_BID_DATE
                           - REGISTRATION_DATE
```

**Problem:** Kein einheitlicher Kundenüberblick möglich ohne gleichzeitig Brevo API + lokale DB abzufragen. Aggregate-only CRM Dashboard.

### 1.2 Aktueller Admin-Bereich `/app/customers`

Die Seite (`admin/routes/customers/page.tsx`) ist ein **reines Analytics-Dashboard**:
- 5 KPI-Cards (Aggregate-Zahlen aus Brevo + Medusa Count)
- Segment-Balkendiagramm (aus Brevo-Attributen)
- Top 10 Kunden nach Ausgaben (aus Brevo)
- Recent Contacts (aus Brevo)
- Campaign Performance (aus Brevo)

**Es gibt keine Kundenliste, keinen Suchinput, keinen Klick auf einzelne Kunden.**

### 1.3 Bestätigter Bug: "Create Customer" ohne CRM-Sync

Der native Medusa-Admin hat einen "Create Customer"-Button (Medusa-UI-Standard).

**Was passiert:**
1. Medusa erstellt Datensatz in `customer`-Tabelle ✓
2. `crmSyncRegistration()` wird **NICHT** aufgerufen ✗

**Grund:** `crmSyncRegistration()` liegt nur in `/store/account/send-welcome/route.ts` — ausschließlich für den Storefront-Registrierungsflow. Admin-seitig erstellte Kunden landen **nie in Brevo**.

→ **Alle manuell im Admin angelegten Kunden fehlen im CRM/Newsletter/Segmentierung.**

### 1.4 Storefront Account-Seiten (funktionieren korrekt)

| Seite | Inhalt |
|-------|--------|
| `/account` | Dashboard (Active Bids, Won, Orders, Cart, Saved) |
| `/account/settings` | Profil, Passwort, Newsletter, Notification Prefs |
| `/account/orders` | Order History (grupiert nach order_group_id) |
| `/account/addresses` | Lieferadressen CRUD |
| `/account/bids` | Aktive/vergangene Gebote |
| `/account/wins` | Gewonnene Auktionen |
| `/account/saved` | Merkliste |

**Fehlt:** DSGVO Daten-Export, Account-Löschantrag.

### 1.5 CRM-Sync Coverage (crm-sync.ts)

| Event | Brevo-Update | Vollständig? |
|-------|--------------|--------------|
| Storefront-Registrierung | Name, E-Mail, Segment="registered" | ✓ |
| Gebot abgegeben | total_bids++, last_bid_date, Segment="bidder" | ✓ |
| Auktion gewonnen | total_wins++, Segment="buyer" | ✓ |
| Zahlung abgeschlossen | total_spent, total_purchases++, Adresse | ✓ |
| Versand | last_shipment_date, last_delivery_date | ✓ |
| **Admin erstellt Kunden** | **Kein Sync** | ✗ BUG |
| Direktkauf | Sync korrekt? (via payment-webhook) | Nicht verifiziert |

---

## 2. MARKTVERGLEICH

### 2.1 Feature-Matrix

| Feature | eBay Seller Hub | Catawiki | Discogs Marketplace | Shopify Admin | VOD_Auctions (Ist) |
|---------|:-:|:-:|:-:|:-:|:-:|
| **Kundenliste mit Suche** | ✓ | ✓ | ✓ | ✓ | ✗ |
| **Customer Detail Page** | ✓ | Teilweise | ✓ | ✓ | ✗ |
| Order History per Kunde | ✓ | ✓ | ✓ | ✓ | Nur via Transactions |
| Lifetime Value (LTV) anzeigen | Teilweise | ✗ | ✗ | ✓ | Nur in Brevo Aggregate |
| Admin-seitige Notizen | ✓ | ✗ | ✗ | ✓ | ✗ |
| Kundentags / Segmentierung (manuell) | ✗ | ✗ | ✗ | ✓ | ✗ |
| Auto-Segmentierung (LTV-basiert) | ✗ | ✗ | ✗ | ✓ | Via Brevo (limited) |
| Kommunikationshistorie | ✓ | ✓ | ✗ | ✓ | ✗ |
| DSGVO Daten-Export (Storefront) | ✓ | ✓ | ✓ | ✓ | ✗ |
| Admin DSGVO-Löschanfrage | ✓ | ✓ | ✓ | ✓ | ✗ |
| CSV-Export Kundenliste | ✓ | ✗ | ✓ | ✓ | ✗ |
| Activity Timeline | ✓ | ✓ | ✗ | ✓ | ✗ |
| Bid-/Auktionshistorie pro Kunde | ✓ | ✓ | n/a | n/a | Nur via Transactions-Suche |
| Newsletter-Status im Admin | ✓ | ✓ | ✓ | ✓ | Nur in Brevo Dashboard |

### 2.2 Kernerkenntnisse aus dem Marktvergleich

**Shopify** ist der relevanteste Vergleich für den Admin-Bereich. Shopify Customers bietet:
- Durchsuchbare Kundenliste mit Filter (Spend, Orders, Region, Tags)
- 360°-Customer-Card: Kontakt + LTV + All Orders + Notes + Segment Tags
- Direkter "Send Email" Button
- "Edit" für manuelle Korrekturen (Name, E-Mail, Phone, Address)

**Catawiki** (direkter Konkurrent, kuratierte Auktionen):
- Vereinfachtes Buyer-Profil pro Order (Name, Adresse, Bid-Anzahl)
- Keine detaillierte CRM-Ansicht — als kleiner Anbieter benötigen wir mehr

**Fazit:** Als eigene Plattform ohne 8-13% Marketplace-Gebühren haben wir vollständige Kontrolle — und damit auch volle Verantwortung für das Customer Management. Ziel: mindestens Shopify-Niveau.

---

## 3. CRM-STRATEGIE & TOOL-ENTSCHEIDUNGEN

### 3.1 Warum kein klassisches CRM (HubSpot, Salesforce)

Klassische CRM-Systeme (HubSpot, Salesforce, Pipedrive) sind für **B2B-Sales-Pipelines** gebaut: Leads, Deals, Angebote, Vertriebsteams. Für VOD Auctions (B2C-Auktionsplattform) sind sie:
- Fehlpassend (falsche Konzepte: "Deals" statt "Orders", "Leads" statt "Bidders")
- Overkill und zu teuer
- Schwer mit Medusa/Next.js zu integrieren

### 3.2 Warum Brevo bleibt (und was es nicht kann)

**Brevo bleibt** als E-Mail-Marketing-Tool für:
- Transaktionale E-Mails (Outbid, Won, Shipping)
- Newsletter-Kampagnen
- Segment-Automationen
- E-Mail-Öffnungsraten / Klick-Tracking

**Was Brevo nicht kann:**
- Als Admin-Panel-Datenquelle für Kundenlisten (zu langsam, externe API, paginiert)
- Lokale SQL-Queries ("Alle Käufer aus DE mit Ausgaben > €100")
- Garantierte Verfügbarkeit für kritische Admin-Operationen
- Browser-Event-Tracking (Seiten-Views, Bid-Interaktionen)

**Zukunft:** Mautic (Open Source Marketing Automation) als möglicher Brevo-Nachfolger für komplexe B2C-Campaign-Journeys — aber erst nach dem Launch, wenn tatsächliche Segmentierungsdaten vorhanden sind.

### 3.3 Rudderstack als Event-Infrastruktur (neu)

**Rudderstack** ist ein **Open-Source Customer Data Platform (CDP)** — kein Tool das Endnutzer direkt sehen, sondern eine Infrastruktur-Schicht die Events von allen Sources sammelt und an alle Destinations weiterleitet.

Erfahrung aus Sport1.de-Projekt zeigt: Rudderstack löst das "N×M Integrations-Problem" elegant.

**Kosten: €0** — Open Source, self-hosted auf VPS (bereits bezahlt). Rudderstack stellt das Control-Plane-Dashboard kostenlos zur Verfügung für self-hosted Data Planes.

#### Aktuelles Problem (ohne Rudderstack):

```
stripe-webhook.ts    → crmSyncPaymentCompleted() → Brevo (direkt verdrahtet)
bid/route.ts         → crmSyncBidPlaced()         → Brevo (direkt verdrahtet)
send-welcome/route.ts → crmSyncRegistration()     → Brevo (direkt verdrahtet)
                                                     ↑ nur Storefront, nicht Admin!
Storefront Browser   → kein Tracking
```

**crm-sync.ts** hat 5 Custom-Funktionen die direkt aus verschiedenen Routes aufgerufen werden. Jede neue Destination (Analytics, Mautic, etc.) erfordert Code-Änderungen.

#### Zielzustand (mit Rudderstack):

```
VOD Auctions Backend (Node.js SDK)
  stripe-webhook.ts  → rudder.track("Payment Completed", {...})
  bid/route.ts       → rudder.track("Bid Placed", {...})
  customer-created   → rudder.track("Customer Registered", {...})
  ...
                              │
                              ▼
VOD Auctions Storefront (Browser JS SDK)
  Seiten-Views       → rudder.page("Auction Detail", {...})
  Bid-Interaktion    → rudder.track("Bid Submitted", {...})
  Item gespeichert   → rudder.track("Item Saved", {...})
                              │
                              ▼
                    ┌─────────────────────┐
                    │   Rudderstack        │
                    │   (VPS, Docker)      │
                    │   Event Router       │
                    └──────┬──────┬───────┘
                           │      │       \
                           ▼      ▼        ▼
                        Brevo  PostHog  Supabase      (später: Mautic)
                      (Email) (Analytics) (Warehouse)
```

**Vorteile:**
- `crm-sync.ts` wird zum reinen Brevo-Destination-Handler (kein direkter Aufruf mehr aus Routes)
- Browser-Events erstmals tracked → Funnel-Analyse möglich
- Neue Destination hinzufügen = 1 Eintrag im Rudderstack Dashboard, 0 Code-Änderungen
- Event-History lokal gespeichert (Supabase als Warehouse)
- Vorbereitung für Mautic-Migration ohne Code-Refactoring

#### Rudderstack Event-Übersicht:

| Event | Source | Destinations |
|-------|--------|--------------|
| `Customer Registered` | Backend | Brevo (Kontakt anlegen), customer_stats (erstellen) |
| `Bid Placed` | Backend | Brevo (Stats), customer_stats (update) |
| `Auction Won` | Backend | Brevo (Segment→buyer) |
| `Payment Completed` | Backend | Brevo (LTV), customer_stats (total_spent) |
| `Order Shipped` | Backend | Brevo (Shipment-Datum) |
| `Page Viewed` | Browser | PostHog, Analytics |
| `Bid Submitted` | Browser | PostHog (Funnel-Tracking) |
| `Item Saved` | Browser | PostHog |
| `Checkout Started` | Browser | PostHog (Abbruch-Rate) |
| `Checkout Completed` | Browser | PostHog (Conversion) |

---

## 4. ARCHITEKTUR-ENTSCHEIDUNG: Local customer_stats

### Problem

Aktuell liegen alle Customer-KPIs (total_spent, bid_count, etc.) **nur in Brevo**:
- Admin-Dashboard abhängig von Brevo-API-Verfügbarkeit
- Keine lokalen SQL-Queries möglich (z.B. "Kunden mit Ausgaben > €500")
- Stats nicht retroaktiv neu berechenbar
- Ohne Brevo-Key: kein Kundenzugriff im Admin

### Entscheidung: Lokale customer_stats + Brevo als Marketing-Spiegel

```
Lokale DB (primär für Admin-Queries)    Brevo (primär für Marketing)
─────────────────────────────────────   ────────────────────────────
customer_stats (neue Tabelle):          Newsletter Opt-in
  - customer_id (FK)                    Email Campaigns
  - total_spent                         Segment-Automationen
  - total_purchases                     Email-Öffnungs-/Klickraten
  - total_bids
  - total_wins
  - last_purchase_at
  - last_bid_at
  - first_purchase_at
  - tags (TEXT[])
  - is_vip, is_dormant (computed flags)
  - updated_at
```

**Update-Strategie:**
- Stats werden via Rudderstack-Events aktualisiert (bei bid, payment, etc.)
- Täglicher Kalibrierungs-Cron (02:30 UTC): Rekalibrierung aus Roh-Tabellen als Fallback
- Brevo erhält weiterhin Sync-Updates (bleibt Marketing-System)

---

## 5. KONZEPT: ZIELZUSTAND

### 5.1 Admin: Customers Hub (`/app/customers`)

**Tab-Layout:**

#### Tab 1: "Customers" — Kundenliste
```
┌─────────────────────────────────────────────────────────────┐
│ Customers                              [Export CSV] [+ Add]  │
├──────────────────────────────────────────────────────────── │
│ 🔍 Search name / email   │ Segment ▼ │ Country ▼ │ Since ▼  │
├──────────────────────────────────────────────────────────── │
│ Name          Email              Segment  Orders  Spent  ▼  │
│ ─────────────────────────────────────────────────────────── │
│ Max Mustermann  max@test.de      buyer      3     €147      │
│ Jane Doe        jane@doe.com     bidder     0     —         │
│ ...                                [< Prev]  1/5  [Next >]  │
└─────────────────────────────────────────────────────────────┘
```

- Suche: Name, E-Mail, Order-Nummer
- Filter: Segment, Country, Joined Since
- Sort: Name, Joined, Spent (desc default), Orders
- Pagination: 25/50/100
- Klick auf Zeile → Customer Detail Drawer

#### Tab 2: "CRM Dashboard" — Bisherige Brevo-Aggregat-Ansicht (unverändert)

### 5.2 Customer Detail Drawer

```
┌───────────────────────────────────────────────────────┐
│ ← Back    Max Mustermann                    [Edit]     │
├───────────────────────────────────────────────────────┤
│ max@test.de  +49 170...  📍 Berlin, DE   Joined 2026  │
│ Tags: [buyer] [VIP] [newsletter ✓]        [Edit Tags] │
├───────────────────────────────────────────────────────┤
│ STATS                                                  │
│ €147  Spent    3  Orders    12  Bids    2  Wins        │
├───────────────────────────────────────────────────────┤
│ ORDERS (3)                                             │
│ VOD-ORD-000023  €49  Paid  Shipped     2026-03-15 →   │
│ VOD-ORD-000019  €72  Paid  Delivered   2026-03-10 →   │
├───────────────────────────────────────────────────────┤
│ ADDRESSES                                              │
│ Max Mustermann, Hauptstr. 1, 10115 Berlin, DE          │
├───────────────────────────────────────────────────────┤
│ NOTES (Admin-intern, P2)                               │
│ [+ Notiz hinzufügen]                                   │
│ 2026-03-20 frank: "Anfrage zu Rechnung, geklärt"      │
└───────────────────────────────────────────────────────┘
```

### 5.3 Customer Tags / Segmentierung

- `buyer` — mindestens 1 bezahlte Order (auto)
- `bidder` — mindestens 1 Gebot, noch kein Kauf (auto)
- `vip` — manuell ODER auto wenn total_spent > €500
- `problem` — intern, für Dispute/Chargeback
- `inactive` — auto nach 90 Tagen ohne Event
- `newsletter` — spiegelt Brevo-Optin

### 5.4 DSGVO / GDPR

- **Storefront:** "Download my data" in `/account/settings` → `GET /store/account/gdpr-export` (JSON)
- **Admin:** "Anonymize" Action → ersetzt PII durch Hash, behält Transaktionsdaten für Buchhaltung

### 5.5 Bug-Fix: Create Customer → Brevo Sync

Medusa `customer.created` Subscriber:
```typescript
// backend/src/subscribers/customer-created.ts
// Lauscht auf customer.created → crmSyncRegistration() + customer_stats erstellen
// Gilt für ALLE Wege: Storefront, Admin, API
```

---

## 6. GESAMTARCHITEKTUR (Zielzustand)

```
┌────────────────────────────────────────────────────────────────┐
│                        VOD AUCTIONS                             │
│                                                                  │
│  Storefront (Next.js)          Backend (Medusa + Knex)          │
│  ─────────────────             ───────────────────────          │
│  rudder-sdk-js (Browser)       @rudderstack/rudder-sdk-node     │
│    Page Views                    Customer Registered            │
│    Bid Submitted                 Bid Placed / Won               │
│    Checkout Funnel               Payment Completed              │
│    Item Saved                    Order Shipped                  │
└──────────────┬─────────────────────────────┬───────────────────┘
               │                             │
               └─────────────┬───────────────┘
                             │ Events (standardisiert)
                             ▼
               ┌─────────────────────────┐
               │      Rudderstack         │  ← VPS, Docker, €0
               │  (Event Router / CDP)    │    Control Plane: Rudderstack Cloud (free)
               └────┬──────┬──────┬──────┘
                    │      │      │
          ┌─────────┘      │      └──────────────┐
          ▼                ▼                      ▼
       Brevo           PostHog              Supabase
  (E-Mail/Marketing) (Analytics)         (Event Warehouse)
  Newsletter         Funnels             Alle Events lokal
  Campaigns          Session Rec.        SQL-auswertbar
  Segment-Sync       User Profiles
                         │
                    (später: Mautic)
                    Visual Journeys

               ┌─────────────────────────┐
               │   Lokale DB (Medusa)     │
               │   customer_stats         │  ← Materialisierte KPIs
               │   customer_note (P2)     │     für Admin-Panel
               └─────────────────────────┘
                             │
                             ▼
               ┌─────────────────────────┐
               │   Admin Panel            │
               │   /app/customers         │
               │   ─────────────────      │
               │   Tab: Kundenliste        │
               │   Tab: CRM Dashboard     │
               │   Customer Detail Drawer │
               └─────────────────────────┘
```

---

## 7. UMSETZUNGSPLAN

### Phase P1 — Admin-Panel (vor RSE-77 Testlauf)

**Ziel:** Professionelles Minimum — Kundenliste + Detail + Bug-Fix + DSGVO

| # | Task | Typ | Aufwand |
|---|------|-----|---------|
| P1-1 | DB Migration: `customer_stats` Tabelle + Indizes | Migration | S |
| P1-2 | Backfill-Script: `customer_stats` aus transactions/bids befüllen | Script | S |
| P1-3 | Stats-Update in Stripe/PayPal Webhook-Handlern | Backend | S |
| P1-4 | Täglicher Kalibrierungs-Cron (02:30 UTC) | Backend | XS |
| P1-5 | API `GET /admin/customers/list` (search, filter, sort, pagination) | API | M |
| P1-6 | API `GET /admin/customers/:id` (Profil + Stats + Orders + Addresses) | API | M |
| P1-7 | Admin UI: Two-Tab-Layout (Kundenliste + CRM Dashboard) | UI | M |
| P1-8 | Admin UI: `CustomerDetailDrawer.tsx` (Slide-in Panel) | UI | M |
| P1-9 | Bug-Fix: `customer-created` Subscriber → Brevo-Sync + customer_stats | Backend | S |
| P1-10 | API `GET /store/account/gdpr-export` | API | M |
| P1-11 | Storefront: "Download my data" Button in Account Settings | Frontend | S |

**Aufwand P1: ~4-6 Stunden**

---

### Phase P1.5 — Rudderstack Integration

**Ziel:** Event-Infrastruktur aufbauen, crm-sync.ts entkoppeln, Browser-Tracking aktivieren

| # | Task | Typ | Aufwand |
|---|------|-----|---------|
| R1 | Rudderstack Data Plane via Docker auf VPS deployen | DevOps | 1-2h |
| R2 | `backend/src/lib/rudderstack.ts` Helper (Node.js SDK) | Backend | 1h |
| R3 | Bestehende crm-sync.ts Calls auf rudder.track() umstellen | Backend | 2h |
| R4 | Storefront: rudder-sdk-js einbauen (Page + Track Events) | Frontend | 2h |
| R5 | Brevo als Rudderstack-Destination konfigurieren | Config | 1h |
| R6 | PostHog als Destination hinzufügen (optional, 30 Min) | Config | XS |

**Aufwand P1.5: ~7-8 Stunden**

---

### Phase P2 — Post-Launch Quality

**Ziel:** Shopify-Niveau — Notizen, Tags, Aktivitätslog, Export

| # | Task | Typ | Aufwand |
|---|------|-----|---------|
| P2-1 | DB Migration: `customer_note` Tabelle | Migration | XS |
| P2-2 | API `GET/POST/DELETE /admin/customers/:id/notes` | API | S |
| P2-3 | UI: Notes-Sektion in Customer Detail Drawer | UI | S |
| P2-4 | API `PATCH /admin/customers/:id/tags` | API | XS |
| P2-5 | UI: Tag-Badges + Tag-Filter in Kundenliste | UI | S |
| P2-6 | API `GET /admin/customers/:id/activity` (Bids + Orders + Events) | API | M |
| P2-7 | UI: Activity Timeline in Customer Detail Drawer | UI | S |
| P2-8 | API `GET /admin/customers/export` → CSV | API | S |
| P2-9 | Admin: "Anonymize" Action (DSGVO-Löschanfrage) | Backend+UI | M |

**Aufwand P2: ~3-4 Stunden**

---

### Phase P3 — Growth Features (nach RSE-79/RSE-80)

| # | Task | Typ |
|---|------|-----|
| P3-1 | Auto-VIP: Cron wenn total_spent > €500 | Backend |
| P3-2 | Auto-Dormant: 90 Tage Inaktivität + Brevo-Sync | Backend |
| P3-3 | Brevo Kampagnen-Trigger für Dormant-Segment | Backend |
| P3-4 | RFM-Score Berechnung + Dashboard-Widget | Backend+UI |
| P3-5 | Kommunikationshistorie (Brevo Webhook → customer_email_log) | Backend+UI |
| P3-6 | Öffentliches Feedback-System mit Admin-Moderation | Backend+UI |
| P3-7 | Mautic einbinden als Rudderstack-Destination (Visual Journeys) | DevOps+Config |

---

## 8. TO-DO LISTE

### P1 — Sofort

- [ ] **P1-1** DB Migration: `customer_stats` Tabelle
  ```sql
  CREATE TABLE customer_stats (
    id TEXT PRIMARY KEY,
    customer_id TEXT UNIQUE NOT NULL REFERENCES customer(id),
    total_spent DECIMAL(10,2) DEFAULT 0,
    total_purchases INTEGER DEFAULT 0,
    total_bids INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    last_purchase_at TIMESTAMP,
    last_bid_at TIMESTAMP,
    first_purchase_at TIMESTAMP,
    tags TEXT[] DEFAULT '{}',
    is_vip BOOLEAN DEFAULT FALSE,
    is_dormant BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX idx_customer_stats_customer_id ON customer_stats(customer_id);
  CREATE INDEX idx_customer_stats_total_spent ON customer_stats(total_spent DESC);
  ```
- [ ] **P1-2** `scripts/backfill_customer_stats.py` — Initial-Befüllung aus `transaction` + `bid`
- [ ] **P1-3** `stripe.ts` + `paypal.ts`: `customer_stats` upsert nach Payment-Success
- [ ] **P1-4** Cron-Job `customer-stats-recalc.ts` (02:30 UTC, tgl.)
- [ ] **P1-5** `GET /admin/customers/list` — Search, Filter, Sort, Pagination
- [ ] **P1-6** `GET /admin/customers/:id` — Profil + Stats + Orders + Addresses
- [ ] **P1-7** Admin UI: Two-Tab-Layout in `customers/page.tsx`
- [ ] **P1-8** Admin UI: `CustomerDetailDrawer.tsx` (Slide-in Panel)
- [ ] **P1-9** `subscribers/customer-created.ts` → crmSyncRegistration + customer_stats row
- [ ] **P1-10** `GET /store/account/gdpr-export` (JSON, auth required)
- [ ] **P1-11** Storefront: "Download my data" Button in `/account/settings`

### P1.5 — Rudderstack

- [ ] **R1** Rudderstack Docker Compose auf VPS (rudder-server Image)
- [ ] **R2** `backend/src/lib/rudderstack.ts` — SDK Wrapper
- [ ] **R3** crm-sync.ts Calls → rudder.track() umstellen (alle 5 Funktionen)
- [ ] **R4** Storefront: `rudder-sdk-js` einbinden (Layout + Key Events)
- [ ] **R5** Brevo Destination in Rudderstack Dashboard konfigurieren
- [ ] **R6** PostHog Destination (optional)

### P2 — Nach Launch

- [ ] **P2-1** DB Migration: `customer_note` Tabelle
- [ ] **P2-2** API `GET/POST/DELETE /admin/customers/:id/notes`
- [ ] **P2-3** UI: Notes-Sektion in Drawer
- [ ] **P2-4** API `PATCH /admin/customers/:id/tags`
- [ ] **P2-5** UI: Tag-Badges + Filter
- [ ] **P2-6** API `GET /admin/customers/:id/activity`
- [ ] **P2-7** UI: Activity Timeline
- [ ] **P2-8** API `GET /admin/customers/export` → CSV
- [ ] **P2-9** Admin: "Anonymize" Action

### P3 — Wachstumsphase

- [ ] **P3-1..7** Siehe Phase P3 oben

---

## 9. OFFENE FRAGEN

1. **Medusa `customer.created` Event** — Verifizieren ob Event in Medusa 2.x für Core-Tables publisht wird, oder ob ein Custom Workflow-Hook nötig ist.
2. **GDPR Export Format** — JSON für P1 ausreichend? ZIP mit CSV-Files für P2?
3. **Rudderstack VPS-Ressourcen** — Rudderstack braucht ~512MB RAM. VPS-Kapazität prüfen.
4. **PostHog** — Self-hosted (free, aber RAM-intensiv) oder PostHog Cloud (free bis 1M Events/Monat)?

---

## 10. ABHÄNGIGKEITEN

- P1-3 benötigt P1-1 (Migration zuerst)
- P1-5/P1-6 benötigen P1-1 (Stats-Tabelle als Datenquelle)
- P1-8 benötigt P1-5/P1-6 (API vor UI)
- P1.5/R3 kann parallel zu P1 laufen, aber P1-9 (Subscriber) sollte zuerst kommen
- P2-Notizen benötigen P2-1 (Migration)
- P3-7 (Mautic) benötigt P1.5 (Rudderstack läuft)

---

*Autor: Robin Seckler / Claude Code — 2026-03-30*
*Freigabe durch: Robin Seckler*
