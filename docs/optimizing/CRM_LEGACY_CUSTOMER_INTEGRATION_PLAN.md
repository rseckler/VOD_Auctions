# CRM Legacy Customer Integration Plan

**Status:** Planung (2026-04-25)
**Ziel:** Tape-mag-Bestandsdaten (3.580 Brevo-Kontakte + 7.890 Legacy-Kunden + 7.881 historische Orders / €1.38M GMV) im Admin-CRM nutzbar machen, damit POS, Storefront und Marketing damit arbeiten können — und damit Konversionen automatisch wieder zugeordnet werden.
**Quelle:** Analyse-Session 2026-04-25 (CRM-Tab-Audit + Schema-Investigation via Supabase MCP)
**Verwandte Docs:** [`POS_WALK_IN_KONZEPT.md`](POS_WALK_IN_KONZEPT.md), [`POST_AUCTION_MARKETING_FUNNEL.md`](POST_AUCTION_MARKETING_FUNNEL.md), `backend/src/lib/crm-sync.ts`, `backend/src/lib/brevo.ts`

---

## Kontext: Was gerade existiert

### Drei Datenquellen, keine vereinte Sicht

| Quelle | Wo | Zeilen | Was drin | Im Admin sichtbar? |
|---|---|---:|---|---|
| **Brevo List 5** (`tape-mag`) | Brevo Cloud (live API) | 3.580 | Migrierte tape-mag-Newsletter-Kontakte mit `CUSTOMER_SEGMENT`/`TOTAL_SPENT`-Attributen | Nur Dashboard-Karte + 50 jüngste in „Recent CRM Contacts" |
| **Brevo List 7** (`vod-auctions`) | Brevo Cloud (live API) | 21 | Plattform-Newsletter-Optins | Nur Dashboard-Karte |
| **`customer`** (Medusa-native, text PK) | Unsere DB | 12 | Plattform-registrierte Accounts (alle `has_account=true`, alle `<90d`) | **Customers**-Tab in `/admin/crm` zeigt alle 12 |
| **`customers`** (Legacy, int PK) | Unsere DB | 15.780 / 7.890 unique | tape-mag Kunden-Stammdaten + 9.393 Adressen | **Nirgendwo** |
| **`orders`** (Legacy) | Unsere DB | 7.881 | Historische Bestellungen 2013-2026, **€1.38M GMV**, 12.899 Line-Items | **Nirgendwo** |
| **`newsletter_subscribers`** (Legacy) | Unsere DB | 3.567 | Lokale Spiegelkopie der tape-mag-Newsletter | **Nirgendwo** |

### Schmerzpunkte

1. **Customers-Tab zeigt nur 12 Datensätze.** Die 7.890 Legacy-Kunden mit Adressen + 13 Jahren Bestellhistorie schlummern unsichtbar.
2. **POS-Suche findet nur Plattform-Accounts.** `backend/src/api/admin/pos/customer-search/route.ts` queried nur `customer` (text-PK) — Frank kann keinen Bestandskäufer finden, der nie auf der Plattform registriert war.
3. **Kein Email-Merge bei Konversion.** Ein tape-mag-Kunde, der heute via Storefront/POS kauft oder ein Account erstellt, bekommt einen frischen `customer`-Row ohne Verknüpfung zu Legacy-Stammdaten oder Order-History.
4. **Brevo-Sync nur Read.** `customer_stats.brevo_contact_id` und `brevo_synced_at` sind als Spalten vorhanden, aber für **alle 12 Rows NULL**. Das CRM liest live aus Brevo, schreibt aber nicht zurück.
5. **Duplicate-Import-Bug.** `customers` hat **jeden Datensatz zweimal** (15.780 / 7.890 unique → der `crm_import.py`-Job lief 2026-03-22 zwei Mal mit 5min Abstand ohne Upsert/Dedup). Adressen + Orders sind nicht doppelt (nur die Customer-Stammdatenzeile).
6. **`orders.billing_address` / `shipping_address` sind freie Text-Strings ohne Separator.** Z.B. `"Mrmaster seckler RobinBrückenstr. 888097 EriskirchDeutschland"`. Kein JSON, kein FK auf `customer_addresses`. Adress-Anzeige im Admin braucht Parsing oder JOIN auf `customer_addresses`.
7. **`order_items.product_name` enthält HTML** (`<br>`, Promo-Prefixes). Strip nötig vor Anzeige.
8. **Schema-Bridge fehlt.** Keine FK zwischen `customer` (text PK) ↔ `customers` (int PK). Einziger Bridge-Kandidat: `email` (case-insensitive, beide Tabellen `varchar`).

---

## Option A — Surface & Bridge (Quick Win, additiv)

**Idee:** Die Legacy-Tabellen bleiben strukturell unangetastet. Wir geben ihnen ein **eigenes Admin-UI** und erweitern POS-Search via `UNION` über beide Tabellen. Wenn ein Legacy-Kunde via POS kauft, wird **on-the-fly** ein Medusa-`customer`-Stub erzeugt + via `metadata.legacy_customer_id` an die Legacy-Zeile gelinkt.

**Aufwand:** ~1.5 Tage Code + ~30min Migration + 1 Tag UI-Polish = **~3 Tage gesamt**
**Risiko:** Niedrig (additiv, kein Datenmodell-Eingriff)
**Reversibel:** Ja (Stubs lassen sich via `metadata.legacy_customer_id IS NOT NULL` re-identifizieren)

### A.0 Vorbereitung — Duplicate-Cleanup `customers`

**Migration:** `backend/src/scripts/migrations/2026-04-25-customers-dedup.sql`

```sql
-- Lösche jüngere Duplikate (gleicher legacy_id, behalte die ältere Row)
WITH ranked AS (
  SELECT id, legacy_id,
         ROW_NUMBER() OVER (PARTITION BY legacy_id ORDER BY created_at ASC, id ASC) AS rn
  FROM customers
  WHERE legacy_id IS NOT NULL
)
DELETE FROM customers WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- UNIQUE-Constraint hinzufügen damit es nicht wieder passiert
ALTER TABLE customers ADD CONSTRAINT customers_legacy_id_unique UNIQUE (legacy_id);

-- Optional: case-insensitive Email-Index für die Suche
CREATE INDEX IF NOT EXISTS idx_customers_email_lower ON customers (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_customer_email_lower ON customer (LOWER(email));
```

**Pre-Check:** `SELECT legacy_id, COUNT(*) FROM customers GROUP BY 1 HAVING COUNT(*) > 1 LIMIT 5` muss vor dem DELETE >0 Zeilen liefern (Bestätigung des Bugs), nach dem DELETE 0 Zeilen.

**FK-Auswirkung:** `customer_addresses.customer_id` und `orders.customer_id` zeigen auf `customers.id` — wir löschen die zweite Kopie, **die FKs zeigen aber alle auf die erste Kopie** (jüngerer Import-Run hat die Children nicht dupliziert; nur die Customer-Stammzeile). Pre-Verify-Query:

```sql
-- Stelle sicher dass keine orders/addresses auf gelöschte rows zeigen
SELECT COUNT(*) FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id
WHERE c.id IS NULL;
-- Erwartung: 0
```

Wenn doch >0: vorher die FK auf `legacy_id` umbiegen (separate Migration mit `UPDATE orders SET customer_id = ...`).

### A.1 Backend — Read-Only Legacy-Customer-API

**Neue Route:** `backend/src/api/admin/crm/legacy/customers/route.ts`

```typescript
GET /admin/crm/legacy/customers?q=<search>&limit=50&offset=0&sort=total_spent
```

Response:
```typescript
{
  customers: [{
    legacy_id: number,
    email: string,
    phone: string | null,
    language: string,
    order_count: number,        // Computed: COUNT(orders WHERE customer_id=...)
    total_spent: number,        // Computed: SUM(orders.total)
    last_order_at: string|null, // Computed: MAX(orders.ordered_at)
    addresses: [{
      address_type: 'billing'|'shipping',
      first_name, last_name, company, street, zip_code, city, country, is_default
    }],
    medusa_customer_id: string|null,  // Wenn email-match in customer-Tabelle existiert
  }],
  total: number,
}
```

Query nutzt **aggregate CTE** (kein O(N×M) wie in rc49):
```sql
WITH order_agg AS (
  SELECT customer_id, COUNT(*) AS order_count, SUM(total) AS total_spent, MAX(ordered_at) AS last_order_at
  FROM orders GROUP BY customer_id
),
medusa_match AS (
  SELECT id AS medusa_id, LOWER(email) AS email_key FROM customer WHERE deleted_at IS NULL
)
SELECT c.*, oa.order_count, oa.total_spent, oa.last_order_at, mm.medusa_id
FROM customers c
LEFT JOIN order_agg oa ON oa.customer_id = c.id
LEFT JOIN medusa_match mm ON mm.email_key = LOWER(c.email)
WHERE (c.email ILIKE $q OR c.phone ILIKE $q)
ORDER BY oa.total_spent DESC NULLS LAST
LIMIT $limit OFFSET $offset
```

**Performance:** `idx_customers_email_lower` (A.0) + `idx_orders_customer_id` (existiert via FK). Erwartete Latenz <100ms auf 7.890 Rows.

**Detail-Route:** `backend/src/api/admin/crm/legacy/customers/[id]/route.ts`

```typescript
GET /admin/crm/legacy/customers/:legacyId
```

Liefert volles Customer-Objekt + alle Addresses + alle Orders mit Order-Items. Order-Items mit `product_name` HTML-stripped (server-seitig: einfaches `text.replace(/<[^>]+>/g, '')` reicht).

### A.2 Backend — POS-Search UNION über beide Quellen

**Erweiterung:** `backend/src/api/admin/pos/customer-search/route.ts`

```sql
WITH platform AS (
  SELECT
    'platform'::text AS source,
    c.id::text AS id,                  -- text PK
    c.first_name, c.last_name, c.email, c.phone,
    cs.total_spent, cs.total_purchases, cs.is_vip, cs.last_purchase_at
  FROM customer c
  LEFT JOIN customer_stats cs ON cs.customer_id = c.id
  WHERE c.deleted_at IS NULL
    AND (c.first_name ILIKE $q OR c.last_name ILIKE $q OR c.email ILIKE $q
         OR CONCAT(c.first_name, ' ', c.last_name) ILIKE $q)
),
legacy AS (
  SELECT
    'legacy_tape_mag'::text AS source,
    'legacy:' || c.id::text AS id,    -- prefixed sentinel, damit Frontend Source erkennen kann
    ca.first_name, ca.last_name, c.email, c.phone,
    COALESCE(SUM(o.total), 0) AS total_spent,
    COUNT(o.id) AS total_purchases,
    false AS is_vip,
    MAX(o.ordered_at) AS last_purchase_at
  FROM customers c
  LEFT JOIN customer_addresses ca ON ca.customer_id = c.id AND ca.is_default = true
  LEFT JOIN orders o ON o.customer_id = c.id
  WHERE (ca.first_name ILIKE $q OR ca.last_name ILIKE $q OR c.email ILIKE $q
         OR CONCAT(ca.first_name, ' ', ca.last_name) ILIKE $q)
  GROUP BY c.id, ca.first_name, ca.last_name, c.email, c.phone
)
SELECT * FROM platform
UNION ALL
SELECT * FROM legacy
ORDER BY total_spent DESC NULLS LAST
LIMIT 10
```

**Wichtig:** Die `id`-Spalte muss **prefix-encoded** sein (`legacy:1234` vs `cus_01ABC...`), damit das POS-Frontend den Source erkennt und beim Checkout den richtigen Codepath auswählt.

**Frontend-Anpassung:** `backend/src/admin/routes/pos/page.tsx`
- Customer-Card: zeige `source`-Badge (`Platform` / `Tape-Mag Legacy`) farblich differenziert.
- Wenn ausgewählt: speichere `customerId` (string) PLUS `customerSource` (`'platform' | 'legacy_tape_mag'`).
- Bestehende `bidder1@test.de`-etc-Tests bleiben unverändert (alle `'platform'`).

### A.3 Backend — POS-Checkout Auto-Stub-Erstellung

**Erweiterung:** `backend/src/api/admin/pos/sessions/[id]/checkout/route.ts`

Beim Checkout, wenn `customer_id.startsWith("legacy:")`:

```typescript
const legacyId = parseInt(customerId.replace("legacy:", ""), 10)

// Step 1: Lookup Legacy-Kunde + Default-Address
const legacy = await pg("customers").where({ id: legacyId }).first()
const address = await pg("customer_addresses")
  .where({ customer_id: legacyId, is_default: true })
  .first()

// Step 2: Email-Match in Medusa-customer? Wenn ja, einfach diesen nehmen
let medusaCustomer = await pg("customer")
  .whereRaw("LOWER(email) = LOWER(?)", [legacy.email])
  .whereNull("deleted_at")
  .first()

// Step 3: Sonst Stub erstellen
if (!medusaCustomer) {
  const newId = "cus_" + ulid()  // generateEntityId-Pattern
  await pg("customer").insert({
    id: newId,
    email: legacy.email,
    first_name: address?.first_name ?? null,
    last_name: address?.last_name ?? null,
    phone: legacy.phone,
    has_account: false,                    // ← Stub-Marker, kein Login
    metadata: JSON.stringify({
      source: 'legacy_tape_mag',
      legacy_customer_id: legacyId,
      bridged_at: new Date().toISOString(),
      bridged_via: 'pos_checkout',
    }),
    created_at: new Date(),
    updated_at: new Date(),
  })
  medusaCustomer = { id: newId, ... }
}

// Step 4: Bestehende Checkout-Logik mit medusaCustomer.id fortsetzen
```

**Idempotenz:** Wenn derselbe Legacy-Kunde zweimal hintereinander via POS kauft, tritt Step 2 immer in Kraft (Email-Match), kein zweiter Stub.

**Sicherheit:** Stub-Customer hat `has_account=false` → kein Login möglich, keine Storefront-Sichtbarkeit. Marketing-Mails über Brevo bleiben separat (Brevo erfährt davon erst via Bidirectional-Sync, siehe Option B).

### A.4 Frontend — Neuer Admin-Tab „Tape-Mag Legacy"

**Datei:** `backend/src/admin/routes/crm/page.tsx` — dritter Tab neben „Customers" und „CRM Dashboard".

Spalten der Liste:
- **Email** (sortable)
- **Name** (aus `customer_addresses.first_name + last_name` der `is_default`-Adresse, fallback `—`)
- **Country** (aus `customer_addresses.country` oder `country_id` JOIN auf `countries`)
- **Orders** (count)
- **Total Spent** (€)
- **Last Order** (`ordered_at` MAX)
- **Bridged?** Grünes Häkchen wenn `medusa_customer_id != null` (Email-Match oder bereits Stub)

Filter:
- Has-Orders (`order_count > 0`)
- Has-Address (`addresses.length > 0`)
- Bridged-Status (alle / nur Bridged / nur Unbridged)

Detail-View: voller Customer + alle Adressen + Order-Liste mit Items. Read-Only initial. „Bridge to Medusa Account"-Button als Phase-2-Polish (manueller Stub-Trigger für Marketing-Use-Case).

**File-Touches:**
- `backend/src/admin/routes/crm/page.tsx` (Tab + Liste + Detail)
- Optional separate Komponente `backend/src/admin/components/crm/legacy-customer-detail.tsx` wenn page.tsx zu groß wird (aktuell 2000+ Zeilen)

### A.5 Online Conversion Paths — sechs Flows

Frank's POS-Use-Case ist nur einer von sechs Touch-Points an denen Legacy-Kontakte ins System geführt werden. Storefront-Online-Flows sind genauso kritisch und brauchen eigene Logik.

**Backbone-Regel:** Wir bridgen Legacy-Daten **niemals** vor Identitäts-Proof (Email-Verification oder Password-Set). Sonst zwei Risiken: Account-Enumeration (Form-Feedback enthüllt „diese Email gibt's bei uns") und Order-History-Spoofing.

#### A.5.1 Self-Register (Storefront)

Standard-Flow:
```
POST /store/customers
  → Medusa erzeugt customer (has_account=true) + Email-Verification-Mail
  → User klickt Verification-Link
  → Subscriber `customer.email_verified` triggert Bridge-Job:
      SELECT FROM customers WHERE LOWER(email) = LOWER($email)
      → Match: UPDATE customer.metadata = {
          source: 'platform',
          legacy_customer_id: ...,
          bridged_at: NOW(),
          bridged_via: 'self_register_verified'
        }
  → Account-Page zeigt: "Welcome back — your tape-mag history is linked."
```

**File-Touches:**
- `backend/src/subscribers/customer-email-verified.ts` (neu) — Hook auf `customer.email.verified`
- `backend/src/lib/customer-bridge.ts` (neu) — `bridgeLegacyByEmail(pg, customerId)` als wiederverwendbare Funktion

#### A.5.2 Login

Standard-Login-Flow bleibt unverändert. Nur das **Error-Wording** ändern:

```
SELECT FROM customer WHERE LOWER(email) = ? AND has_account = true
  → Match + Password-OK   → Login (normal)
  → Match + Password-Wrong → "Invalid credentials" (kein Hint)
  → Kein Match            → "Invalid credentials. New here? [Register] ·
                            Already had a tape-mag account? [Reset password]"
```

Der Hint enumeriert nichts (sagt nur „falls Du dachtest..."), führt aber Bestandskunden zum **Forgot-Password-Pfad**, der die Bridge handelt (A.5.3).

**File-Touches:**
- `storefront/src/app/account/login/page.tsx` — Error-Component erweitern um „Tape-Mag-Reset"-Link

#### A.5.3 Forgot-Password (kanonischer Legacy-Pfad)

Das ist der **wichtigste** Flow für die ersten Wochen post-launch — ein Bestandskunde, der sich nie auf der Plattform registriert hat, kommt nur über diesen Pfad rein. Ohne A.5.3 gehen 4.465 echte Käufer verloren.

```
POST /store/customers/password-reset
  body: { email }
  → SELECT FROM customer WHERE LOWER(email)=? AND has_account=true
     → Match: bestehende Logik (Reset-Token + Mail)
  → SONST SELECT FROM customers WHERE LOWER(email)=?
     → Match (= Legacy ohne Plattform-Account):
         BEGIN TRANSACTION
           INSERT INTO customer (
             id, email, has_account=false, metadata={
               source:'legacy_tape_mag',
               legacy_customer_id:...,
               bridged_at:NOW(),
               bridged_via:'forgot_password'
             }
           )
           INSERT INTO password_reset_token (...)
         COMMIT
         → Mail: "Set your password to access your account
                  and previous tape-mag order history."
     → Token-Validation auf /account/reset/[token]:
         POST /store/customers/password-reset/redeem
           UPDATE customer SET has_account=true, password_hash=...
                                WHERE id=...
  → SONST (Email weder in customer noch customers):
     → Generic "If we have an account with this email, you'll receive
       a reset link" (account-enum-safe)
```

**File-Touches:**
- `backend/src/api/store/customers/password-reset/route.ts` — Erweitern um Legacy-Branch
- `backend/src/api/store/customers/password-reset/redeem/route.ts` (oder existing) — `has_account=true`-Promotion bei erstem Set
- Reset-Mail-Template: Sondertext für `bridged_via='forgot_password'` Empfänger

**Wichtig — Reset-Mail Phishing-Awareness:**
- From-Header **muss** `noreply@vod-auctions.com` sein, nicht „tape-mag" oder gemischt
- Reset-Token ablauf: 24h (statt 7 Tage) — Bridge-Mails sind höher-Risiko
- Mail-Body erklärt explizit: „You're receiving this because vod-auctions.com is the new home for the tape-mag catalog"

#### A.5.4 Newsletter-Signup (DSGVO-aware)

Storefront-Newsletter-Form bekommt einen Pre-Check gegen Brevo List 5:

```
POST /store/newsletter/subscribe
  body: { email, source_form }
  → Brevo API: GET /contacts/{email}
     → 404: neue Email → DOI-Mail an List 7 (vod-auctions)
     → 200 + member of List 5 (tape-mag):
         Option a) Skip-DOI (rechtlich nur OK wenn tape-mag-Consent
                  übertragbar ist — Anwalt-Frage, RSE-78)
         Option b) Re-DOI senden mit Wording "We've moved — please
                  confirm to keep receiving updates" (sicherer Default)
     → 200 + already in List 7: idempotent return success
  → Add to List 7 nur nach DOI-Bestätigung
```

**Re-DOI-Default-Strategie (sicher):**
- Alle 3.580 List-5-Kontakte bekommen **einmalig** eine „Hello again from VOD"-DOI-Mail bei ihrem ersten Touch (oder via einmalige Kampagne, Phase 1)
- Nach 30 Tagen ohne Re-Bestätigung: aus List 7 droppen, in List 5 (Archiv) lassen
- `customer_stats.tags` bekommt `newsletter_consent_carried` (Carry-Over) oder `newsletter_consent_fresh` (Re-DOI) für Audit-Trail

**File-Touches:**
- `backend/src/api/store/newsletter/subscribe/route.ts` — Brevo-Pre-Check + DOI-Logik
- `backend/src/lib/brevo.ts::getContactByEmail()` (existiert evtl. schon)

#### A.5.5 Anonymous Checkout (Storefront)

Identisch zur POS-Logik (A.3): bei Order-Create wird per Email gegen `customers` gecheckt. Wenn Match → Stub-Customer mit `metadata.legacy_customer_id`. Wenn kein Match → leerer Stub mit `source='anonymous_storefront'`. User kann später via Forgot-Password seinen Account claimen.

**File-Touches:**
- `backend/src/api/store/checkout/route.ts` (oder Medusa-Native-Hook auf `cart.completed`) — gleicher Bridge-Helper wie A.5.3

#### A.5.6 Pre-Launch-Invite (siehe Section C)

Pre-Launch-Mode ist aktiv (`platform_mode=beta_test → pre_launch`). Dort steckt ein eigenes System (`waitlist_applications`, `invite_tokens`, `invite_token_attempts`), das gehärtet werden muss bevor 300 reale Invites rausgehen. Volldetails in **Section C** unten.

#### A.5.7 Bridge-Sichtbarkeit auf Storefront

UX-Defaults:
- Account-Detail-Page zeigt Banner „Welcome back — we've recovered your tape-mag history (X orders)" wenn `metadata.legacy_customer_id` gesetzt ist und `bridged_via != 'self_register'` (also nur wenn Bridge passiert ist, nicht bei nativem Signup)
- Banner ist dismissable (`localStorage`, kein DB-Roundtrip)
- Account-Settings-Page hat Toggle „Disconnect tape-mag history" → setzt `metadata.legacy_customer_id = null` (Daten in DB bleiben für interne Reports, sind nur nicht mehr im User-Account verlinkt)

**File-Touches:**
- `storefront/src/app/account/page.tsx` — Banner-Component + Dismiss-Logik
- `storefront/src/app/account/settings/page.tsx` — Disconnect-Toggle
- `backend/src/api/store/account/disconnect-legacy/route.ts` (neu) — atomic UPDATE

---

### A.6 Tests + Smoke

- **Migration-Smoke:** Pre/Post-Counts. `customers` 15.780 → 7.890. `orders.customer_id` ohne Match: 0.
- **POS-Search-Test:** Suche nach „Bonikowski" muss Legacy-Match liefern (sofern in tape-mag).
- **Stub-Erzeugung-Test:** POS-Checkout mit Legacy-Kunde → check `customer.metadata.legacy_customer_id`.
- **Idempotenz-Test:** Zweiter POS-Checkout mit selber Email → kein zweiter Stub.

### A.7 Kosten + Risiken

| Item | Risiko | Mitigation |
|---|---|---|
| Duplicate-Cleanup löscht zu viel | Daten-Verlust | Pre-Verify-Query auf orphan FKs vor DELETE |
| POS-Search wird langsam | UX | `idx_customer_addresses_first_name`+`last_name`, EXPLAIN ANALYZE auf prod-DB |
| Stub-Customer entsteht doppelt | Datenmüll | UNIQUE-Index auf `LOWER(customer.email)` (rejected wenn Konflikt → Code-Pfad muss SELECT-existing-first machen) |
| Legacy-Email-Format inkonsistent (Whitespace, Casing) | Fehl-Match | TRIM + LOWER beim Match-Check, Pre-Migration-Audit auf Edge-Cases |

### A.8 Was Option A NICHT macht

- Kein Brevo-Bidirectional-Sync (Brevo bleibt Read-Only).
- Keine Migration der `newsletter_subscribers` (3.567 Rows) ins Hauptmodell — die bleiben separat lesbar nur via Brevo-API.
- Keine Backfill-Stub-Erzeugung für **alle** 7.890 Legacy-Kunden — Stubs entstehen erst bei tatsächlichem Touchpoint (POS-Checkout, Self-Register).
- Keine Customer-Group-Zuweisung (z.B. `tape_mag_legacy` als Group) — könnte aber via gleichem `metadata.source`-Flag separat ergänzt werden.

---

## Option B — Unified Customer Model (Strategisch, mit Backfill)

**Idee:** Wir haben **eine** kanonische Customer-Tabelle (Medusa `customer`). Alle 7.890 Legacy-Kunden werden **proaktiv** als Stub-`customer`-Rows angelegt, mit `metadata.source` als Differenzierungs-Flag. Brevo-Bidirectional-Sync wird verkabelt (Account-Create → Brevo-Push, Brevo-Update → DB-Pull). POS-Search hat danach **keine UNION mehr nötig**.

**Aufwand:** ~5-7 Tage Code + Migration + Backfill + QA = **~2 Wochen gesamt**
**Risiko:** Mittel (Medusa-customer-Tabelle wächst von 12 auf ~7.900, neue Read-Patterns auf Native Routes)
**Reversibel:** Bedingt (Stubs lassen sich identifizieren und löschen, aber `customer_stats` und FK-Children müssen mit-cleanup'ed werden)

### B.0 Voraussetzung — A.0 läuft zuerst

Duplicate-Cleanup auf `customers` ist Voraussetzung. Backfill auf 15.780 statt 7.890 würde alles verdoppeln.

### B.1 Schema — `customer.metadata` Source-Konvention

Verbindliche `metadata` Schema-Erweiterung (kein DB-Change, nur Konvention):

```typescript
// backend/src/lib/customer-source.ts (neu)
export type CustomerSource =
  | 'platform'           // Native via Storefront-Signup
  | 'legacy_tape_mag'    // Backfill aus customers (Plural) Tabelle
  | 'legacy_brevo_only'  // Nur in Brevo, kein Order-History (zukünftiger Backfill)
  | 'pos_walk_in'        // Erstellt im POS ohne Storefront-Signup
  | 'admin_created'      // Manuell vom Admin angelegt

export interface CustomerMetadata {
  source: CustomerSource
  legacy_customer_id?: number     // FK auf customers.id
  brevo_contact_id?: number       // gespiegelt aus customer_stats.brevo_contact_id
  newsletter_subscriber_id?: number
  bridged_at?: string
  bridged_via?: string
}

export const HAS_LEGACY_HISTORY = (m: any) =>
  m?.source === 'legacy_tape_mag' || m?.legacy_customer_id != null
```

### B.2 Migration — Backfill 7.890 Stub-Customers

**Script:** `scripts/customer_legacy_backfill.py` (Python wegen Bulk-Insert + Reporting)

```python
"""
Backfill aller Legacy-Customers als Medusa-Stub-Customers.

Idempotent: prüft per Email-Match (case-insensitive), ob der Stub schon
existiert. Wenn ja, wird nur metadata.legacy_customer_id ergänzt.

Erwartete Resultate:
  - ~7.890 INSERTs (Stubs für unmatched legacy emails)
  - ~12 UPDATEs   (existing platform customers, falls Email-Overlap)
  - 0 Updates auf orphan rows
"""

import psycopg2, ulid, json, datetime, os, re

EMAIL_RE = re.compile(r'^\S+@\S+\.\S+$')

def main():
    conn = psycopg2.connect(os.environ['SUPABASE_DB_URL'])
    cur = conn.cursor()

    cur.execute("""
        SELECT c.id, c.email, c.phone,
               ca.first_name, ca.last_name
        FROM customers c
        LEFT JOIN customer_addresses ca
          ON ca.customer_id = c.id AND ca.is_default = true
    """)
    rows = cur.fetchall()
    print(f"Found {len(rows)} legacy customers to backfill")

    inserted = updated = skipped_invalid = 0

    for legacy_id, email, phone, first, last in rows:
        if not email or not EMAIL_RE.match(email):
            skipped_invalid += 1
            continue

        cur.execute(
            "SELECT id, metadata FROM customer WHERE LOWER(email) = LOWER(%s) AND deleted_at IS NULL",
            (email,)
        )
        existing = cur.fetchone()

        if existing:
            existing_id, existing_meta = existing
            existing_meta = existing_meta or {}
            # Already linked? Skip
            if existing_meta.get('legacy_customer_id') == legacy_id:
                continue
            existing_meta.update({
                'legacy_customer_id': legacy_id,
                'bridged_at': datetime.datetime.utcnow().isoformat(),
                'bridged_via': 'backfill_2026_04',
            })
            cur.execute(
                "UPDATE customer SET metadata = %s, updated_at = NOW() WHERE id = %s",
                (json.dumps(existing_meta), existing_id)
            )
            updated += 1
        else:
            new_id = f"cus_{ulid.new()}"
            metadata = {
                'source': 'legacy_tape_mag',
                'legacy_customer_id': legacy_id,
                'bridged_at': datetime.datetime.utcnow().isoformat(),
                'bridged_via': 'backfill_2026_04',
            }
            cur.execute("""
                INSERT INTO customer (id, email, first_name, last_name, phone,
                                     has_account, metadata, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, false, %s, NOW(), NOW())
            """, (new_id, email, first, last, phone, json.dumps(metadata)))
            inserted += 1

    conn.commit()
    print(f"Done: {inserted} inserted, {updated} updated, {skipped_invalid} skipped (invalid email)")
    conn.close()

if __name__ == '__main__':
    main()
```

**Pre-Run-Validation:**
- Email-Validation: Reject malformed (gefundene Edge-Cases im tape-mag-Export: leere Strings, "noreply@", Whitespace).
- Duplicate-within-batch: SQL-Pre-Check mit `GROUP BY LOWER(email) HAVING COUNT(*) > 1` — falls mehrere Legacy-Customers mit derselben Email, nur den **mit den meisten Orders** mappen.

**Rollback-Path:**
```sql
DELETE FROM customer
WHERE has_account = false
  AND (metadata->>'bridged_via') = 'backfill_2026_04';
```

### B.3 Migration — `customer_stats` für Stub-Customers

`customer_stats` ist FK-aware; nach dem Backfill müssen 7.890 Stat-Rows angelegt werden, sonst CRM-UI bricht.

```sql
INSERT INTO customer_stats (
  id, customer_id, total_spent, total_purchases, total_bids, total_wins,
  last_purchase_at, first_purchase_at, tags, is_vip, is_dormant, updated_at
)
SELECT
  'cstats_' || substr(c.id, 5),  -- 'cstats_<ulid>'
  c.id,
  COALESCE(oa.total_spent, 0),
  COALESCE(oa.order_count, 0),
  0, 0,
  oa.last_order_at, oa.first_order_at,
  ARRAY['legacy_tape_mag']::text[],
  COALESCE(oa.total_spent, 0) > 500,  -- VIP-Schwelle
  COALESCE(oa.last_order_at, NOW() - INTERVAL '5 years') < NOW() - INTERVAL '2 years',
  NOW()
FROM customer c
LEFT JOIN (
  SELECT
    o.customer_id AS legacy_id,
    SUM(o.total) AS total_spent,
    COUNT(o.id) AS order_count,
    MAX(o.ordered_at) AS last_order_at,
    MIN(o.ordered_at) AS first_order_at
  FROM orders o GROUP BY o.customer_id
) oa ON oa.legacy_id = (c.metadata->>'legacy_customer_id')::int
WHERE (c.metadata->>'source') = 'legacy_tape_mag'
  AND NOT EXISTS (SELECT 1 FROM customer_stats WHERE customer_id = c.id);
```

`tags = ['legacy_tape_mag']` macht es einfach im Customers-Tab nach diesen Bestandskunden zu filtern (CRM hat schon Tag-Filter).

### B.4 Order-History-Surfacing — Customer-Detail-Page erweitern

**Existing route:** `backend/src/api/admin/customers/[id]/route.ts`

Erweitern um Legacy-Order-History wenn `metadata.legacy_customer_id` gesetzt ist:

```typescript
const legacyId = customer.metadata?.legacy_customer_id
let legacyOrders: any[] = []
if (legacyId) {
  const result = await pg.raw(`
    SELECT o.*, json_agg(json_build_object(
      'product_name', regexp_replace(oi.product_name, '<[^>]+>', '', 'g'),
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'total_price', oi.total_price
    )) AS items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.customer_id = ?
    GROUP BY o.id
    ORDER BY o.ordered_at DESC
  `, [legacyId])
  legacyOrders = result.rows
}

res.json({ customer, stats, addresses, legacyOrders, ... })
```

**Frontend:** Neue Sektion in `backend/src/admin/routes/crm/page.tsx` (Customer-Detail) — „Legacy Tape-Mag Order History" mit Tabelle (Order-Date, Total, Item-Count, Status). Klappbar, lazy-rendered.

### B.5 POS-Search Simplifizierung

Nach B.2-Backfill sind alle Legacy-Customers via `customer`-Tabelle erreichbar. Die in A.2 vorgeschlagene `UNION` wird **obsolete** — die existierende POS-Customer-Search-Route bleibt unverändert (nur `customer` + `customer_stats`).

Es ändert sich nur die **Anzeige** im POS-UI: wenn `customer.metadata.source === 'legacy_tape_mag'`, zeigt die Customer-Card ein „Tape-Mag (since YEAR)"-Badge statt nichts.

### B.6 Brevo Bidirectional Sync verkabeln

**Bestehende Library:** `backend/src/lib/crm-sync.ts` und `backend/src/lib/brevo.ts`. Das Sync-Hook ist da, aber kein Trigger ruft ihn auf — daher `brevo_contact_id` für alle 12 Customers NULL.

**Zu wiring:**

1. **Customer-Create-Hook (Medusa):**
   ```typescript
   // backend/src/subscribers/customer-created.ts
   import { upsertContact } from '../lib/brevo'

   export default async function ({ data, container }) {
     const customer = data.id ? await getCustomer(data.id, container) : null
     if (!customer) return

     await upsertContact({
       email: customer.email,
       attributes: {
         FIRST_NAME: customer.first_name,
         LAST_NAME: customer.last_name,
         CUSTOMER_SEGMENT: 'registered',
         SOURCE: customer.metadata?.source || 'platform',
         LEGACY_CUSTOMER_ID: customer.metadata?.legacy_customer_id,
       },
       listIds: [BREVO_LIST_VOD_AUCTIONS],
     })
   }

   export const config = {
     event: 'customer.created',
   }
   ```

2. **Stats-Update-Hook:** `backend/src/api/admin/customers/recalc-stats/route.ts` (existiert bereits) → nach jedem Stats-Recalc auch Brevo upsert mit aktualisierter `TOTAL_SPENT`/`TOTAL_PURCHASES`/`SEGMENT`.

3. **Backfill-Sync nach B.2:** Einmaliger Brevo-Push für alle 7.890 Stub-Customers + 12 Native. Skript: `scripts/customer_brevo_initial_push.py`. Nutzt Brevo's Batch-Endpoint (50 contacts pro Call) → ~160 API-Calls, läuft <5min.

### B.7 Newsletter-Subscribers-Migration (optional)

`newsletter_subscribers` (3.567 Rows) hat eigentlich nur `email` + `name` + `source` + `legacy_id`. Wenn Email schon in `customer` ist (durch B.2-Backfill), wird die `customer.metadata` einfach ergänzt um `newsletter_subscriber_id`. Wenn Email nicht in `customer` ist (= reine Newsletter-Optin ohne Order-History), wird ein neuer Stub erzeugt mit `metadata.source = 'legacy_brevo_only'`.

```sql
-- Update bestehende Customers mit newsletter_id
UPDATE customer c
SET metadata = c.metadata || jsonb_build_object('newsletter_subscriber_id', ns.id)
FROM newsletter_subscribers ns
WHERE LOWER(c.email) = LOWER(ns.email);

-- Stubs für Pure-Newsletter-Optins (ca. 3.567 - existing matches)
-- Same pattern wie B.2, aber mit source='legacy_brevo_only'
```

### B.8 Tests + Cutover-Checkliste

- [ ] Pre-Migration: snapshot `customer`-Counts pro Source (`metadata->>'source'`)
- [ ] B.0 Migration läuft → `customers` 15.780 → 7.890
- [ ] B.2 Backfill läuft → `customer` 12 → ~7.900 (12 native + 7.890 stubs minus email-overlaps)
- [ ] B.3 Stats-Backfill läuft → `customer_stats` ~7.900 Rows
- [ ] CRM-Tab Customers zeigt 7.900+ Rows mit Tag-Filter `legacy_tape_mag`
- [ ] Top-Spender-Liste im CRM-Dashboard zeigt jetzt Legacy-Kunden mit echten Beträgen
- [ ] Customer-Detail-Page rendert Legacy-Order-History für legacy_customer_id-Customers
- [ ] POS-Search findet `Bonikowski` (Legacy-Match) ohne UNION
- [ ] Brevo bekommt 7.900 Contacts (List 7) — `customer_stats.brevo_contact_id` befüllt
- [ ] Self-Register-Hook: Test-Account mit Legacy-Email → `metadata.legacy_customer_id` automatisch gesetzt

### B.9 Risiken + Mitigationen

| Risiko | Schweregrad | Mitigation |
|---|---|---|
| Backfill-Volume sprengt Free-Plan-Brevo (3.580 + 7.890 = 11.470 Contacts; Brevo Free = 300 Sends/Tag, **kein Contact-Limit unter 100k**) | Niedrig | Pre-Check Brevo Plan-Limits, ggf. paid-tier upgrade |
| Email-Match Edge-Cases (leere Strings, doppelte Emails in Legacy mit unterschiedlichen `legacy_id`s) | Mittel | Pre-Validation-Skript, Reject-Liste, manuelle Resolution |
| Storefront-Login mit Legacy-Email → User landet im Stub statt frischem Account | Mittel | Stub hat `has_account=false` → Auth-Provider muss explizit `customer.has_account = true` setzen + Password-Hash schreiben (existing Code ok, aber smoke-test) |
| FK-Cascade beim Stub-Delete | Mittel | Vor jedem Stub-Delete `customer_stats`/`customer_address`/`customer_audit_log` cleanup oder DEFER |
| `customer.id` ist Medusa-internal, ändert sich nicht — aber `metadata.legacy_customer_id` als integer wird vergessen → JSONB-Type-Cast nötig | Niedrig | Konvention: immer `(metadata->>'legacy_customer_id')::int` in SQL |

### B.10 Was Option B liefert, was A nicht hat

- **Eine** Customer-Tabelle, eine Search-Pfad, eine Detail-Page. Konsistenter Code.
- Top-Spender-Liste im CRM-Dashboard zeigt **echte Beträge** aus 13 Jahren Historie, nicht „€0".
- Marketing-Segmentierung (VIP, Dormant, etc.) greift sofort auf 7.890 statt 12.
- Brevo-Sync ist live → Newsletter-Versand kann auf Plattform-Aktion reagieren (z.B. „Customer X hat erstes Gebot abgegeben → Welcome-Mail").
- Backfill-Stubs sind sofort POS-suchbar, ohne dass Frank erst Touch-Points triggern muss.

---

## Section C — Pre-Launch Invite-System Hardening + Soft-Launch-Strategie

**Ziel:** 300 exklusive Invites sauber technisch abgesichert, missbrauchsresistent, mit kontrollierter Wellen-Öffnung. Bestehendes System auditieren, Lücken schließen, Soft-Launch operationalisieren.

**Status:** Pre-Launch-Mode + 1 Test-Token + 1 Test-Application existieren. Tabellen sind da, Endpoints funktionieren, aber Produkt-Härtung fehlt.

### C.0 Audit — Was existiert, was fehlt

**Vorhanden ✅:**

| Komponente | Status |
|---|---|
| `invite_tokens` Schema (id, token, token_display, application_id, email, issued_by, issued_at, expires_at, used_at, used_ip, status) | ✅ |
| `invite_token_attempts` (audit log, IP + UA + result) | ✅ |
| `waitlist_applications` (18 Spalten inkl. wave, ref_code, referred_by) | ✅ |
| Token-Format `VOD-XXXXX-XXXXX` (10 Base62 mit Separator) | ✅ |
| Token Email-Bound | ✅ |
| One-time-use enforced (`status: active → used`) | ✅ |
| Expiry-Support (`expires_at` Spalte + Check) | ✅ |
| Account-Enum-safe Responses (generic „invalid" für used/expired/missing) | ✅ |
| `POST /store/waitlist` (apply) + `GET /store/waitlist` (count) | ✅ |
| `GET /store/invite/:token` (validate) + `POST /store/invite/:token` (redeem) | ✅ |
| Admin: `/admin/invite-tokens` + `/admin/waitlist` Routes | ✅ |

**Fehlt / unvollständig ❌:**

| Gap | Severity | Beschreibung |
|---|---:|---|
| **`is_invited_user` Flag fehlt** | 🔴 HIGH | Kein Server-side-Check verhindert dass nicht-eingeladene User registrieren oder bieten/kaufen können. Aktuell wird Exklusivität **nur** durch das Storefront-Gate-Password (`beta_test`) bzw. Pre-Launch-Token-URL durchgesetzt — beides leicht zu teilen. Nach `pre_launch → live` Transition fällt **alle** Invite-Bindung weg. |
| **`customer_id` Back-Reference auf `invite_tokens` fehlt** | 🟡 MEDIUM | Nach Redeem keine direkte SQL-Beziehung „dieser Customer kam von diesem Invite". Linkage nur indirekt via Email + `application_id`. Macht Conversion-Funnel-Reports schwer. |
| **API-Level Enforcement bei Bid/Buy fehlt** | 🔴 HIGH | `POST /store/auctions/.../bid` und `POST /store/checkout/...` prüfen nicht ob `customer.is_invited_user = true`. Sobald Auctions live sind, kann jeder mit Account bieten. |
| **Magic-Link Login fehlt** | 🟡 MEDIUM | Aktuell Password-only. Berater empfiehlt Magic-Link für Early-Phase-UX (kein Passwort-Vergessen-Loop). |
| **Wellen-UI fehlt** | 🟡 MEDIUM | `waitlist_applications.wave` (int) Spalte existiert, aber kein Admin-UI um „alle Wave-1 approven" oder „nächste 100 nach `total_spent` einladen" zu klicken. |
| **`referred_by` nicht wired** | 🟢 LOW | Spalte da, aber Zähler immer 0. Falls Phase-2-Strategie „jeder darf 2 Leute einladen" gefahren wird, muss Storefront `?ref=XYZ` aus Apply-URL parsen und ins POST-Body packen. |
| **Rate-Limiting fehlt** | 🟡 MEDIUM | `invite_token_attempts` loggt nur, blockt nicht. Brute-Force auf Token möglich (theoretisch — 62^10 ist groß, aber Login + `/apply` brauchen IP-basierte Throttle). |
| **Brevo-Integration für `waitlist_applications` fehlt** | 🟢 LOW | Apply schreibt nur in DB. Keine Brevo-Liste „Waitlist". Frank kann nicht mit Wartelistenern kommunizieren. |
| **Phase-2-Öffnungs-Mechanismus** | 🟢 LOW | Keine Logik für „User darf jetzt 2 Leute einladen" oder „täglich 50 Auto-Approves". Kann später als Workstream nachgezogen werden. |

### C.1 Schema-Erweiterungen (eine Migration)

**Migration:** `backend/src/scripts/migrations/2026-04-25-invite-hardening.sql`

```sql
-- (1) is_invited_user Flag auf customer.metadata
-- Kein DB-Change — wir nutzen metadata.is_invited_user (boolean).
-- Wert wird beim Invite-Redeem gesetzt.

-- (2) customer_id Back-Reference auf invite_tokens
ALTER TABLE invite_tokens ADD COLUMN customer_id text NULL;
ALTER TABLE invite_tokens ADD CONSTRAINT invite_tokens_customer_id_fk
  FOREIGN KEY (customer_id) REFERENCES customer(id) ON DELETE SET NULL;
CREATE INDEX idx_invite_tokens_customer_id ON invite_tokens(customer_id);

-- (3) Convenience-Index für is_invited_user-Lookups
CREATE INDEX idx_customer_is_invited
  ON customer ((metadata->>'is_invited_user'))
  WHERE deleted_at IS NULL;

-- (4) Invite-Quota für Phase-2 (jeder darf N Leute einladen)
ALTER TABLE customer ADD COLUMN invite_quota int DEFAULT 0;
ALTER TABLE customer ADD COLUMN invites_sent int DEFAULT 0;

-- (5) Magic-Link-Tokens (separate Tabelle, kurzes TTL)
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id text PRIMARY KEY,
  token text NOT NULL UNIQUE,
  customer_id text NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  ip text NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_magic_link_tokens_customer ON magic_link_tokens(customer_id);
CREATE INDEX idx_magic_link_tokens_expires ON magic_link_tokens(expires_at);
```

### C.2 Server-Side Enforcement — der zentrale Hardening-Schritt

**Neuer Helper:** `backend/src/lib/access-gate.ts`

```typescript
import { Knex } from 'knex'

export type AccessGateResult =
  | { allowed: true }
  | { allowed: false; reason: 'not_invited' | 'no_account' | 'platform_locked' }

export async function canBidOrBuy(
  pg: Knex,
  customerId: string | null
): Promise<AccessGateResult> {
  if (!customerId) return { allowed: false, reason: 'no_account' }

  const customer = await pg('customer')
    .where({ id: customerId })
    .whereNull('deleted_at')
    .first()

  if (!customer) return { allowed: false, reason: 'no_account' }

  // Read platform-mode (cached 5min, see existing site-config helper)
  const mode = await getPlatformMode(pg)

  // Live mode: alle dürfen
  if (mode === 'live') return { allowed: true }

  // Pre-launch / preview: nur Eingeladene
  if (mode === 'pre_launch' || mode === 'preview' || mode === 'beta_test') {
    const isInvited = customer.metadata?.is_invited_user === true
    if (!isInvited) return { allowed: false, reason: 'not_invited' }
    return { allowed: true }
  }

  return { allowed: false, reason: 'platform_locked' }
}
```

**Aufruf in allen Bid/Buy-Endpoints:**

```typescript
// backend/src/api/store/auctions/[blockSlug]/items/[itemId]/bid/route.ts
const gate = await canBidOrBuy(pg, customerId)
if (!gate.allowed) {
  res.status(403).json({
    success: false,
    code: gate.reason,
    message: gate.reason === 'not_invited'
      ? 'Bidding is currently invite-only. Join the waitlist to apply.'
      : 'Authentication required'
  })
  return
}
```

**Endpoints mit Pflicht-Gate:**
- `POST /store/auctions/.../bid` (auction bid)
- `POST /store/auctions/.../proxy-bid` (proxy bid)
- `POST /store/checkout` (direct purchase)
- `POST /store/cart/.../checkout` (cart checkout)
- `POST /store/account/saved` (Wishlist — optional, je nach UX-Decision)

**Frontend-Pendant:** Storefront ruft `GET /store/account/access-status` (neu), bekommt `{can_bid: true/false, reason: ...}` — Bid-Button + Buy-Button werden serverside-rendered je nach Wert disabled mit Tooltip „Invite-only — apply for access".

### C.3 Invite-Redeem setzt `is_invited_user`-Flag

**Erweiterung:** `backend/src/api/store/invite/[token]/route.ts` POST

Nach erfolgreichem Customer-Create:

```typescript
// In Transaction
await pg('customer')
  .where({ id: newCustomer.id })
  .update({
    metadata: JSON.stringify({
      ...(newCustomer.metadata || {}),
      source: 'platform',
      is_invited_user: true,
      invite_id: invite.id,
      invited_at: new Date().toISOString(),
    }),
    updated_at: new Date(),
  })

await pg('invite_tokens')
  .where({ id: invite.id })
  .update({
    status: 'used',
    used_at: new Date(),
    used_ip: ip,
    customer_id: newCustomer.id,    // (NEU — siehe C.1)
  })

await pg('waitlist_applications')
  .where({ id: invite.application_id })
  .update({ status: 'registered', registered_at: new Date() })
```

**Invariant:** Jeder `customer` der via Invite-Flow entstand, **muss** `metadata.is_invited_user = true` haben. Backfill für bestehende 12 Customers (alle Test-Accounts) machen wir separat — entweder alle als invited markieren (Phase-1-Test-User dürfen weiter bieten) oder explizit auf false setzen.

### C.4 Magic-Link Login — empfohlen für Early-Phase

Ergänzung zur bestehenden Email/Password-Auth, kein Replacement. User wählt zwischen beiden auf der Login-Seite.

**Flow:**
```
POST /store/auth/magic-link/request
  body: { email }
  → SELECT FROM customer WHERE LOWER(email)=? AND has_account=true
     → Match: INSERT magic_link_tokens (id, token, customer_id, expires_at=NOW+15min)
              + Mail mit Link https://vod-auctions.com/magic/{token}
     → Sonst: generic „If we have an account, you'll receive a link"
       (account-enum-safe — selbe Logik wie Forgot-Password)

GET /magic/:token (Storefront-Page)
  → POST /store/auth/magic-link/redeem { token }
     → SELECT FROM magic_link_tokens WHERE token=? AND used_at IS NULL AND expires_at > NOW()
        Match: Session-Cookie setzen (selbe Mechanik wie normaler Login)
                + UPDATE used_at=NOW()
        Else: redirect zu /account/login mit Error
```

**Token-Eigenschaften:**
- 32-char URL-safe Base64 (256 bit Entropy)
- TTL 15min (Sender will sofort klicken)
- One-time-use
- IP-Logging im used_ip
- Rate-Limit: max 3 Requests pro Email/15min (siehe C.6)

**File-Touches:**
- `backend/src/api/store/auth/magic-link/request/route.ts` (neu)
- `backend/src/api/store/auth/magic-link/redeem/route.ts` (neu)
- `backend/src/lib/magic-link.ts` (neu — Token-Gen + Email-Template)
- `storefront/src/app/account/login/page.tsx` — „Email me a magic link" Button als Alternative
- `storefront/src/app/magic/[token]/page.tsx` (neu) — Auto-Redeem-Page

### C.5 Admin-UI — Invite-Wellen + Bulk-Approve

**Erweiterung:** `backend/src/admin/routes/waitlist/page.tsx` — neuer Tab „Waves":

- Liste aller Wartelistenger gruppiert nach `wave` (NULL = unwaved)
- Filter „Sort by `referrer_info` length, `country`, `genres`-overlap, `buy_volume`"
- Bulk-Action: „Assign Wave 1" auf selektierte Rows
- Bulk-Action: „Approve + Issue Invites" auf Wave-N → erzeugt invite_tokens für alle, setzt waitlist.status=approved, setzt invited_at
- CSV-Export der ausgewählten Wave (für externe Mail-Tools, falls nötig)

**Strategische Empfehlung (Soft-Launch):**
- **Wave 1** (nach Launch+0): Top-100 nach `legacy_customers.total_spent` (4.465 Bestandskäufer existieren — auswählbar nach Bridge-A.0/B.2). Diese kommen mit „Hello again, you're invited" Mail.
- **Wave 2** (Launch+7d): Nächste 100 nach Order-Recency (last 24 months).
- **Wave 3** (Launch+14d): Top-100 Wartelisten-Applications nach `referrer_info`-Score (manuelle Kuration).
- **Wave 4+** (Launch+21d): Auf Performance-Feedback reagieren — entweder weitere kuratierte Wellen oder einzelne Auto-Approve-Schwellen.

### C.6 Rate-Limiting — IP- und Email-basiert

Aktuell loggt `invite_token_attempts`, blockt aber nicht. Wir brauchen Throttle auf:

- `POST /store/waitlist` — max 3 Submits pro IP/Tag
- `POST /store/invite/:token` (redeem) — max 5 Versuche pro IP/15min
- `POST /store/auth/magic-link/request` — max 3 pro Email/15min, max 10 pro IP/15min
- `POST /store/customers/password-reset` — selbe Limits wie Magic-Link

**Implementierung:** `@upstash/ratelimit` (existiert schon im Storefront für Bid-Throttling). In Storefront als Edge-Middleware oder im Backend als Middleware vor den Route-Handlern. Existing UPSTASH_REDIS_REST_URL bleibt.

**File-Touches:**
- `backend/src/api/middlewares.ts` — Rate-Limit-Middleware mit Routen-Pattern-Matching
- `backend/src/lib/rate-limit.ts` (neu) — Wrapper um @upstash/ratelimit für Backend

### C.7 Phase-2 Öffnung (deferred — nicht Tag 1)

**Option α — Auto-Pulse aus Waitlist:**
Cron `daily-09:00` approved die ältesten N pending-Applications, generiert Tokens, sendet Mails. Steuerbar via `site_config.features.WAITLIST_AUTO_APPROVE_PER_DAY` (default 0 = OFF).

**Option β — User-Driven Invites:**
Jeder eingeladene Customer bekommt `invite_quota = 2` nach 30d Aktivität (= mind. 1 Bid oder 1 Order). Eigene Page `/account/invite-friends` zeigt verbleibende Slots. Send-Mechanik: Customer trägt Email + optional Nachricht ein, System generiert invite_token mit `issued_by = customer.id` und `application_id = NULL` (= direkt invited, ohne Waitlist).

**Option γ — Soft-Open:**
`platform_mode → 'preview'` lässt jeden browsen + Account anlegen + zur Waitlist hinzufügen. Bid/Buy bleiben gegated bis Wave-Approve. Verlinkbar mit Marketing-Kampagnen (jeder Klick auf eine Auction-URL führt zur Apply-Page mit Pre-Filled-Email).

Empfehlung: **Option β nach 4 Wochen Live**. Macht den Soft-Launch viral ohne dass das Backend komplett aufgemacht werden muss. Option α kann parallel laufen.

### C.8 Brevo-Integration (Phase 2)

Drei Brevo-Listen für getrennte Lifecycle-Phasen:

| Brevo-List-ID | Name | Inhalt | Pflege |
|---|---|---|---|
| 5 | tape-mag (existing) | 3.580 Legacy-Newsletter, Read-Only-Archiv | Manuell, nicht mehr beschrieben |
| 7 | vod-auctions (existing) | Aktive Newsletter-Subscribers (post-DOI) | Bidirectional via B.6 |
| **NEU: List X** | vod-auctions-waitlist | Waitlist-Applicants (status=pending) | One-way (Apply → Brevo), nach Approve verschoben in List 7 |

**Trigger-Hooks:**
- Apply-Submit → Brevo upsert in List X mit Attributen `WAITLIST_WAVE`, `WAITLIST_BUYVOLUME`, `WAITLIST_GENRES`
- Wave-Approve → Move from List X → List 7, `STATUS=invited`
- Invite-Redeem → `STATUS=registered`, `LIFECYCLE=customer`

### C.9 Smoke-Test-Checkliste

Vor Wave-1-Sendung:

- [ ] C.1 Migration läuft sauber (idempotent test mit 2× Run)
- [ ] C.2 `canBidOrBuy()` retourniert `not_invited` für non-invited Test-Account
- [ ] C.3 Invite-Redeem setzt `is_invited_user=true` UND `invite_tokens.customer_id` UND `waitlist_applications.status=registered`
- [ ] C.4 Magic-Link funktioniert (3-Step: request → email → redeem-page → Login-State)
- [ ] C.5 Admin-Wave-Bulk-Approve generiert für 10 Test-Apps 10 Tokens UND 10 Mails
- [ ] C.6 Rate-Limit: 4. Apply-Submit aus selber IP wird mit HTTP 429 abgelehnt
- [ ] C.8 Brevo: Submit auf `/apply` erscheint in Brevo List X innerhalb 30s

### C.10 Was Section C NICHT macht

- Kein Telefonnummer-/Adressen-Verify (Berater-Vorschlag, übersteigt Phase-1-Scope)
- Keine Domain-Whitelist (z.B. „nur .de-Adressen") — schließt internationale Käufer aus
- Kein Captcha auf Apply (kann mit Cloudflare-Turnstile später nachgezogen werden, falls Bot-Spam ausartet)
- Kein 2FA für Login

### C.11 Aufwand + Reihenfolge

| Block | Aufwand | Reihenfolge | Blocker |
|---|---:|---|---|
| C.1 Migration | 30min | Vor allem | — |
| C.2 + C.3 Enforcement + Redeem-Flag | 4h | Direkt danach | C.1 |
| C.6 Rate-Limit | 2h | Parallel | — |
| C.5 Admin-Wave-UI | 6h | Vor Wave-1-Sendung | C.1, C.3 |
| C.4 Magic-Link | 4h | Vor Wave-1-Sendung empfohlen | C.1 |
| C.8 Brevo-Integration | 3h | Vor Wave-1, kann notfalls nachgezogen | — |
| C.7 Phase-2 (β) | 8h | Launch+4w | C.2, C.3 |

**Summe Phase 1 (Wave 1 ready):** ~20h Code = **3 Tage**.

---

## Vergleich + Empfehlung

| Aspekt | Option A | Option B | Section C |
|---|---|---|---|
| Aufwand | ~3 Tage | ~2 Wochen | ~3 Tage Phase 1 |
| Daten-Sichtbarkeit | Eigene UI für Legacy, parallel zu Native | Vereint in bestehender CRM-UI | Bestehende Admin-Routes (Waitlist + Invites) erweitert |
| Konversions-Tracking | On-Touch (POS-Checkout, Self-Register) | Proaktiv via Backfill | Hart enforced (`is_invited_user`-Gate auf Bid/Buy-API) |
| Top-Spender-Reports | Brauchen JOIN über zwei Tabellen | Out-of-the-box korrekt | n/a |
| Brevo-Sync | Bleibt Read-Only | Bidirectional verkabelt | Drei-Listen-Modell (tape-mag / vod-auctions / waitlist) |
| Risiko | Niedrig (additiv) | Mittel | Niedrig (additiv + Migration idempotent) |
| Reversibilität | Stub-Identifikation einfach | Stubs identifizierbar | Flag droppable, Tokens via Status revoke'bar |
| Marketing-Wert | Mittel | Hoch | Hoch (Wellen-Mechanik + Funnel-Tracking) |
| Launch-Blocker? | Nein | Nein | **Ja** — ohne C kann kein controlled Soft-Launch passieren |

### Reihenfolge

**Empfehlung: C zuerst, dann A, dann B.**

**Begründung:**
- **C ist Launch-Blocker.** Ohne `is_invited_user`-Server-Enforcement (C.2) sind die Bid/Buy-Endpoints nicht sicher gegen einen User der via Self-Register reinkommt. Das **muss** vor RSE-294 (Erste öffentliche Auktionen) live sein.
- **A liefert sofort Wert für Wave 1.** Wenn C live ist und Wave 1 die Top-100 nach `legacy_customers.total_spent` ansprechen soll, brauchen wir A.0+A.1 um diese überhaupt im Admin sehen + sortieren zu können. Forgot-Password-Flow (A.5.3) und Bridge-Helper (A.5.7) liefern den kanonischen Reaktivierungs-Pfad — kritisch für Wave-1-Conversion.
- **B kann auf unbestimmte Zeit warten.** Option A's `metadata.legacy_customer_id`-Pattern ist **vorwärtskompatibel** mit B's Backfill-Schema. Wenn nach 4 Wochen Live klar wird dass „CRM zeigt €0 statt €1.38M" zu schmerzhaft ist, kann B nachgezogen werden ohne A-Code zu ändern.

### Sprint-Vorschlag

| Sprint | RC-Range | Inhalt | Aufwand |
|---|---|---|---|
| Sprint C1 | rc52.0–rc52.3 | C.1 Migration, C.2 Access-Gate, C.3 Redeem-Flag, C.6 Rate-Limit | ~3 Tage |
| Sprint A1 | rc52.4–rc52.6 | A.0 Customers-Dedup, A.1 Legacy-API, A.2 POS-Search-UNION | ~2 Tage |
| Sprint A2 | rc53.0–rc53.2 | A.3 Auto-Stub, A.4 Admin-Tab Tape-Mag, A.5.3 Forgot-Password | ~2 Tage |
| Sprint C2 | rc53.3–rc53.5 | C.4 Magic-Link, C.5 Admin-Wave-UI, C.8 Brevo-Waitlist-Liste | ~2 Tage |
| **Wave 1 GO** | nach C2 | RSE-78 AGB-Anwalt + Re-DOI-Decision parallel | — |
| Sprint B (deferred) | rc55+ | B.1-B.7 Backfill + Bidirectional-Sync | ~2 Wochen |

**Total Phase 1 (vor Wave 1):** ~9 Tage Code + 1 Tag QA + 1 Tag Deployments-Buffer = **~2 Arbeitswochen**.

---

## Open Decisions

1. **Newsletter-Subscribers-Tabelle:** Cleanup oder belassen? Aktuell unsichtbar, Brevo hat dieselbe Liste.
2. **`customers` (Plural) Lifecycle:** Nach B-Backfill — Read-Only-Archiv oder Drop nach 90 Tagen? FK auf `orders` muss bleiben → Drop nicht trivial.
3. **Stub-VIP-Threshold:** B.3 nimmt €500 als VIP-Schwelle. Frank's Definition?
4. **Brevo-Plan:** Aktueller Free-Tier reicht für 11k Contacts? (Sends/Tag-Limit checken)
5. **Email-Casing:** `customers.email` enthält gemischte Casings. Migration auf `LOWER()` als kanonisch?
6. **Re-DOI für Brevo List 5 (3.580):** Anwalt-Frage. Carry-Over-OK oder Re-DOI-Pflicht? Geht in RSE-78-Scope.
7. **Wave-1-Strategie:** Top-100-`total_spent` Bestandskunden ODER Top-100 Wartelistenger nach Apply-Quality? Empfehlung: Bestandskunden zuerst (höhere Conversion-Wahrscheinlichkeit + bessere Conversion-Story für Tag-1-Reports).
8. **Magic-Link-Default an/aus:** Soll Magic-Link als Default-Login (Email-Field, dann optional Password) oder als sekundäre Option neben Password? Empfehlung: sekundär — Magic-Link-Mails landen oft im Spam.
9. **Test-Account-Backfill:** Die 12 bestehenden `customer`-Rows sind alle Test-Accounts (`bidder1@test.de` etc.). Sollen die `is_invited_user=true` bekommen oder explizit abgesetzt werden? Empfehlung: alle auf `true` setzen damit Tests weiterlaufen, aber `metadata.is_test_account=true` als zusätzlicher Marker für Reports.
10. **`platform_mode='preview'`-Use-Case:** Soft-Open (Browse + Apply, kein Bid) — wollen wir das überhaupt? Wenn ja, muss C.2 Access-Gate auch `'preview'` als „Bid/Buy gegated, Browse offen" behandeln.

---

## Verwandte Docs (zu erstellen / pflegen)

- [`docs/architecture/CUSTOMER_LIFECYCLE.md`](../architecture/CUSTOMER_LIFECYCLE.md) — verbindliche UX-Wording-Referenz für die 6 Online-Flows + Bridge-Logik (Pflicht-Lektüre für Storefront-Devs)
- [`docs/architecture/INVITE_FLOW.md`](../architecture/INVITE_FLOW.md) — operative Spec für das gehärtete Invite-System inkl. Wave-Handling (TODO)
- `docs/TODO.md` Workstream „CRM-Bridge + Pre-Launch-Hardening" mit Sprint-Tabelle aus oben

---

**Vorgeschlagener nächster Schritt:** Sprint C1 (rc52.0-rc52.3) als ersten Workstream in `docs/TODO.md` aufnehmen. C.1-Migration vorbereiten + auf Supabase-Branch oder lokal smoke-testen. Anwalt-Tickets (Re-DOI Brevo List 5, AGB) parallel zu RSE-78 vorantreiben — die brauchen Lead-Time und blockieren Wave 1.
