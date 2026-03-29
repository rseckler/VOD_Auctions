# VOD-Auctions CRM System

**Erstellt:** 2026-03-30
**Status:** Produktiv (P1 implementiert)
**Autor:** Robin Seckler

---

## 1. System-Überblick

Das CRM-System von VOD-Auctions besteht aus drei Schichten, die zusammenspielen:

```
┌─────────────────────────────────────────────────────────────┐
│                    DATENSCHICHTEN                           │
├──────────────────┬──────────────────┬───────────────────────┤
│  Medusa DB       │  customer_stats  │  Brevo (extern)       │
│  (primär)        │  (lokal, fast)   │  (Newsletter / CRM)   │
│                  │                  │                       │
│  customer        │  total_spent     │  TOTAL_SPENT          │
│  - id            │  total_purchases │  TOTAL_PURCHASES      │
│  - email         │  total_bids      │  TOTAL_BIDS_PLACED    │
│  - first_name    │  total_wins      │  TOTAL_AUCTIONS_WON   │
│  - last_name     │  is_vip          │  CUSTOMER_SEGMENT     │
│  - phone         │  is_dormant      │  NEWSLETTER_OPTIN     │
│                  │  tags            │  REGISTRATION_DATE    │
│                  │  last_*_at       │  PLATFORM_ORIGIN      │
└──────────────────┴──────────────────┴───────────────────────┘
```

**Eingesetzte Tools:**

| Tool | Zweck | Typ |
|------|-------|-----|
| Medusa.js 2.x | Commerce-Plattform + Auth-System | Self-hosted |
| PostgreSQL (Supabase) | Primäre Datenhaltung (`customer`, `customer_stats`) | Self-hosted |
| Brevo | Newsletter-Versand + CRM-Attribute | SaaS (extern) |
| Resend | Transaktionale E-Mails (Welcome, Outbid, Shipped…) | SaaS (extern) |
| Rudderstack | **NICHT integriert** (nur als Konzept-Idee vorhanden) | — |

---

## 2. Wo werden Nutzer gespeichert?

### 2.1 Primäre Speicherung

Nutzer werden in der **Medusa-eigenen `customer`-Tabelle** in der Supabase PostgreSQL-Datenbank gespeichert (`bofblwqieuvmqybzxapx`, eu-central-1).

```sql
-- Medusa 2.x native customer table
customer (
  id              TEXT PRIMARY KEY,    -- ULID, z.B. cus_01KJPXG37THC2MRPPA3JQSABJ1
  email           TEXT UNIQUE NOT NULL,
  first_name      TEXT,
  last_name       TEXT,
  phone           TEXT,
  created_at      TIMESTAMP,
  deleted_at      TIMESTAMP             -- soft-delete
)
```

### 2.2 Aggregierte Statistiken

Eine separate `customer_stats`-Tabelle hält pre-aggregierte Kennzahlen für schnelle SQL-Abfragen (kein Brevo-API-Call nötig).

### 2.3 Brevo CRM (extern)

Parallel zu Medusa wird jeder Kunde als Kontakt in Brevo angelegt und mit Attributen befüllt. Dies dient für Newsletter-Versand, Segmentierung und Marketing-Automatisierung.

---

## 3. Datenbankschema: `customer_stats`

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | TEXT | ULID (generiert via `generateEntityId()`) |
| `customer_id` | TEXT UNIQUE | FK → `customer.id` |
| `total_spent` | NUMERIC | Gesamtausgaben in EUR (nur `status='paid'`) |
| `total_purchases` | INTEGER | Anzahl bezahlter Transaktionen |
| `total_bids` | INTEGER | Gesamtzahl abgegebener Gebote |
| `total_wins` | INTEGER | Anzahl gewonnener Auktionen (winning bids) |
| `last_purchase_at` | TIMESTAMP | Letzte Zahlung (aus `transaction.updated_at`) |
| `first_purchase_at` | TIMESTAMP | Erste Zahlung |
| `last_bid_at` | TIMESTAMP | Letztes Gebot (`bid.created_at`) |
| `tags` | TEXT[] | Manuelle Tags (z.B. `['vip','de','industrial']`) |
| `is_vip` | BOOLEAN | TRUE wenn `total_spent >= 500` |
| `is_dormant` | BOOLEAN | TRUE wenn kein Kauf in den letzten 90 Tagen |
| `updated_at` | TIMESTAMP | Letztes Recalc durch Cron-Job |

---

## 4. User-Lifecycle: Von der Registrierung bis zum CRM

```
Storefront (Browser)
       │
       ▼
  AuthModal.tsx
  register(email, password, firstName, lastName, newsletterOptin)
       │
       ▼
storefront/src/lib/auth.ts → register()
  1. POST /auth/customer/emailpass/register   → Medusa Auth Identity erstellen → JWT-Token
  2. POST /store/customers                    → customer-Datensatz in DB erstellen
       │
       ▼
AuthProvider.tsx → register()
  3. Token im localStorage/sessionStorage speichern
  4. POST /store/account/send-welcome         → (fire-and-forget)
  5. POST /store/account/newsletter           → (nur wenn newsletterOptin=true)
       │
       │
       ├─── Backend: send-welcome/route.ts ─────────────────────────────────┐
       │    - sendWelcomeEmail()        → Willkommens-Mail via Resend        │
       │    - sendVerificationEmail()   → E-Mail-Verifizierungslink          │
       │    - crmSyncRegistration()     → Brevo-Kontakt anlegen              │
       │                                                                      │
       ├─── Backend: customer-created Subscriber ────────────────────────────┤
       │    (Medusa-Event, feuert parallel zur HTTP-Route)                    │
       │    - INSERT customer_stats (leer, 0-Werte)   → ON CONFLICT DO NOTHING│
       │    - crmSyncRegistration()     → Brevo-Kontakt (idempotent)          │
       │                                                                      │
       └─── Backend: newsletter/route.ts ──────────────────────────────────┘
            - NEWSLETTER_OPTIN=true → upsertContact() in Brevo
            - Hinzufügen zu List ID 4 (VOD Auctions)
```

### 4.1 Subscriber: `customer-created.ts`

Der Subscriber `backend/src/subscribers/customer-created.ts` feuert auf das Medusa-Event `customer.created` — egal ob der Kunde sich über das Storefront registriert oder via Admin angelegt wird.

Er führt zwei Aktionen aus:
1. `INSERT INTO customer_stats … ON CONFLICT DO NOTHING` — Erstellt eine leere Stats-Zeile (idempotent)
2. `crmSyncRegistration()` — Brevo-Kontakt mit Basis-Attributen anlegen

### 4.2 CRM-Sync-Events in `crm-sync.ts`

| Funktion | Trigger | Brevo-Attribute |
|----------|---------|-----------------|
| `crmSyncRegistration()` | Registrierung + `customer.created` | FIRSTNAME, LASTNAME, MEDUSA_CUSTOMER_ID, PLATFORM_ORIGIN, CUSTOMER_SEGMENT="registered", REGISTRATION_DATE |
| `crmSyncBidPlaced()` | Gebot abgegeben | TOTAL_BIDS_PLACED, LAST_BID_DATE, LAST_BID_AMOUNT, CUSTOMER_SEGMENT="bidder" |
| `crmSyncAuctionWon()` | Auktion gewonnen | TOTAL_AUCTIONS_WON, LAST_PURCHASE_DATE, CUSTOMER_SEGMENT="buyer" |
| `crmSyncPaymentCompleted()` | Zahlung erfolgreich | TOTAL_PURCHASES, TOTAL_SPENT, LAST_PURCHASE_DATE, SHIPPING_* |
| `crmSyncShippingUpdate()` | Shipped / Delivered | LAST_SHIPMENT_DATE / LAST_DELIVERY_DATE |

Alle Funktionen sind **fire-and-forget** (`.catch(() => {})`) und blockieren nie den Hauptflow.

---

## 5. VIP- und Dormant-Schwellenwerte

| Klassifikation | Schwellenwert | Berechnung |
|----------------|---------------|------------|
| **VIP** | `total_spent >= €500` | Summe aller `status='paid'` Transaktionen |
| **Dormant** | Kein Kauf seit 90 Tagen | `last_purchase_at < NOW() - INTERVAL '90 days'` |

Diese Flags werden stündlich neu berechnet (siehe Abschnitt 6).

---

## 6. Recalc-Job (stündlicher Cron)

**Datei:** `backend/src/jobs/customer-stats-recalc.ts`
**Schedule:** `0 * * * *` (jede volle Stunde)
**Implementierung:** Medusa Job (`export const config = { name: ..., schedule: ... }`)

Der Job läuft in einer einzigen Abfrage:

```
customer
  LEFT JOIN (transaction aggregiert: total_spent, total_purchases, last/first_purchase_at)
  LEFT JOIN (bid aggregiert: total_bids, total_wins, last_bid_at)
```

Danach: `INSERT … ON CONFLICT (customer_id) DO UPDATE SET …` für jeden Kunden.

**Konstanten im Code:**
```typescript
const VIP_THRESHOLD = 500  // €500
const DORMANT_DAYS = 90    // 90 Tage
```

---

## 7. Admin-UI: `/app/crm`

**Route:** `backend/src/admin/routes/crm/page.tsx`
**API-Backend:** `GET /admin/customers` (Brevo + Medusa aggregiert)
**Kundenliste:** `GET /admin/customers/list` (lokal, paginiert)
**Kundendetail:** `GET /admin/customers/:id`

### 7.1 CRM Dashboard (`/app/crm` → Tab "Overview")

Zeigt aggregierte Daten aus **Brevo + Medusa**:

| Widget | Datenquelle |
|--------|-------------|
| 5 KPI-Cards (Total Contacts, VOD Auctions Liste, tape-mag Liste, Newsletter Opt-ins, Medusa Customers) | Brevo List Count + Medusa COUNT |
| Segment-Balkendiagramm (registered / bidder / buyer / unknown) | Brevo CUSTOMER_SEGMENT Attribut |
| Top 10 Kunden nach Ausgaben | Brevo TOTAL_SPENT |
| Recent Registrations | Brevo newest contacts |
| Campaign Performance (Open-Rate, Click-Rate) | Brevo Campaign API |

### 7.2 Kundenliste (`/app/crm` → Tab "Customers")

Vollständige lokale Kundenliste mit Search + Filter. Datenquelle: `customer_stats` LEFT JOIN `customer`.

**Filter-Optionen:**
- Textsuche (Email, Vor-/Nachname)
- `is_vip=true` / `is_dormant=true`
- Sort: `created_at`, `total_spent`, `total_purchases`, `last_purchase_at`

### 7.3 Kundendetail (Klick auf Kunden)

Zeigt pro Kunde:
- Profil (Email, Name, Telefon, Registrierungsdatum)
- Stats (total_spent, purchases, bids, wins, VIP/Dormant-Badge)
- Letzte 20 Bestellungen (mit Bestellnummer, Status, Betrag, Versandland)
- Letzte 20 Gebote (mit Lot-Nummer, Block-Titel, Winning/Outbid)
- Shipping-Adressen (aus Transaction-History, letzte 5)

---

## 8. GDPR-Export

**Endpoint:** `GET /store/account/gdpr-export`
**Auth:** JWT (nur eigener Datensatz)
**Format:** JSON-Download

Exportiert als downloadbare Datei `vod-auctions-data-export-YYYY-MM-DD.json`:
- Kundenprofil (id, email, name, phone, registered_at)
- Alle Bestellungen (Bestellnummer, Betrag, Status, Versandadresse, Datum)
- Alle Gebote (Betrag, is_winning, is_outbid, Datum)
- Merkliste (release_id, saved_at)

---

## 9. Brevo-Integration

### 9.1 Newsletter-Listen

| List ID | Name | Kontakte |
|---------|------|----------|
| 4 (`BREVO_LIST_VOD_AUCTIONS`) | VOD Auctions Registrierte | Wächst mit jeder Registrierung |
| 5 (`BREVO_LIST_TAPE_MAG`) | tape-mag.com Contacts | 3.580 importierte Kontakte |

### 9.2 Auction Block Newsletter-Sequenz

Für jeden Auction-Block werden bis zu 4 E-Mails versendet (an List ID 4):

| Typ | Zeitpunkt | Inhalt |
|-----|-----------|--------|
| `teaser` | T-7 Tage | Vorschau: 3 Preview-Items mit Startpreisen |
| `tomorrow` | T-24h | Morgen startet: 6 Items, Block-Beschreibung |
| `live` | T+0 (Startzeit) | Block ist jetzt live: 6 Items mit Startpreisen |
| `ending` | T-6h | Endet bald: Top 5 mit aktuellen Geboten |

### 9.3 Brevo-Kontakt-Attribute

Alle Custom Attributes in Brevo, die durch crm-sync.ts befüllt werden:

```
FIRSTNAME, LASTNAME
MEDUSA_CUSTOMER_ID    → Verknüpfung zur lokalen DB
PLATFORM_ORIGIN       → "vod-auctions"
CUSTOMER_SEGMENT      → registered | bidder | buyer
REGISTRATION_DATE     → YYYY-MM-DD
TOTAL_BIDS_PLACED
LAST_BID_DATE
LAST_BID_AMOUNT
TOTAL_AUCTIONS_WON
TOTAL_PURCHASES
TOTAL_SPENT
LAST_PURCHASE_DATE
NEWSLETTER_OPTIN      → true | false
SHIPPING_ADDRESS, SHIPPING_CITY, SHIPPING_POSTAL_CODE, SHIPPING_COUNTRY, SHIPPING_NAME
LAST_SHIPMENT_DATE
LAST_DELIVERY_DATE
```

---

## 10. Rudderstack-Status

**Rudderstack ist NICHT integriert.**

Eine Suche im gesamten Codebase (`/backend`, `/storefront`, alle Konfigurationsdateien) ergab keinen einzigen aktiven Code-Import oder Initialisierungsaufruf von Rudderstack.

Rudderstack wird lediglich im Konzeptdokument `docs/architecture/CRM_CUSTOMER_MANAGEMENT_KONZEPT_2026.md` als **zukünftige Option** erwähnt (Tickets R2/R4 im Backlog — nicht umgesetzt).

---

## 11. Bekannte Lücke: Admin-erstellte Kunden

Wenn ein Admin im Medusa-Backend einen Kunden **manuell anlegt** (nativer Medusa "Create Customer"-Button), läuft der `customer.created`-Subscriber korrekt durch und erstellt die `customer_stats`-Zeile. Allerdings kann die Brevo-Sync in `crmSyncRegistration()` fehlschlagen, wenn der Kunde noch keine vollständigen Daten in der `customer`-Tabelle hat — da die `send-welcome`-Route nicht aufgerufen wird.

Dies ist ein bekanntes Verhalten (dokumentiert in `CRM_CUSTOMER_MANAGEMENT_KONZEPT_2026.md`, Abschnitt 1.3).

---

## 12. Wichtige Dateipfade

| Datei | Zweck |
|-------|-------|
| `backend/src/subscribers/customer-created.ts` | Medusa-Event-Subscriber: Stats-Zeile + Brevo-Sync bei Registrierung |
| `backend/src/lib/crm-sync.ts` | CRM-Event-Funktionen (Registration, Bid, Won, Payment, Shipping) |
| `backend/src/lib/brevo.ts` | Brevo API-Wrapper (upsertContact, sendCampaign, listContacts, …) |
| `backend/src/jobs/customer-stats-recalc.ts` | Stündlicher Cron-Job: customer_stats neu berechnen |
| `backend/src/api/admin/customers/route.ts` | CRM-Dashboard-API (Brevo + Medusa aggregiert) |
| `backend/src/api/admin/customers/list/route.ts` | Paginated Customer List (lokal, customer_stats JOIN) |
| `backend/src/api/admin/customers/[id]/route.ts` | Kundendetail (Profil + Orders + Bids + Adressen) |
| `backend/src/api/store/account/send-welcome/route.ts` | Welcome-Mail + Verifizierungslink + CRM-Sync nach Registrierung |
| `backend/src/api/store/account/newsletter/route.ts` | GET/POST Newsletter-Opt-in (Brevo) |
| `backend/src/api/store/account/gdpr-export/route.ts` | GDPR-Datenexport als JSON-Download |
| `storefront/src/lib/auth.ts` | register(), login(), getToken(), setToken(), clearToken() |
| `storefront/src/components/AuthModal.tsx` | Registrierungs-/Login-Dialog mit Newsletter-Checkbox |
| `storefront/src/components/AuthProvider.tsx` | React Context: register(), login(), logout(), refreshStatus() |
| `backend/src/admin/routes/crm/page.tsx` | Admin CRM-Seite (Dashboard + Kundenliste + Kundendetail) |

---

## 13. Roadmap / Offene Punkte

Aus dem Konzeptdokument `CRM_CUSTOMER_MANAGEMENT_KONZEPT_2026.md`:

| Ticket | Beschreibung | Aufwand | Status |
|--------|--------------|---------|--------|
| R1 | Rudderstack-Account anlegen (Write Key, Data Plane) | 30 min | Offen |
| R2 | `backend/src/lib/rudderstack.ts` — Node.js SDK Wrapper | 1h | Offen |
| R3 | Server-Side Events in bestehende Flows einhängen (bid, payment, ship) | 2h | Offen |
| R4 | Storefront: `rudder-sdk-js` einbinden (Page Views + Key Events) | 2h | Offen |
| C1 | Tags-Management im Admin UI | 1h | Offen |
| C2 | Admin-erstellte Kunden → Brevo-Sync reparieren | 30 min | Offen |
| C3 | Kundenprofil-Suchfeld im CRM-Dashboard | 1h | Offen |

---

*Dieses Dokument beschreibt den IST-Zustand per 2026-03-30. Vollständige Konzept-Analyse + Marktvergleich: `docs/architecture/CRM_CUSTOMER_MANAGEMENT_KONZEPT_2026.md`*
