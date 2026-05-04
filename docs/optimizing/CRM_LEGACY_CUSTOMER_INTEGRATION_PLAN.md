# CRM Legacy Customer Integration Plan

**Status:** Planung (2026-04-25 · Sektionen D–H erweitert 2026-05-03 · Cross-Reference-Sweep 2026-05-03)
**Ziel:** **Aus allen verfügbaren Legacy-Quellen einen einheitlichen, tiefen Customer-View bauen** — und damit die ~5–7 Jahre Beziehungs-Historie nutzbar machen, die in PDFs, MySQL-DBs und Frank's Postfächern verteilt liegen. Das Vorhandene konsolidieren, **nicht** mit Brave/Discogs/o.ä. neu anreichern. Auf dieser Basis Wellen-Launch (siehe `PRE_LAUNCH_KONZEPT.md`) fahren — verfeinert um Tier-basierte Reihenfolge innerhalb der Wellen.

> **Wichtige Klarstellung (2026-05-03):** vod-auctions.com ist **noch nicht live** — keine echten Kunden, keine echten Transaktionen. Die 12 `customer`-Rows + 21 Brevo-List-7-Kontakte sind alle Test/Dev. **Alle echten Bestandsdaten kommen aus Legacy:**
> - **Brevo List 5** (3.580 Kontakte, „tape-mag") — wurde 2026-03-22 aus tape-mag.com importiert
> - **`vodtapes.3wadmin_extranet_user`** (3.632 Members) — tape-mag.com Member-Login
> - **`maier_db1/11/2013.3wadmin_shop_kunden`** (~14.214 Customers + 17.315 Adressen) — vod-records.com / vinyl-on-demand.com Webshop-Bestand
> - **10.575 MO-PDFs** (2019-2026) — Buchhaltungs-Sicht über alle Kanäle (Online + Telefon + Messen + POS)
> - **80-120k IMAP-Mails** in zwei Frank-Postfächern — 5-7 Jahre Customer-Korrespondenz
>
> **Konsequenz:** Das gesamte Tier-Modell (Section G) wird aus diesen Legacy-Quellen gespeist, nicht aus vod-auctions-eigenen Bestelldaten. Bevor der erste echte Kunde auf vod-auctions kauft, muss der Master-Resolver (Section H) ein konsolidiertes Bild der Bestandskunden produziert haben — sonst startet der erste Live-Kunde mit leerer Tier-Klassifikation.
**Quelle:** Analyse-Session 2026-04-25 (CRM-Tab-Audit + Schema-Investigation via Supabase MCP) · Codex-Analyse 2026-05-03 ([`Monkey Office/rechnungs-extraktion-crm-konzept.md`](../../Monkey%20Office/rechnungs-extraktion-crm-konzept.md))
**Verwandte Docs:**
- [`docs/architecture/CRM_SYSTEM_VOD_AUCTIONS.md`](../architecture/CRM_SYSTEM_VOD_AUCTIONS.md) — **IST-Zustand**: bestehende `customer_stats`-Tabelle, Subscriber, Brevo-Sync, Admin-`/app/crm` (P1 produktiv seit 2026-03-30)
- [`docs/architecture/CRM_CUSTOMER_MANAGEMENT_KONZEPT_2026.md`](../architecture/CRM_CUSTOMER_MANAGEMENT_KONZEPT_2026.md) — strategisches Konzept (P1 done, P1.5 Rudderstack offen, P2 Notes/Tags offen, P3 Growth offen)
- [`docs/architecture/LEGACY_MYSQL_DATABASES.md`](../architecture/LEGACY_MYSQL_DATABASES.md) — vollständiges Legacy-DB-Inventar (vodtapes, maier_db1/11/2013)
- [`Monkey Office/rechnungs-extraktion-crm-konzept.md`](../../Monkey%20Office/rechnungs-extraktion-crm-konzept.md) — Codex-Konzept PDF-Extraktion + IMAP-Match
- [`POS_WALK_IN_KONZEPT.md`](POS_WALK_IN_KONZEPT.md), [`POST_AUCTION_MARKETING_FUNNEL.md`](POST_AUCTION_MARKETING_FUNNEL.md)
- Code: `backend/src/lib/crm-sync.ts`, `backend/src/lib/brevo.ts`, `backend/src/jobs/customer-stats-recalc.ts`, `backend/src/subscribers/customer-created.ts`

**Verzahnung mit bestehender Infrastruktur (Pflicht-Lektüre vor Implementation):**

Dieser Plan steht **nicht** im luftleeren Raum. Folgendes ist im Codebase bereits implementiert (Code-Stand 2026-05-03 — wartet aber auf echte Daten, weil vod-auctions.com nicht live ist):

**Pflicht-Doks vor Plan-Lektüre:**
1. [`PRE_LAUNCH_KONZEPT.md`](../PRE_LAUNCH_KONZEPT.md) — **Wellen-Strategie ist hier konkret** (4 Wellen + Wartelisten-Schema + Token-Format + E-Mail-Templates). Section C+G dieses Plans **erweitert** das nur um Tier-Sortierung **innerhalb** Welle 1, ersetzt nichts.
2. [`USER_MANAGEMENT_KONZEPT_2026.md`](../architecture/USER_MANAGEMENT_KONZEPT_2026.md) — **P1-P3-Plan für Customer-Detail-Drawer** (Edit-Stammdaten, Tags, `customer_note`, Activity-Timeline, `customer_audit_log`, Account-Sperre). Section A.4 dieses Plans hängt sich daran an.
3. [`CRM_SYSTEM_VOD_AUCTIONS.md`](../architecture/CRM_SYSTEM_VOD_AUCTIONS.md) — IST-Zustand (`customer_stats`, Recalc-Cron, 2-Tab-CRM, GDPR-Export).
4. [`CRM_CUSTOMER_MANAGEMENT_KONZEPT_2026.md`](../architecture/CRM_CUSTOMER_MANAGEMENT_KONZEPT_2026.md) — Strategisches Konzept + Marktvergleich.
5. [`marketing/Email-Content.md`](../marketing/Email-Content.md) — alle E-Mail-Templates (Welcome, Outbid, Won, Payment, Shipping, Feedback + 4 Newsletter-Stages).
6. [`RUDDERSTACK_SETUP.md`](../architecture/RUDDERSTACK_SETUP.md) — Setup-Guide (NICHT live, Backlog).
7. [`LEGACY_MYSQL_DATABASES.md`](../architecture/LEGACY_MYSQL_DATABASES.md) — vollständiges Legacy-DB-Schema-Inventar.

**Bereits im Codebase (Phase-1-Done):**

| Komponente | Datei | Was es macht |
|---|---|---|
| `customer_stats` Tabelle | Migration live in Supabase | `total_spent`, `total_purchases`, `total_bids`, `total_wins`, `last_*_at`, `tags TEXT[]`, `is_vip`, `is_dormant`, `updated_at` — **noch leer, weil keine echten Customers** |
| Recalc-Cron | `backend/src/jobs/customer-stats-recalc.ts` | Stündlicher Job — aggregiert aus `transaction` + `bid`, setzt `is_vip=true` ab `total_spent>=500`, `is_dormant=true` ab `last_purchase_at<-90d` |
| 6 weitere Cron-Jobs | `backend/src/jobs/` | `auction-lifecycle.ts`, `bid-ending-reminder.ts`, `feedback-email.ts`, `newsletter-sequence.ts`, `payment-deadline.ts`, `watchlist-reminder.ts` |
| Customer-Created Subscriber | `backend/src/subscribers/customer-created.ts` | Idempotenter `customer_stats`-Insert + `crmSyncRegistration()` für jede neue `customer`-Row (egal ob Storefront-Signup oder Admin-Create) |
| Invite-Created Subscriber | `backend/src/subscribers/invite-created.ts` | Sendet automatisch Invite-Mail via Notification Module bei `invite.created`/`invite.resent` |
| Password-Reset Subscriber | `backend/src/subscribers/password-reset.ts` | Reset-Mail-Flow |
| Brevo-Sync (outbound) | `backend/src/lib/crm-sync.ts` | 5 Lifecycle-Funktionen (Registration, Bid, Won, Payment, Shipping) — alle fire-and-forget |
| **Brevo-Webhook (inbound)** | `backend/src/api/webhooks/brevo/route.ts` | Bidirectional schon teilweise live: handelt `unsubscribed`, `hardBounce`, `softBounce`, `complaint`, `delivered`, `opened`, `click` — **bidirectional Brevo-Sync ist also nicht greenfield** |
| Manual-Brevo-Sync per Customer | `backend/src/api/admin/customers/[id]/brevo-sync/route.ts` | Force-Resync-Button im Customer-Detail |
| Admin-CRM | `backend/src/admin/routes/crm/page.tsx` | 2 Tabs: „Overview" (Brevo-Aggregate) + „Customers" (lokale Liste mit Search/Filter/Sort) + Customer-Detail-Drawer |
| Newsletter-Admin | `backend/src/admin/routes/newsletter/`, `backend/src/api/admin/newsletter/` | Newsletter-Block-Sequenz-Verwaltung |
| Waitlist-Admin | `backend/src/admin/routes/waitlist/`, `backend/src/api/admin/waitlist/` | Wartelisten-Approval (Welleneinteilung manuell) |
| Invite-Token-Admin | `backend/src/admin/routes/invite-tokens/` (geplant), `backend/src/api/admin/invite-tokens/` | Token-Management |
| Pre-Launch-Schema | `waitlist_applications` + `invite_tokens` + `invite_token_attempts` | **Wave-Feld + Source-Feld + Ref-Code schon im Schema** (siehe `PRE_LAUNCH_KONZEPT.md` §5.1) |
| Store-Routes | `backend/src/api/store/{newsletter,invite,waitlist,account/{newsletter,gdpr-export,send-welcome}}` | Storefront-CRM-Endpoints |
| GDPR-Export | `/store/account/gdpr-export` | JSON-Download mit Profil + Orders + Bids + Saved-Items |
| **Brevo-Listen (echte Daten)** | List 5 (`tape-mag`, **3.580 — echte Bestandskunden seit 2026-03 Import**) | Hauptdatenquelle für Welle 1 nach `PRE_LAUNCH_KONZEPT.md` |
| **Brevo-Listen (Test-Daten)** | List 4/7 (`vod-auctions`, ~21 — alle Test/Dev) | nicht für echtes Marketing nutzbar bis Launch |

**Folge für diesen Plan:**
- **Section A (Surface & Bridge)** ergänzt einen DRITTEN Tab „Tape-Mag Legacy" zu den bestehenden „Overview" + „Customers" — keine neue Admin-Route bauen. Edit-Funktionen, Tags, Notes folgen `USER_MANAGEMENT_KONZEPT_2026.md` P1
- **Section C (Pre-Launch-Hardening)** ergänzt nur die **Server-Side-Enforcement** (`is_invited_user`-Gate auf Bid/Buy) und Rate-Limiting zu dem bereits existierenden Wartelisten-/Invite-Token-System aus `PRE_LAUNCH_KONZEPT.md`. Schema (`waitlist_applications` + `invite_tokens`) ist **schon da**, Welleneinteilung ist **schon definiert**
- **Section G (Tiering)** ERWEITERT `customer_stats` mit `tier`, `lifetime_revenue_decayed`, `tier_calculated_at` — keine neue Tabelle. Existierender Recalc-Cron wird um Tier-Berechnung erweitert. `is_vip`-Schwelle €500 wird durch Bronze/Silver/Gold/Platinum-Schwellen ergänzt (nicht ersetzt — `is_vip` bleibt als Boolean kompatibel). **Tier-Sortierung ist eine Verfeinerung von Welle 1** in `PRE_LAUNCH_KONZEPT.md` (welche Tape-mag-Bestandskäufer kommen zuerst dran), keine Ersetzung der Wellen-Logik
- **Section A.5.1 (Self-Register-Bridge)** hängt sich an den bestehenden `customer-created.ts`-Subscriber an — nicht parallel
- **Brevo-Bidirectional (B.6)** ist Erweiterung von `crm-sync.ts` + `webhooks/brevo`, nicht neues Modul. **Inbound (Unsubscribe/Bounce) ist schon live**
- **Rudderstack-Integration** (R1-R4 aus dem alten Plan, dokumentiert in `RUDDERSTACK_SETUP.md`) ist Phase 2 dieses Plans — bleibt offen, kein Launch-Blocker

---

## Kontext: Was gerade existiert

### Datensilo-Übersicht — sieben Quellen, keine vereinte Sicht

**Online (bereits in unserer DB):**

| Quelle | Wo | Zeilen | Was drin | Im Admin sichtbar? |
|---|---|---:|---|---|
| **Brevo List 5** (`tape-mag`) | Brevo Cloud (live API) | 3.580 | Migrierte tape-mag-Newsletter-Kontakte mit `CUSTOMER_SEGMENT`/`TOTAL_SPENT`-Attributen | Nur Dashboard-Karte + 50 jüngste in „Recent CRM Contacts" |
| **Brevo List 7** (`vod-auctions`) | Brevo Cloud (live API) | 21 | Plattform-Newsletter-Optins | Nur Dashboard-Karte |
| **`customer`** (Medusa-native, text PK) | Unsere DB | 12 | Plattform-registrierte Accounts (alle `has_account=true`, alle `<90d`) | **Customers**-Tab in `/admin/crm` zeigt alle 12 |
| **`customers`** (Legacy, int PK) | Unsere DB | 15.780 / 7.890 unique | tape-mag Kunden-Stammdaten + 9.393 Adressen | **Nirgendwo** |
| **`orders`** (Legacy) | Unsere DB | 7.881 | Historische Bestellungen 2013-2026, **€1.38M GMV**, 12.899 Line-Items | **Nirgendwo** |
| **`newsletter_subscribers`** (Legacy) | Unsere DB | 3.567 | Lokale Spiegelkopie der tape-mag-Newsletter | **Nirgendwo** |

**Bisher unerschlossen (außerhalb unserer DB):**

| Quelle | Wo | Volumen | Was drin | Status |
|---|---|---:|---|---|
| **MonKey-Office-Rechnungen** (PDF) | `Monkey Office/Rechnungen/<Jahr>/*.pdf` (lokal) | **10.575 PDFs**, 2019-2026 | Vollständige Kunden-/Adressdaten + Rechnungspositionen + Beträge — Buchhaltungs-Sicht über alle Kanäle (Online + Telefon + Messen + POS) | Stabiles Layout, `pdftotext` funktioniert für alle, **keine OCR nötig**. Codex-Konzept liegt vor (Section D) |
| **`vodtapes` MySQL** (= **tape-mag.com + record-price-guide.org** Member-CMS) | dedi99.your-server.de (IP `213.133.106.99`). 1Password Work: `Legacy MySQL tape-mag` (`eajngb2kdtjlkaw7ztrf45xupe`), MySQL R/O über User `maier1_2_r` aus Item `s5e7ebssyfyvtx4n3ehqirjtem`. FTP-Backup: `lpqjisznyhropc7q5c6cqgscue` | **Catalog:** 30.179 Releases · 12.455 Artists · 3.081 Labels · 1.982 Press & Org (= Quelle der bestehenden 41.529 Releases in unserer Supabase via `legacy_sync_v2.py`). **Members:** 3.632 in `3wadmin_extranet_user` | tape-mag CMS mit Member-Login (kein Kassen-Shop). Catalog-Tabellen `3wadmin_tapes_*` + Member-Login `3wadmin_extranet_user`. **Keine** `3wadmin_shop_*`-Kassentabellen | Catalog seit 2026-04 in Supabase via `legacy_sync_v2.py` cron, Members noch nicht in CRM importiert |
| **`maier_db1`/`maier_db11`/`maier_db2013` MySQL** (= **vod-records.com + vinyl-on-demand.com** Webshop) | dedi99.your-server.de (gleiche IP). 1Password Work: SSH `u74qt347j7myu7sqmgy4vcwzn4`, db1 `bxedowvg33lzphnmrvty56j5zy`, db11 `hox5f3mgfezjzeca3b5d45c3yq`, db2013 `ml4lcccpje4ocgxxvnjrojbtlm` | Discovery 2026-05-03: db1 3.114 Customers · db11 2.556 (Schema-identisch mit db1, vermutlich Backup) · db2013 8.544 Customers + 17.315 strukturierte Adressen + 3.097 `_kunden_alt` | 3wadmin-Webshop-Stack (URL-Pattern `SHOP-1-6.htm`, AJAX-Endpoint `shop/ajax_warenkorb.php`, Session-Login). Customer-Tabellen `3wadmin_shop_kunden` + Adressen + Bestellungen + Items. **Welche DB ist live?** noch zu klären — vermutlich db1 = current, db11 = Backup, db2013 = älteres Schema/Archiv | Credentials da, Schema discovered, Pull bisher nicht durchgeführt (Section E) |
| **Frank IMAP — `frank@vod-records.com`** | Hetzner Mailbox-Hosting `mail.your-server.de:993` (IMAPS) — 1Password Work Item `mfcjmrompkjjxap6il5nbsd7pa` | **>100k Mails** geschätzt | 5–7 Jahre Korrespondenz mit Kunden — Bestellbestätigungen, Versandfragen, Reklamationen, persönliche Kontakte | Bisher nicht indexiert (Section F) |
| **Frank IMAP — `frank@vinyl-on-demand.com`** | Hetzner Mailbox-Hosting `mail.your-server.de:993` (IMAPS) — 1Password Work Item `7fos2enccq4p7moqnpkcjdlpgi` | tbd, mehrere zehntausend | Älteres Postfach mit VOD-Records-Kontaktgeschichte | Bisher nicht indexiert (Section F) |

### Schmerzpunkte

1. **Customers-Tab zeigt nur 12 Datensätze.** Die 7.890 Legacy-Kunden mit Adressen + 13 Jahren Bestellhistorie schlummern unsichtbar.
2. **POS-Suche findet nur Plattform-Accounts.** `backend/src/api/admin/pos/customer-search/route.ts` queried nur `customer` (text-PK) — Frank kann keinen Bestandskäufer finden, der nie auf der Plattform registriert war.
3. **Kein Email-Merge bei Konversion.** Ein tape-mag-Kunde, der heute via Storefront/POS kauft oder ein Account erstellt, bekommt einen frischen `customer`-Row ohne Verknüpfung zu Legacy-Stammdaten oder Order-History.
4. **Brevo-Sync nur Read.** `customer_stats.brevo_contact_id` und `brevo_synced_at` sind als Spalten vorhanden, aber für **alle 12 Rows NULL**. Das CRM liest live aus Brevo, schreibt aber nicht zurück.
5. **Duplicate-Import-Bug.** `customers` hat **jeden Datensatz zweimal** (15.780 / 7.890 unique → der `crm_import.py`-Job lief 2026-03-22 zwei Mal mit 5min Abstand ohne Upsert/Dedup). Adressen + Orders sind nicht doppelt (nur die Customer-Stammdatenzeile).
6. **`orders.billing_address` / `shipping_address` sind freie Text-Strings ohne Separator.** Z.B. `"Mrmaster seckler RobinBrückenstr. 888097 EriskirchDeutschland"`. Kein JSON, kein FK auf `customer_addresses`. Adress-Anzeige im Admin braucht Parsing oder JOIN auf `customer_addresses`.
7. **`order_items.product_name` enthält HTML** (`<br>`, Promo-Prefixes). Strip nötig vor Anzeige.
8. **Schema-Bridge fehlt.** Keine FK zwischen `customer` (text PK) ↔ `customers` (int PK). Einziger Bridge-Kandidat: `email` (case-insensitive, beide Tabellen `varchar`).
9. **Offline-Verkäufe + VOD-Records-Kanal komplett blind.** Alle MonKey-Office-Rechnungen (10.575 PDFs) und der `vodrecords.com`-Webshop-Bestand sind **nirgendwo in unserer DB**. Top-Spender-Reports können bisher nur über die ~4.465 tape-mag-Website-Käufer rechnen — alle Telefon-/Messen-/Direktverkäufe und der zweite Webshop fehlen vollständig.
10. **Email-Adressen fehlen für viele Bestandskunden.** PDFs enthalten Adressen aber keine Emails. Die einzige Quelle für historische Email-Adressen sind Frank's Postfächer (>100k Mails) — bislang nicht indexiert, also kein automatisches Newsletter-Reactivation auf Kunden möglich, die nur per Brief/Telefon bestellt haben.

### Daten-Pipeline-Übersicht (Soll-Zustand nach D–G)

```
            ┌────────────────────┐
            │ MO PDFs (10.575)   │  Section D — pdftotext + Parser → contacts/transactions
            └─────────┬──────────┘
                      │
            ┌─────────▼──────────┐
            │ tape-mag MySQL     │  Section E.1 — FTP-Dump-Pull, idempotente Upserts
            │ (Legacy FTP+SQL)   │
            └─────────┬──────────┘
                      │
            ┌─────────▼──────────┐
            │ vodrecords.com DB  │  Section E.2 — Hetzner-DB-Pull, eigene Kunden-Stammdaten
            │ (2. Webshop)       │
            └─────────┬──────────┘
                      │
            ┌─────────▼──────────┐
            │ frank@vod-records  │  Section F.1 — IMAP-Index, Email→Kontakt-Match
            │ + frank@vinyl…     │
            └─────────┬──────────┘
                      │
            ┌─────────▼──────────┐
            │ STAGING (Postgres) │  alle Quellen normalisiert in unified contacts/transactions
            │ contacts + tx +    │  + email_candidates mit Confidence Score
            │ email_candidates   │  Source-Spalte: 'mo_pdf' | 'tape_mag_db' | 'vodrecords_db' | 'imap_<acct>'
            └─────────┬──────────┘
                      │ Resolver (Email > MO-CustomerNo > Name+Adresse-Hash)
                      │
            ┌─────────▼──────────┐
            │ DEDUPED MASTER     │  ein Master-Datensatz pro echte Person/Firma
            │ (canonical_contact)│  inkl. lifetime_revenue, last_purchase, source-Liste
            └─────────┬──────────┘
                      │ G — Tier-Berechnung (Bronze/Silver/Gold/Platinum)
                      │
            ┌─────────▼──────────┐
            │ customer (Medusa)  │  Stub-Backfill (wie B.2) inkl. metadata.tier + .legacy_sources
            │ + customer_stats   │  Brevo-Sync mit TIER-Attribut
            └─────────┬──────────┘
                      │
            ┌─────────▼──────────┐
            │ Wave-Strategy (C5) │  Wave 1 = Gold-Kunden zuerst, Wave 2 = Silber, etc.
            └────────────────────┘
```

**Kernprinzip:** Erst sauber **alle** Quellen ins Staging extrahieren, dann **dort** dedupen und tieren — und erst dann ins Produktiv-CRM (`customer`-Tabelle) backfilen. Ohne Staging-Layer würden die Source-Konflikte (z.B. derselbe Kunde in tape-mag-MySQL UND VOD-Records-MySQL UND MO-PDFs UND zweimal in IMAP-Headern) den `customer`-Datenraum vermüllen.

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

**Datei:** `backend/src/admin/routes/crm/page.tsx` — DRITTER Tab neben den bestehenden „Overview" (Brevo-Aggregate) und „Customers" (lokale Liste). Bestehende Tabs unverändert lassen.

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

## Section D — MonKey-Office-Rechnungen aus PDF (PRIMÄRPFAD, ACTIVE)

**Status:** **Aktiviert 2026-05-03.** Section D wird damit zur **historischen Daten-Hauptquelle** für Phase 1, **vor** der Bridge-Arbeit aus Section A. Begründung: ohne MO-PDF-Import sehen Top-Spender-Reports nur die ~4.465 tape-mag-Website-Käufer — alle Telefon-/Messen-/POS-Verkäufe + der gesamte vodrecords.com-Bestand fehlen. Wave-1-Tiering (Section G) braucht die vollständige Lifetime-Revenue, sonst sind die Bronze/Silver/Gold-Schwellen falsch kalibriert.

**Inputs:** 10.575 PDFs unter `Monkey Office/Rechnungen/<Jahr>/*.pdf` (Stand 2026-05-03):

| Jahr | PDFs | Prefix-Verteilung |
|---:|---:|---|
| 2019 | 1.839 | RG: ~1.836, KR: ~3 |
| 2020 | 1.784 | RG: ~1.780, KR: ~4 |
| 2021 | 1.638 | RG: ~1.635, KR: ~3 |
| 2022 | 1.098 | RG: ~1.095, KR: ~3 |
| 2023 | 1.564 | RG: ~1.555, KR: ~7, PR: ~2 |
| 2024 | 1.090 | RG: ~1.080, KR: ~10 |
| 2025 | 1.307 | RG: ~1.295, KR: ~10, PR: ~2, AR: 1 |
| 2026 | 255 | RG-only |
| **Σ** | **10.575** | RG 10.525 · KR 37 · PR 12 · AR 1 |

**Wichtige Eigenschaft:** MO-Layout ist stabil über alle Jahre 2019-2026. `pdftotext -layout` funktioniert für **alle** geprüften Dateien aus diesem Zeitraum. **Keine OCR im Scope** (Robin-Entscheidung 2026-05-03) → Pipeline ist deterministisch und reproduzierbar.

**Erweiterung 2026-05-03:** Der Bestand reicht bis 2003 zurück, nicht nur 2019. Heißt: der Service muss **Multi-Vintage-Layouts** unterstützen — MO hat zwischen 2003 und 2026 sicher mehrfach das Rechnungs-Template geändert. Strategie:

- **Versionierter Template-Parser:** Layouts wie `mo-2003-2010`, `mo-2011-2018`, `mo-2019-2026` als initiale Cuts. Cut-Off-Daten werden bei Sichtung der ersten 50 alten PDFs verifiziert + ggf. nachjustiert
- **Layout-Drift-Detection:** Unbekannte Templates landen in `crm_layout_review_queue` statt zu crashen. Manual-Review fügt neuen Regelsatz hinzu
- **Reine Native-PDFs:** Wir gehen davon aus, dass alle 2003-2026-Rechnungen aus MO heraus als native (text-extrahierbare) PDFs erzeugt wurden — wenn beim ersten Sichten Scan-PDFs auftauchen, ist das ein **Stop-the-Line-Moment** und wir entscheiden separat. Aktuell **kein OCR-Code in der Pipeline**

**Wo die 2003-2018-PDFs liegen:** Sobald die älteren Bestände beschafft sind, werden sie ebenfalls in `Monkey Office/Rechnungen/<Jahr>/` abgelegt (gleiche Ordnerstruktur wie aktuell 2019-2026). Robin-Bestätigung 2026-05-03. Service watcht den Pfad rekursiv — kommen 2018er PDFs rein, werden sie automatisch indexiert.

**Quelle:** Codex-Analyse 2026-05-03, dokumentiert in [`Monkey Office/rechnungs-extraktion-crm-konzept.md`](../../Monkey%20Office/rechnungs-extraktion-crm-konzept.md). Diese Section setzt das Codex-Konzept in den Kontext des Gesamt-CRM-Plans und definiert die Verzahnung mit Section E (Legacy-DBs), F (IMAP) und G (Tiering).

### D.1 Was extrahiert wird (siehe Codex-Konzept §3 für Detail-Schema)

**Pro Rechnung (Header):**
- `invoice_no`, `document_type` (RG/KR/PR/AR), `invoice_date`, `delivery_date`, `customer_no` (z.B. `ADR-015786`), `currency` (EUR), `total_net`, `total_tax`, `total_gross`, `payment_terms`, `tax_note`, `correction_for_invoice_no` (bei KR), `source_pdf_path`, `source_pdf_hash`, `raw_text`, `extraction_status`, `extraction_warnings`

**Pro Position (~4-7 Items pro Rechnung erwartet, 50-70k Items total):**
- `position_no`, `article_no`, `article_name`, `quantity`, `unit_price`, `vat_rate`, `line_total`, `is_shipping`, `raw_line`

**Pro Kunde (kanonische Stammdatenzeile, dedupliziert über alle Rechnungen):**
- `customer_no` (MO-Schlüssel `ADR-XXXXXX`), `raw_name`, `first_name`, `last_name`, `display_name`, `company_name`, `raw_address`, `address_line_1/2`, `postal_code`, `city`, `region`, `country`, `country_code`

### D.2 Pipeline-Architektur

```
Monkey Office/Rechnungen/<Jahr>/*.pdf   (lokal, nicht in git committed)
                │
                ▼
   ┌──────────────────────┐
   │ PDF Importer         │  pdftotext -layout, Datei-Hash, Skip-if-known
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ Invoice Parser       │  Regex auf MO-Layout (Header, Adress-Block,
   │                      │  Positionen, Summen, Steuer-Hinweise)
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ Name Normalizer      │  Vorname/Nachname-Split, Firma-Detection,
   │                      │  raw_name + best-guess + confidence
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ STAGING (Postgres)   │  contacts + transactions + transaction_items
   │                      │  + extraction_runs (Audit) + extraction_warnings
   └──────────────────────┘
```

**Tabellen-Set im Staging-Schema** (siehe Codex-Konzept §5 für volle Spaltenlisten):
- `mo_contacts` — kanonische Kunden-Stammdaten aus PDFs (Kundennummer-keyed)
- `mo_transactions` — Rechnungs-Header (Rechnungsnummer-keyed)
- `mo_transaction_items` — Positionen (FK auf Rechnungsnummer)
- `mo_email_candidates` — vorgesehen für Email-Match aus Section F (Confidence-Score je Kandidat)
- `mo_extraction_runs` — Pro-Run-Audit (Pfad, Hash, Status, Warnungen)
- `mo_crm_export_log` — Idempotenz-Tracking beim Promotion ins Produktiv-CRM

**Wichtig:** Alle MO-Tabellen-Namen mit Prefix `mo_` (siehe Section D + E Konvention) — separate Schema-Domäne, damit der Bridge-Resolver in Phase 2 (Master-Resolver, siehe Section H unten) klar zwischen den Quellen unterscheiden kann.

### D.3 Sprint-Plan (PDF-Pipeline)

| Sprint | Inhalt | Aufwand | Output |
|---|---|---:|---|
| **D1.0 Lokaler Prototyp** | SQLite-Staging (für lokale Entwicklung), Parser auf 100 zufälligen PDFs aus 2019/2022/2025, Validierungs-Warnungen | 1 Tag | Funktionierender Parser, Sample-Report mit Edge-Cases |
| **D1.1 Vollextraktion** | Parser gegen alle 10.575 PDFs, Fehler-/Warnreport, Sonderfälle nachschärfen (AR-2025-000001, KR-Korrekturen) | 1 Tag | CSV + JSON Bulk-Export, <5% mit Warnungen erwartet |
| **D1.2 Postgres-Migration** | Staging-Tabellen `mo_*` in Supabase anlegen (Migration `2026-05-03-mo-staging.sql`), Bulk-Insert aus JSON | 0.5 Tag | Postgres-Tabellen befüllt, idempotent re-runnable |
| **D1.3 Name-Normalisierung** | Vorname/Nachname-Split, Firmen-Erkennung, Confidence-Marker für unsichere Fälle | 0.5 Tag | `first_name`/`last_name`/`company_name`-Felder befüllt mit ≥0.8 Confidence-Threshold |
| **D1.4 Validierung + QA-Report** | Plausibilitäts-Checks (Summen, Pflichtfelder, Doubletten), Frank-Review-Liste für ambigue Namen | 0.5 Tag | QA-Report-Markdown, Reject-Liste für manuelle Korrektur |

**Total D1: ~4 Tage** für vollständig befülltes MO-Staging im Postgres.

### D.4 Service-Deployment (VPS, Phase 2)

Wenn D1 lokal läuft → auf VPS deployen damit MO-PDFs aus dem `Monkey Office/Rechnungen/`-Ordner automatisch verarbeitet werden, sobald Frank neue PDFs ablegt:

- **Sync-Mechanismus:** Frank legt PDFs lokal in seinen `Monkey Office/Rechnungen/<Jahr>/`-Ordner ab. Dieser Ordner wird via rsync/iCloud/Resilio Sync auf den VPS gespiegelt (Robin entscheidet später — initial reicht manueller `scp`-Push 1× pro Woche).
- **Cron auf VPS:** `0 4 * * *  python3 mo_pdf_pipeline.py --incremental` — verarbeitet nur PDFs, deren Datei-Hash noch nicht im `mo_extraction_runs`-Audit ist.
- **Reporting:** Tagesreport via Email an `support@vod-auctions.com` mit Counts (neue Rechnungen, Warnings, Errors).
- **Dashboard:** `/admin/crm/legacy/mo-status` zeigt letzte Runs, Warnings, Reject-Liste.

**Aufwand D2 (deployment + monitoring): ~1 Tag.**

### D.5 OfficeConnect (deferred, strategischer Phase-3-Workstream)

Der ursprüngliche Section-D-Inhalt (OfficeConnect-API-Integration für **bidirectional** Sync zwischen MO und vod-auctions.com) bleibt **strategisch wertvoll**, ist aber **kein** Launch-Blocker für die Daten-Konsolidierung. Folgende Logik:

- **PDF-Pipeline (D1+D2)** liefert die historische 7-Jahres-Sicht aller Rechnungen. **Read-only**, idempotent, ohne MO-Eingriff.
- **OfficeConnect (D3, später)** kommt erst, wenn Frank in **beide Richtungen** synchronisieren will — also wenn vod-auctions.com Auktions-Verkäufe automatisch als MO-Rechnungen anlegen soll. Das ist GoBD-relevant und deutlich komplexer.

Die ursprünglichen Sections D.0-D.11 zu OfficeConnect-Discovery, Lizenz-Antrag, Tailscale-Setup etc. werden **als Phase-3-Referenz** unten konserviert, aber nicht in Phase 1 angegangen.

**Trigger für D3-Pickup:** Wenn Frank's „Auktion verkauft → MO-Rechnung erzeugen"-Workflow manuell wird (Doppelarbeit), ist der Punkt erreicht. Bis dahin reicht der einseitige PDF-Import vollständig.

### D.6 Was Section D liefert (Phase 1)

- **10.575 Rechnungen + ~50-70k Line-Items** aus 7 Jahren Geschäftshistorie im Staging
- **~5.000-8.000 unique Kunden-Stammdatensätze** mit kanonischer MO-Kundennummer (`ADR-XXXXXX`)
- **Lifetime-Revenue pro Kunde** über die kompletten 2019-2026 — Basis für Tiering (Section G)
- **Auditierbarer Pfad** von jeder Rechnung zurück zur PDF-Datei (Hash + Pfad)
- **Idempotente Re-Runs** — wenn der Parser nachgeschärft wird, kann die ganze Extraktion ohne Datenverlust wiederholt werden

**Was Section D NICHT liefert (das macht Section F):** Email-Adressen pro MO-Kunde. PDFs enthalten zwar manchmal eine Notiz-Email, aber primär Adress-Daten. Email-Anreicherung passiert in Section F via IMAP-Match.

---

## Section E — Legacy-Datenbank-Konsolidierung (NEW)

**Status:** Discovery 2026-05-03 abgeschlossen, Implementation pending.
**Ziel:** Vier Legacy-Web-Shop-Datenbanken in unser Staging übernehmen, damit jeder dort registrierte Online-Kunde im neuen CRM auffindbar ist — auch wenn er nie über tape-mag.com gekauft hat.
**Reference:** [`docs/architecture/LEGACY_MYSQL_DATABASES.md`](../architecture/LEGACY_MYSQL_DATABASES.md) — vollständiges Schema-Inventar, Tabellen-Counts, Cross-DB-Beziehungen, Pull-Cheatsheet.

### E.0 Datenbank-Inventar (Discovery 2026-05-03, korrigiert mit Site-Hosting-Befunden)

**Hosting-Realität (alle vier Domains auf `213.133.106.99` = dedi99.your-server.de):**

| Domain | Plattform | DB | Customer-Tabelle | Counts |
|---|---|---|---|---|
| `tape-mag.com` + `record-price-guide.org` (Mirror) | 3wadmin Member-CMS | `vodtapes` | `3wadmin_extranet_user` | 3.632 Members |
| `vod-records.com` + `vinyl-on-demand.com` | 3wadmin Webshop | `maier_db1` (live?) | `3wadmin_shop_kunden` | 3.114 Customers |
| (gleicher Shop, älteres Schema) | 3wadmin Webshop (Archiv) | `maier_db2013` | `3wadmin_shop_kunden` + `_kunden_adresse` | 8.544 Customers + 17.315 Adressen |

**Relevante Quelle aus `scripts/crm_import.py` (geschrieben 2026-03):**
- Phase 1: `vod-auctions.com` (Medusa native, 12 customers heute)
- Phase 2: `tape-mag.com` (`vodtapes.3wadmin_extranet_user` — 3.632 Members)
- Phase 3: `vod-records.com` Kommentar sagt „WooCommerce — CSV import, manual" — **dieser Kommentar ist veraltet**, der Shop läuft 2026-05-03 nachweislich auf 3wadmin, nicht WooCommerce. Die `maier_db*`-DBs sind die echte Quelle.

**Drei vod-records.com / vinyl-on-demand.com DBs auf `dedi99.your-server.de:3306`** (Hetzner-Dedi, Custom-PHP-Shop „3wadmin"):

| DB | kunden | bestellungen | bestellungen_artikel | newsletter | Schema-Hash | Charakter |
|---|---:|---:|---:|---:|---|---|
| `maier_db1` | **3.114** | 3.062 | 4.701 | 30 | `fc951d…` | Aktueller VOD-Records-Webshop (kompaktes Schema) |
| `maier_db11` | 2.556 | 2.501 | 3.772 | 20 | `fc951d…` (= db1) | Backup/Fork von db1 — gleiches Schema, weniger Daten |
| `maier_db2013` | **8.544** | 8.230 | 13.617 | 42 | `dffe66…` | **Reichhaltiges Archiv** — separate `_kunden_adresse` (17.315 Rows) + `_kunden_alt` (3.097) + `_personen`-Konzept. Vermutlich der ursprüngliche 2010-2013-Shop bevor das Schema vereinfacht wurde |

**Plus `vodtapes` (tape-mag.com Member-DB)** — Credentials in 1Password Work: `Legacy MySQL tape-mag` Item `eajngb2kdtjlkaw7ztrf45xupe` (R/O User `maier1_2_r`, Password im Item `s5e7ebssyfyvtx4n3ehqirjtem` Feld `maier1_2_r Passwort`). Schema **anders** als die `maier_db*`-Webshops:
- `3wadmin_extranet_user` (3.632 Members) — Login-Tabelle (id, name, vorname, email UNIQUE, pwd, tel, position, aktiv)
- `3wadmin_tapes_releases/_band/_labels/_pressorga/_formate/_katalog` — **Catalog**, NICHT Customer-Bestellungen
- **Keine** `3wadmin_shop_*`-Tabellen → tape-mag.com hat keinen Kassen-Shop, nur Member-Login + Catalog-Browse

→ tape-mag-Customer-Daten sind dünner als gedacht (3.632 Members ohne Order-History). Order-History kommt aus den `maier_db*`-Shops + MO-PDFs.

**Hetzner-Dedi-Credentials in 1Password Work (Stand 2026-05-03):**

| Zweck | 1Password-Item-Title | ID |
|---|---|---|
| SSH-Zugang `maier@dedi99.your-server.de:222` | `SSH-ZUGANG Hetzner` | `u74qt347j7myu7sqmgy4vcwzn4` |
| MySQL Root + R/W (`maier`/`maier_w`) + **R/O (`maier_r`)** für `maier_db1` | `maier_db1` | `bxedowvg33lzphnmrvty56j5zy` |
| MySQL Root + R/W + **R/O (`maier_db11_r`)** für `maier_db11` | `maier_db11` | `hox5f3mgfezjzeca3b5d45c3yq` |
| MySQL Root + R/W + **R/O (`maier_2013_r`)** für `maier_db2013` | `maier_db2013` | `ml4lcccpje4ocgxxvnjrojbtlm` |

**Pull-Pattern:** Das Skript zieht via `op item get <id> --vault Work --fields label="R/O Passwort"` direkt die R/O-Credentials. Niemals R/W-Credentials nutzen — die Pipeline ist read-only.

**Total Legacy-Web-Shop-Bestand: ~14.214 Kunden + ~7.890 tape-mag = ~22.000 Kunden vor Deduplizierung.** Tatsächlich erwartet weniger nach Email-/Adress-Match: viele Kunden haben über mehrere Shops gekauft.

**Schema-Übersicht (db2013, kompletteste Version):**

```
3wadmin_shop_kunden:           id, wid, email, tel, fax, pwd, nick, datum (datetime),
                               kundentyp, preisliste, liquide, sprache, …

3wadmin_shop_kunden_adresse:   id, kid (FK), typ (1=Rech/2=Liefer),
                               anrede, titel, firma, vorname, name,
                               strasse, plz, ort, staat, land (FK auf countries), datum

3wadmin_shop_bestellungen:     id, kunde (FK), kundentyp, lieferid,
                               rechadr (TEXT free-form), lieferadr (TEXT free-form),
                               datum (datetime), zahlungsart, zalung_gebuehr,
                               anmerkung, bezahlt, versand, versandkosten,
                               versand_steuer, gesamtpreis, gutschein, status, paketnr

3wadmin_shop_bestellungen_artikel:  id, bestell_id (FK), artikel_id, menge,
                                    preis, steuer, …
```

**db1/db11 sind kompakter:** keine separate `_kunden_adresse`-Tabelle — Adressen liegen direkt in den Bestell-Text-Feldern `rechadr`/`lieferadr`. Schwerer zu parsen, aber machbar (gleiches Pattern wie unsere bestehenden `orders.billing_address`-Strings).

### E.1 Pipeline (`scripts/legacy_db_pull.py`)

**Approach:** Python-Skript via `pymysql`/`mysql-connector-python` direkt auf `dedi99.your-server.de:3306` mit den **R/O-Accounts** (`maier_r`, `maier_db11_r`, `maier_2013_r`). Credentials aus 1Password Work via `op` CLI gezogen — **niemals in git committed**.

```bash
# Skript-Bootstrap (Beispiel)
export MAIER_DB1_PASS=$(op item get bxedowvg33lzphnmrvty56j5zy --vault Work --fields label="R/O Passwort" --reveal)
export MAIER_DB11_PASS=$(op item get hox5f3mgfezjzeca3b5d45c3yq --vault Work --fields label="R/O Passwort" --reveal)
export MAIER_2013_PASS=$(op item get ml4lcccpje4ocgxxvnjrojbtlm --vault Work --fields label="R/O Passwort" --reveal)
python3 scripts/legacy_db_pull.py --source vod_records_db2013
```

```
For each (DB, R/O-User):
  1. Pull 3wadmin_shop_kunden → mo_legacy_contacts (Source-Tag: 'vod_records_db1' / 'vod_records_db11' / 'vod_records_db2013' / 'tape_mag_legacy')
  2. Pull 3wadmin_shop_kunden_adresse (wenn vorhanden) → mo_legacy_addresses
  3. Pull 3wadmin_shop_bestellungen → mo_legacy_orders
     + Parse rechadr/lieferadr Free-Text wenn keine separate Adress-Tabelle
  4. Pull 3wadmin_shop_bestellungen_artikel → mo_legacy_order_items
  5. Pull newsletter → mo_legacy_newsletter
```

**Connection-Pattern (lokal getestet 2026-05-03):**
```python
import pymysql
conn = pymysql.connect(
    host='dedi99.your-server.de', port=3306,
    user=os.environ['DB_USER'],     # maier_r / maier_db11_r / maier_2013_r
    password=os.environ['DB_PASS'], # via 1Password
    database=os.environ['DB_NAME'], # maier_db1 / maier_db11 / maier_db2013
    ssl={'ssl_mode': 'PREFERRED'},  # SSL bevorzugt, kein cert-pinning
    charset='utf8mb4',
)
```

**Sicherheits-Constraint:** `pwd`-Spalte (Customer-Passwort-Hashes) **niemals** ziehen oder loggen. Die Hashes bleiben in der Quell-DB und werden in unsere Staging-DB nicht übernommen — wir machen keinen Auth-Bridge auf alten Hashes (würde DSGVO-Risiken einführen + Hash-Algorithmus von 2010 ist ohnehin schwach).

### E.2 Schema-Mapping (Quell → Staging)

**Source-Spalte ist Pflicht** auf jeder Staging-Zeile damit Resolver nachvollziehen kann, woher die Zeile kam:

| Source-Tag | Quelle |
|---|---|
| `vod_records_db1` | maier_db1 (current Webshop) |
| `vod_records_db11` | maier_db11 (Backup, vermutlich subset von db1) |
| `vod_records_db2013` | maier_db2013 (Archiv 2010-2013) |
| `tape_mag_legacy_mysql` | tape-mag MySQL (1Password) |
| `tape_mag_existing_db` | bestehende `customers`/`orders`-Tabellen in unserer Supabase (Re-Source-Tagging) |
| `mo_pdf` | Section D PDF-Pipeline |
| `imap_<account>` | Section F Email-Mining |

### E.3 Charset + Encoding-Edge-Cases

Die DBs sind aus PHP4/MySQL5-Ära — mögliche Issues:
- **Charset-Drift:** Manche Tabellen sind `utf8mb4`, andere `latin1` oder `cp1252` — beim Pull immer `convert_unicode=True` und `charset='utf8mb4'` angeben, aber **stichprobenartig** prüfen ob z.B. Umlaute korrekt ankommen (Pre-Migration-Script: SELECT firma FROM kunden_adresse WHERE name LIKE '%ü%' UNION '%ä%' UNION '%ö%' LIMIT 20).
- **Doppelt-Encoding:** Wenn Müller als „MÃ¼ller" ankommt → der Original-Datensatz war already mojibake und braucht `ftfy.fix_text()` zum Repair.
- **NULL vs. leerer String:** PHP4-Konvention `''` statt `NULL` für „nicht gesetzt" → Normalisierung im Staging.

### E.4 Adress-Parsing für db1/db11 (kein structured `_kunden_adresse`)

`db1.bestellungen.rechadr` ist Free-Text, ähnlich wie unsere bestehende `orders.billing_address`. Beispiel-Annahme: Mehrzeilig mit `\n`-Trenner, oder Kommagetrennt. **Erst nach Sample-Inspektion entscheiden** ob ein eigener Parser nötig ist oder ob wir einfach ein „raw_address"-Feld lassen und Tag-1 nicht parsen.

**Pragmatische Empfehlung:** db2013 (mit strukturierter Adress-Tabelle) ist der Hauptwert — 8.544 Kunden + 17.315 Adressen. db1/db11 haben zusammen ~5.670 Kunden, davon vermutlich >50% Email-Match mit db2013 oder MO-PDFs. Wir starten mit db2013 + Email-basiertem Backfill aus db1/db11 (= db1/db11-Kunden, die nicht in db2013 sind, kriegen ihre Adresse aus dem letzten `bestellungen.rechadr`-Eintrag geparst).

### E.5 Sprint-Plan

| Sprint | Inhalt | Aufwand |
|---|---|---:|
| **E1.0 Schema-Discovery** | Vollständige `DESCRIBE` aller 4 Quellen, Sample-Daten (10 Rows pro Kerntabelle), Charset-Audit | 0.5 Tag |
| **E1.1 Pull db2013 (reichste Quelle)** | `legacy_db_pull.py` für maier_db2013 schreiben + ausführen, Staging-Tabellen `mo_legacy_*` befüllen | 1 Tag |
| **E1.2 Pull db1 + db11** | Same script, andere Connection-Configs. Adressen aus Bestellungs-Text-Feldern parsen | 1 Tag |
| **E1.3 Pull tape-mag MySQL** | Wenn Schema vergleichbar: gleiche Pipeline. Wenn anders: dedizierter Parser | 1 Tag |
| **E1.4 De-Dup-Sweep** | Email-basiertes Pre-Match zwischen den 4 Quellen — wie viele Kunden sind in mehreren DBs? Cross-Source-Counts in `mo_legacy_dedup_report` | 0.5 Tag |

**Total E1: ~4 Tage** für vollständig konsolidiertes Legacy-DB-Staging.

### E.6 Was Section E NICHT macht

- **Kein Pull der `pwd`-Spalten.** Customer-Authentication aus den alten Shops wird nicht übernommen — Bestandskunden müssen via Forgot-Password-Flow (siehe A.5.3) neu setzen.
- **Kein Pull der Produkte / Artikel-Stammdaten** aus den Legacy-DBs. Unser Release-Bestand ist anders strukturiert (Discogs-basiert via legacy_sync_v2.py), Vermischung wäre destruktiv.
- **Kein Bidirectional-Sync.** Die Quell-DBs werden read-only behandelt — wir spiegeln, schreiben nicht zurück.
- **Keine Migration der Zahlungsdaten** (`zahlungsart`, Bankdaten in `_kunden_bank` von db2013). PCI-irrelevant da Daten alt + nicht aktuell, aber wir vermeiden sie sicherheitshalber.

---

## Section F — IMAP-Email-Mining (NEW)

**Status:** Konzept 2026-05-03, Implementation pending.
**Ziel:** Aus Frank's zwei Postfächern (>100k Mails) eine **Email-Adresse pro Bestandskunde** rekonstruieren — primär für die Bestandskunden, die nur PDF-Rechnungen + postalische Adresse haben (kein DB-Online-Login). Ohne diese Anreicherung kann das Tier-Marketing (Section G) nur ~70% der Top-Spender erreichen.

### F.0 Quellen + Volumen

**Hosting:** Beide Postfächer auf **Hetzner Mailbox-Hosting**, Server `mail.your-server.de` (`78.46.5.205`), **IMAPS Port 993** (TLS via DigiCert, 2026-05-03 Connect-Probe ok). SMTP `mail.your-server.de` (Standard 587 STARTTLS oder 465 SSL — wir lesen nur, kein SMTP-Use-Case). Credentials in 1Password Work, **niemals in git**.

**Account 1: `frank@vod-records.com`** — 1Password Item `mfcjmrompkjjxap6il5nbsd7pa`
- Geschätzt 60-80k Mails (Bestellbestätigungen, Versandfragen, Reklamationen, persönliche Korrespondenz)
- ~5-7 Jahre Historie
- Inbox + Gesendet beide relevant — Reply-To / To-Felder enthalten Customer-Email

**Account 2: `frank@vinyl-on-demand.com`** — 1Password Item `7fos2enccq4p7moqnpkcjdlpgi`
- Geschätzt 20-40k Mails
- Älteres Postfach, vermutlich kleinere Aktivität
- Überlappt mit Account 1 (gleiche Customer schreiben an beide Adressen über die Jahre — Resolver in H.1 dedupliziert)

**Total:** geschätzt 80-120k Mails. **Müssen einmalig indexiert werden, nicht durchsucht pro Kunde** — sonst ist die Match-Operation O(N×M) mit N=Kunden (20k), M=Mails (100k) = 2 Mrd. Operationen.

**Connection-Pattern (Python `imaplib`, getestet 2026-05-03):**
```python
import imaplib, ssl
ctx = ssl.create_default_context()
imap = imaplib.IMAP4_SSL('mail.your-server.de', 993, ssl_context=ctx)
imap.login(os.environ['MAIL_USER'], os.environ['MAIL_PASS'])
imap.select('INBOX', readonly=True)  # niemals modifizieren
typ, uids = imap.uid('SEARCH', None, 'ALL')
# Iter UIDs in Chunks à 200, FETCH(BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.5120>)
```

**Wichtig — `BODY.PEEK[…]` nutzen, nicht `BODY[…]`** — `PEEK` setzt das `\Seen`-Flag NICHT. Frank's Postfach soll nach dem Index-Run aussehen wie davor (sonst kommt er zurück und sieht 100k „ungelesen" → vermutlich neue Mails verpasst).

### F.1 Pipeline-Architektur

```
                IMAP (frank@vod-records.com)        IMAP (frank@vinyl-on-demand.com)
                              │                                  │
                              └──────────────┬───────────────────┘
                                             ▼
                              ┌──────────────────────────────┐
                              │ IMAP Indexer (one-shot)      │
                              │  - Connect IMAPS:993         │
                              │  - Iter alle Folder + UIDs   │
                              │  - Parse Header (From/To/    │
                              │     Reply-To/Cc/Subject/Date)│
                              │  - Extract first 2-5kb body  │
                              │  - Extract emails (regex)    │
                              │  - Extract Customer-Refs     │
                              │     (ADR-XXXXXX, RG-XXXXXX)  │
                              └──────────┬───────────────────┘
                                         ▼
                              ┌──────────────────────────────┐
                              │ STAGING: imap_messages       │
                              │  Spalten: msg_id, folder,    │
                              │  from_email, to_emails (JSON)│
                              │  subject, date, body_excerpt,│
                              │  detected_emails (JSON),     │
                              │  detected_customer_refs (JSON│
                              │  detected_invoice_refs (JSON)│
                              └──────────┬───────────────────┘
                                         ▼
                              ┌──────────────────────────────┐
                              │ Contact Matcher              │
                              │  Joinen contacts (D+E) gegen │
                              │  imap_messages auf:          │
                              │   1. customer_no Match       │
                              │   2. invoice_no Match        │
                              │   3. Name Exact Match        │
                              │   4. Name Fuzzy + Address    │
                              │   5. Domain Match (Firma)    │
                              └──────────┬───────────────────┘
                                         ▼
                              ┌──────────────────────────────┐
                              │ STAGING: contact_emails      │
                              │  contact_id, email,          │
                              │  matched_by, confidence,     │
                              │  source_msg_id, accepted     │
                              └──────────────────────────────┘
```

### F.2 Confidence-Score-Modell (Codex-Konzept §8.2-8.3)

| Signal | Confidence-Beitrag |
|---|---:|
| Kundennummer `ADR-XXXXXX` im Mail-Body/Subject | +0.50 |
| Rechnungsnummer `RG-/KR-/PR-XXXXXX` im Mail-Body/Subject | +0.50 |
| Voller Name (Vorname + Nachname) im From-Header | +0.30 |
| Voller Name in Mailtext + Match in Adress-Stadt/PLZ | +0.25 |
| Nachname + Land-ISO-Code | +0.15 |
| Firma-Name + Email-Domain Match (z.B. `Müller GmbH` ↔ `*@mueller-gmbh.de`) | +0.20 |
| Generische Adresse (`info@`, `sales@`, `kontakt@`, `office@`) | -0.30 (Penalty) |

**Threshold-Banding:**
- ≥0.90: Auto-Accept (Email wird als `email_primary` gespeichert)
- 0.70-0.89: Manual-Review-Queue (Frank bestätigt einzeln)
- 0.40-0.69: Kandidat behalten, nicht aktiv nutzen
- <0.40: Ignorieren

### F.3 Sicherheits- und Rechts-Constraints

- **Mailtexte nicht volltext speichern** — nur Metadaten + erste 2-5kb Body-Auszug. Rest auf-demand re-fetchen wenn Frank manuell prüfen will.
- **Index lokal/VPS** — niemals Mail-Inhalte in Brevo/Anthropic/OpenAI pushen.
- **Logs** ohne Email-Inhalte — nur `msg_id` + Match-Resultat in extraction_runs.
- **Lösch-Policy:** Nach Abschluss des Match-Runs werden die Body-Auszüge nach 90 Tagen anonymisiert (nur Metadaten bleiben für spätere Re-Runs).
- **DSGVO-Auskunft:** Wenn ein Customer Auskunft will, müssen wir sagen können „aus Email an X vom Y haben wir Email-Adresse Z extrahiert". Daher `source_msg_id` und `matched_by` zwingend speichern.

### F.4 Sprint-Plan

| Sprint | Inhalt | Aufwand |
|---|---|---:|
| **F1.0 IMAP-Probe** | Test-Connect zu beiden Accounts, Folder-Liste, Mail-Counts pro Folder, Sample-Header-Inspektion | 0.5 Tag |
| **F1.1 Indexer** | `imap_indexer.py` — iteriert UIDs, schreibt nach Postgres `imap_messages`. Inkrementell (UIDVALIDITY-Tracking) | 1.5 Tage |
| **F1.2 Initial-Index-Run** | One-shot Vollindex auf beide Accounts. Geschätzte Dauer: 4-8h pro Account (IMAP ist langsam für 100k Mails) | Background-Run, kein aktiver Aufwand |
| **F1.3 Contact-Matcher** | Match-Pipeline auf Staging-Contacts (D + E zusammen), Confidence-Score-Berechnung, Output in `contact_emails` | 1 Tag |
| **F1.4 Review-Queue** | Admin-UI `/admin/crm/email-review` — listet 0.70-0.89-Kandidaten, Frank klickt accept/reject | 1 Tag |

**Total F1: ~4 Tage Code + Background-Run-Wartezeit.**

### F.5 Erwartete Resultate

**Annahmen:**
- ~5.000-8.000 unique MO-Customers nach Section D
- ~14.000 unique Legacy-DB-Customers nach Section E (vor Cross-DB-Dedup)
- Erwartete Cross-Source-Dedup-Rate: 30-50% (ein Kunde kann in MO + db2013 + db1 + Email parallel vorkommen)
- Resulting unique-canonical Bestand nach D+E+F: **~12.000-18.000 Bestandskunden**

**Email-Match-Rate-Erwartung:**
- Auto-Accept (≥0.90): 40-60% der Customers (Customers mit klarer Bestell-Email-History)
- Manual-Review (0.70-0.89): 15-25%
- No-Match (<0.70): 20-40% (offline-only Customers ohne digitale Spur — bleiben für Postversand-Marketing reserviert)

### F.6 Was Section F NICHT macht

- **Kein Mail-Versand** über die Mailboxen. Read-only Indexierung.
- **Keine AI-Klassifizierung** der Mail-Inhalte (z.B. „ist das eine Reklamation?"). Reines Header-/Email-Extraktions-Mining. AI-Klassifikation kann Phase 2 sein.
- **Keine Newsletter-DOI-Inferenz.** Wenn ein Customer historisch eine Bestellbestätigung bekommen hat, heißt das **nicht**, dass er Newsletter-Consent gegeben hat. Newsletter-Consent muss separat über DOI gehen (siehe A.5.4 + RSE-78).

---

## Section G — Bronze/Silver/Gold/Platinum-Tiering + Wave-Integration (NEW)

**Status:** Konzept 2026-05-03, knüpft an Section C5 (Wave-Strategie).
**Ziel:** Aus dem konsolidierten Lifetime-Revenue (D + E + F + bestehende `orders`) eine **kanonische Tier-Klassifikation** pro Customer berechnen, die Wave-Reihenfolge und Marketing-Priorisierung steuert. **Gute Kunden bekommen guten Stoff zuerst.**

### G.1 Tier-Definition

**Datenquelle:** `customer_stats.lifetime_revenue` (rebuilt nach D+E+F+bestehende-Orders-Konsolidierung) und `customer_stats.last_purchase_at`.

| Tier | Lifetime-Revenue | Activity-Boost | Beispiel-Anteil (geschätzt) |
|---|---:|---|---:|
| **Platinum** | ≥ €5.000 | letzte 24 Monate aktiv | ~1-3% (Top-200) |
| **Gold** | €1.500 — €4.999 | letzte 24 Monate aktiv | ~5-10% (~800-1.500 Customers) |
| **Silver** | €500 — €1.499 | letzte 36 Monate aktiv | ~15-25% (~2.500-4.000 Customers) |
| **Bronze** | €100 — €499 | letzte 60 Monate aktiv | ~30-40% (~5.000-7.000 Customers) |
| **Standard** | < €100 oder nur 1 Bestellung | beliebig | ~20-30% |
| **Dormant** | beliebig | letzter Kauf >60 Monate | ~10-20% — Reactivation-Kandidaten |

**Regeln (verbindlich):**
- Schwellen sind **Approximationen** und sollen nach D+E+F-Konsolidierung mit echten Histogrammen kalibriert werden. Frank entscheidet final über die Zahlen.
- Tier-Berechnung ist **deterministisch + reproduzierbar** — Cron rechnet täglich `recalc_customer_tiers.py`, schreibt `customer_stats.tier`, `customer_stats.tier_calculated_at`, `customer_stats.tier_reason`.
- Tier-Aufstieg ist **sticky 30 Tage** — wenn ein Customer von Silver→Gold rutscht, bleibt er mindestens 30 Tage Gold (verhindert Bouncing zwischen Tiers bei großen Einzelkäufen).
- Tier-Abstieg ist **gleitend** — Lifetime-Revenue wird mit „Recency-Decay" gewichtet (Käufe vor >24 Monaten zählen mit 0.7×, vor >48 Monaten mit 0.4×). Verhindert dass ein Top-Käufer von 2019 ewig Gold bleibt obwohl seit 5 Jahren tot.

### G.2 Tier in Schema + Brevo

**Schema-Erweiterung — additiv zu bestehender `customer_stats`** (siehe `CRM_SYSTEM_VOD_AUCTIONS.md` §3 für die existierenden Spalten):
```sql
-- Bestehende Spalten in customer_stats: customer_id, total_spent, total_purchases,
-- total_bids, total_wins, last_*_at, tags[], is_vip, is_dormant, updated_at
-- (NICHT überschreiben, NICHT ersetzen)

ALTER TABLE customer_stats ADD COLUMN tier text NULL;
ALTER TABLE customer_stats ADD COLUMN tier_calculated_at timestamptz NULL;
ALTER TABLE customer_stats ADD COLUMN tier_reason text NULL;
ALTER TABLE customer_stats ADD COLUMN lifetime_revenue_decayed numeric(10,2) NULL;
CREATE INDEX idx_customer_stats_tier ON customer_stats(tier);

-- is_vip bleibt als boolean-Spiegel kompatibel:
-- nach Tier-Berechnung: is_vip = (tier IN ('gold', 'platinum'))
-- Existierende Konsumenten von is_vip funktionieren weiter
```

**Recalc-Integration:** Statt eigenem Cron erweitern wir den bestehenden stündlichen Job in `backend/src/jobs/customer-stats-recalc.ts`. Neue Logik:
1. Bestehende Aggregat-Logik (total_spent, last_purchase_at etc.) bleibt unverändert
2. Zusätzlich: `lifetime_revenue_decayed = SUM(transaction.total * recency_weight)` mit `recency_weight = CASE WHEN months_since <= 24 THEN 1.0 WHEN months_since <= 48 THEN 0.7 ELSE 0.4 END`
3. `tier` und `tier_reason` aus `lifetime_revenue_decayed` + `last_purchase_at` ableiten
4. `is_vip = (tier IN ('gold', 'platinum'))` setzen — Backward-Compat
5. `is_dormant`-Logik unverändert (>90d ohne Purchase)

**Brevo-Sync:** Customer-Attribut `TIER` (`platinum`/`gold`/`silver`/`bronze`/`standard`/`dormant`) wird bei jedem Tier-Update mit-gesynced (Hook in B.6).

**Anti-Pattern (vermeiden):**
- Tier **nicht** als Boolean-Flag pro Tier (`is_gold`, `is_silver`) — single-source-of-truth ist das `tier`-Enum
- Tier **nicht** im Customer-PII-Bereich anzeigen (Storefront-Account-Page) — interne Marketing-Klassifikation, nicht für Customer-Sicht. „You are a Gold member" kommt erst, wenn Frank ein bewusstes Loyalty-Programm aufzieht.

### G.3 Wave-Strategie — Tier-Sortierung INNERHALB der existierenden Wellen

**Wichtig:** Die Wellen-Definition kommt aus [`PRE_LAUNCH_KONZEPT.md`](../PRE_LAUNCH_KONZEPT.md) §3 (4 Wellen + Launch). Section G fügt **Tier-basierte Reihenfolge** innerhalb von Welle 1 hinzu, ersetzt **nicht** die Welleneinteilung selbst.

**Mapping zwischen den Modellen:**

| `PRE_LAUNCH_KONZEPT.md` Welle | Zielgruppe | Tier-Sortierung (Section G) |
|---|---|---|
| **Welle 0** (T+0 sofort, RSE-77) | Interne Tester | n/a — direkte Admin-Einladung |
| **Welle 1** (T+0 öffentlicher Launch) | Tape-mag-Bestandskäufer aus Brevo List 5 + Legacy DB | **Platinum zuerst (≥€5k)**, dann Gold (€1.5k-€5k), dann Silver (€500-€1.5k) — gestaffelt über 3-7 Tage. Bronze (€100-€500) folgt am Tag 7. Standard ohne Order-Historie aus Tape-mag bekommt Welle-1-Mail aber ohne Tier-Bevorzugung |
| **Welle 2** (T+7) | Tape-mag-Newsletter ohne Käufe | Apply-Aufforderung mit Auto-Approval. Tier nicht relevant (keine Kaufhistorie zum Sortieren) |
| **Welle 3** (T+14) | Organisch (Social, Discogs-Forum) | /apply-Bewerbung + Admin-Review. Tier nicht relevant für initiales Onboarding, kommt erst zum Tragen sobald sie kaufen |
| **Launch** (T+X) | Alle | Public-Open, `platform_mode='live'` |

**Tier-spezifischer Mehrwert in Welle 1 (was Tiering ergänzt):**
- **Platinum + Gold:** Auktions-Block-Visibility-Gate (`block.visibility_tier`) gibt 24-48h Vor-Bid-Zeit vor jeder Auktion (keine bevorzugte Sichtbarkeit der Plattform — sondern bevorzugter Auktions-Zugang innerhalb der Plattform)
- **Silver + Bronze:** standard Auktions-Zugang nach den Vor-Bid-Stunden
- **Standard + Dormant:** Auktion sichtbar zu öffentlicher Live-Zeit

**Kommunikations-Hinweis:** Die E-Mail-Templates aus `PRE_LAUNCH_KONZEPT.md` §4 bleiben unverändert für alle Welle-1-Empfänger. **Personalisierung passiert via Brevo-Attribut `TIER`** im Template (z.B. „Sie sind als Gold-Sammler eingeladen — 24h Vor-Bid auf den Erstausgaben-Block"). Keine separaten E-Mails pro Tier nötig.

**Operative Konsequenzen:**
- Auktions-Block hat `visibility_tier`-Flag (`platinum`/`gold`/`silver`/`bronze`/`all`)
- Storefront-Filter: `WHERE block.visibility_tier <= customer.tier_rank`
- Bid-API: Access-Gate (C.2) erweitert um Tier-Check — wenn `block.visibility_tier > customer.tier_rank`, return `403 access_locked` mit Hint „Available to all members in 5 days"
- Admin-UI im Auktions-Block-Editor: Dropdown „Visible to" → Tier-Selection

### G.4 Sprint-Plan (Tiering)

| Sprint | Inhalt | Aufwand |
|---|---|---:|
| **G1.0 Schema** | Migration `2026-05-XX-customer-tier.sql`, Recalc-Skript | 0.5 Tag |
| **G1.1 Initial-Recalc** | Nach D+E+F-Konsolidierung: Histogramm-Audit mit Frank, Schwellen kalibrieren, Initial-Set für alle Customers | 0.5 Tag |
| **G1.2 Brevo-Sync** | TIER-Attribut hochpushen, Brevo-Filter für Wave-1-Newsletter erstellen | 0.5 Tag |
| **G1.3 Auktions-Block-Tier-Gate** | Backend-Logik + Admin-UI-Dropdown + Access-Gate-Erweiterung | 1.5 Tage |
| **G1.4 Storefront-Sichtbarkeit** | Tier-Filter im Block-Listing + Tooltip „Available to all in N days" | 1 Tag |

**Total G1: ~4 Tage.** Block-Tier-Gate (G1.3) ist Launch-Blocker für Wave 1, alles davor ist Vorarbeit.

### G.5 Was Section G NICHT macht (Phase 1)

- **Kein Customer-facing „Sie sind Gold-Member"-UI.** Tier ist intern. Wenn Loyalty-Programm später kommt, eigener Workstream.
- **Keine Tier-basierten Rabatte.** Phase 1 = nur **Reihenfolge-Vorteile** (Wave-Slot, Vor-Bid-Zeit). Discount-Mechanik kann Phase 2 sein.
- **Keine ML-basierte Tier-Berechnung.** Pure Revenue-Schwelle + Recency-Decay. Phase 3 (wenn jemals): RFM-Modell mit Behavior-Features.

---

## Section H — Master-Resolver (Cross-Source Dedup)

**Status:** Konzept-Skizze 2026-05-03. Wird kritisch nach D+E+F, weil dann **derselbe physische Kunde** in bis zu 6 Quellen vorkommt:

1. tape-mag MySQL (E.1)
2. vod-records db1 (E.2)
3. vod-records db11 (E.2)
4. vod-records db2013 (E.2)
5. MO-PDF-Rechnungen (D)
6. IMAP-extrahierte Email-Adressen (F)
7. Bestehende `customers`/`orders` in unserer Supabase

### H.1 Resolver-Algorithmus

**Match-Pipeline (in dieser Reihenfolge):**

```
1. Email-Match (case-insensitive, getrimmt)
   - Alle Source-Rows mit identischer LOWER(TRIM(email)) → ein Cluster
   - 70-80% der Dedups passieren hier

2. MO-Customer-No-Match (ADR-XXXXXX)
   - Nur PDF-Quelle hat das, aber wenn dieselbe ADR über mehrere Rechnungen → ein Cluster
   - 100% sicher (MO-Schlüssel ist kanonisch)

3. Adress-Hash-Match
   - Hash aus normalisierter Adresse: lower(strasse + plz + ort + land)
   - Catches: Kunde A bestellt unter Email1, Customer-No-X, andere Bestellung mit Email2, Customer-No-Y, gleiche Adresse → wahrscheinlich derselbe Mensch
   - Confidence 0.7-0.85 (wegen WG/Familien-Edge-Cases)

4. Name + PLZ + Land-Match
   - Vorname + Nachname (lower, ASCII-folded) + PLZ → Cluster
   - Confidence 0.6-0.8

5. Phone-Match (wenn vorhanden in beiden Quellen)
   - Confidence 0.85
```

**Output:** `master_contacts`-Tabelle mit:
- `master_id` (UUID)
- `canonical_email`, `canonical_name`, `canonical_address`
- `source_links` (JSON): `[{source: 'mo_pdf', source_id: 'ADR-015786'}, {source: 'vod_records_db2013', source_id: 4523}, ...]`
- `merge_confidence` (overall)
- `manually_reviewed` (boolean — Frank hat einzeln bestätigt)
- `lifetime_revenue` (sum across all sources)
- `first_seen_at`, `last_seen_at`

### H.2 Konflikt-Auflösung

**Bei Daten-Konflikten** (z.B. zwei Quellen haben unterschiedliche Vornamen für gleichen Email):
- **Recency-Wins:** Neuere `datum` gewinnt
- **Source-Priority:** MO-PDF (Frank's Buchhaltung) > VOD-Records-DB > tape-mag-MySQL > IMAP-extrahiert
- **Manual-Review-Queue** für Konflikte mit Confidence-Diff <0.1

### H.3 Sprint-Plan

| Sprint | Inhalt | Aufwand |
|---|---|---:|
| **H1.0 Schema** | `master_contacts` + Migration | 0.5 Tag |
| **H1.1 Resolver-Pipeline** | Match-Algorithmus, alle 5 Match-Stufen | 2 Tage |
| **H1.2 Manual-Review-UI** | Admin-Tab „Customer-Merge-Queue" für ambigue Cluster | 1 Tag |
| **H1.3 Promotion ins Produktiv-CRM** | Stub-Customer-Backfill (Option B B.2) basierend auf `master_contacts` statt Source-Tabellen direkt | 1 Tag |

**Total H1: ~4.5 Tage.** Läuft NACH D+E+F.

---


## Vergleich + Empfehlung

### Aktive Bausteine (nach Update 2026-05-03)

| Baustein | Aufwand | Was es liefert | Status |
|---|---:|---|---|
| **Section D — MO-PDF-Pipeline** | ~5 Tage | 10.575 Rechnungen + 7-Jahres-Lifetime-Revenue für ~5-8k Customers im Staging | **Phase 1 — Voraussetzung für G** |
| **Section E — Legacy-DB-Konsolidierung** | ~4 Tage | 4 DBs (db1/db11/db2013/tape-mag) zu ~14k Online-Kunden im Staging | **Phase 1 — parallel zu D** |
| **Section F — IMAP-Email-Mining** | ~4 Tage Code + 8-16h Background-Indexing | Email-Adressen für Bestandskunden mit Confidence-Scoring | **Phase 1 — nach D+E** |
| **Section H — Master-Resolver** | ~4.5 Tage | Cross-Source-Dedup, ein Master-Datensatz pro echter Person | **Phase 1 — nach D+E+F** |
| **Section G — Tier-Engine + Wave-Gate** | ~4 Tage | Bronze/Silver/Gold/Platinum-Klassifikation, Auktions-Block-Tier-Visibility-Gate | **Phase 1 — Launch-Blocker für Wave 1** |
| **Section C — Pre-Launch-Hardening** | ~3 Tage | `is_invited_user`-Gate auf Bid/Buy, Wellen-Admin-UI, Magic-Link, Rate-Limit | **Phase 1 — Launch-Blocker** |
| **Section A — Surface & Bridge** | ~3 Tage | Legacy-Customer-Tab, POS-Search-UNION, Forgot-Password-Bridge | **Phase 1 — UX-Sichtbarkeit** |
| Section B — Unified Customer Backfill | ~2 Wochen | Stubs für ALLE Bestandskunden in `customer`-Tabelle, Brevo-Bidirectional | **Phase 2 — kann nach Wave 1 nachgezogen werden** |
| Section D.5 — OfficeConnect-Bidirectional-Sync | ~5-7 Tage | vod-auctions → MO Rechnungs-Push, GoBD-konform | **Phase 3 — strategisch, deferred** |

### Reihenfolge (überarbeitet 2026-05-03)

**Neue Empfehlung: D + E parallel zuerst → F → H → G → C → A → Wave 1.**

**Begründung der Umkehr (vs. ursprünglich „C zuerst, dann A"):**
- **D + E + F + H sind die Daten-Grundlage.** Ohne sie sind die Tier-Schwellen in G geraten, die Wave-Strategie wird willkürlich, und Top-Spender-Reports zeigen nur 4.465 statt ~12-18k echte Customers. **Falsche Tiers killen die Wave-Wirkung.**
- **G ist Launch-Blocker für Wave-Mechanik.** Ohne Tier-Visibility-Gate auf Auktions-Blöcken kann „Gold sieht zuerst" nicht enforced werden — wir müssten alles per Email-Liste-Selektion kuratieren statt produkt-seitig differenzieren.
- **C bleibt Launch-Blocker** für die Generic-Auth-Härtung — kommt aber nach G, weil Tier-Gating die wichtigste Differenzierung ist und Tier-Berechnung zuerst korrekt sein muss.
- **A liefert Operative Sichtbarkeit** für Frank/Robin im Admin. Ist nicht Code-blockierend für Wave 1, aber stark wertvoll für die ersten Wochen Operations.
- **B + D.5 deferred.** Stub-Backfill (B) lohnt erst, wenn der Master-Resolver-Output stabil ist. OfficeConnect-Bidirectional (D.5) erst, wenn Frank Doppelarbeit zwischen vod-auctions.com und MO spürt.

### Sprint-Vorschlag (erneuert 2026-05-03)

| Sprint | RC-Range | Inhalt | Aufwand |
|---|---|---|---:|
| **Sprint D1** | rc53.0–rc53.2 | D1.0 Prototyp + D1.1 Vollextraktion + D1.2 Postgres-Migration + D1.3 Name-Norm + D1.4 QA | ~4 Tage |
| **Sprint E1** | parallel zu D1 | E1.0 Schema-Discovery + E1.1 db2013-Pull + E1.2 db1/db11-Pull + E1.3 tape-mag-Pull + E1.4 Cross-Source-Dedup-Audit | ~4 Tage |
| **Sprint F1** | nach D1+E1 | F1.0 IMAP-Probe + F1.1 Indexer-Code + F1.2 Initial-Run (8-16h Background) + F1.3 Matcher + F1.4 Review-Queue | ~4 Tage |
| **Sprint H1** | nach F1 | H1.0 Schema + H1.1 Resolver + H1.2 Manual-Review-UI | ~3.5 Tage |
| **Sprint G1** | nach H1 | G1.0-G1.4 Tier-Schema + Recalc + Brevo + Block-Tier-Gate + Storefront-Filter | ~4 Tage |
| **Sprint C1** | nach G1 | C.1 Migration + C.2 Access-Gate + C.3 Redeem-Flag + C.6 Rate-Limit | ~3 Tage |
| **Sprint A1** | nach C1 | A.0 Customers-Dedup + A.1 Legacy-API + A.2 POS-Search-UNION + A.4 Admin-Tab | ~2 Tage |
| **Sprint A2** | nach A1 | A.3 Auto-Stub + A.5.3 Forgot-Password-Bridge + A.5.7 Bridge-UI | ~2 Tage |
| **Sprint C2** | nach A2 | C.4 Magic-Link + C.5 Admin-Wave-UI + C.8 Brevo-Waitlist-Liste | ~2 Tage |
| **Wave 1 GO** | nach C2 | Voraussetzung: RSE-78 (AGB) + Re-DOI-Entscheidung geklärt | — |
| Sprint B (Phase 2, deferred) | tba | B.1-B.7 Stub-Backfill + Bidirectional-Brevo | ~2 Wochen |
| Sprint D.5 (Phase 3, deferred) | tba | OfficeConnect-API-Bridge — bidirectional Auktion → MO-Rechnung | ~5-7 Tage |

**Total Phase 1 (vor Wave 1):** ~32-35 Tage Code + 1 Tag QA + Buffer = **~7 Arbeitswochen**.

**Wesentliche Verschiebung:** Vorher 2 Wochen, jetzt 7 Wochen. Begründung: konsolidiertes Datenfundament + Tiering werden vorgezogen statt nachgereicht. Ohne diese Investition wäre die Wave-Strategie ein Lottoschein.

**Beschleunigungs-Hebel (falls 7 Wochen zu lang):**
- D1 + E1 echt parallel laufen lassen (verschiedene Skripte, kein Code-Konflikt) → spart ~4 Tage
- F1.2 Background-Run startet sobald F1.1 Code da ist, parallel zu H1+G1 → spart ~1 Tag
- Tier-Schwellen mit „Best-Effort" (ohne Frank-Kalibrierung) initial setzen, später nachjustieren → kein Tag gespart, aber reduziert Wartezeit auf Frank-Verfügbarkeit

→ Realistic Crash-Plan: **~5 Wochen** wenn parallelisiert.

---

## Open Decisions

**Daten-Konsolidierung (D + E + F + H):**

1. **MO-Customer-No als Master-Schlüssel?** Wenn ein Kunde in MO `ADR-015786` ist und in db2013 `id=4523`, ist die `ADR`-No der kanonische Identifier — oder doch die Email? Empfehlung: **Email primary, ADR als Cross-Ref** in `master_contacts.source_links`.
2. **`maier_db1` vs `maier_db11` — was ist wirklich der Unterschied?** Schema identisch (md5 gleich), Row-Count differiert. Ist db11 ein eingefrorener Schnappschuss von db1? Frage an Frank klärbar (oder via `MAX(datum)` Vergleich nach Pull). Wenn db11 echtes Subset von db1 ist: skip db11, sonst dedup-Output verschmutzt.
3. **db2013 `_kunden_alt` (3.097 Rows):** Was sind das? Alte Kunden vor 2013? Pre-Migration-Bestand? Vor Pull klären — wenn nur Test-Daten: ignorieren.
4. **Charset-Repair für tape-mag MySQL:** Wenn der Original-Dump schon Mojibake enthielt, brauchen wir `ftfy.fix_text()`-Pass im Pull. Stichproben-Test vor Vollpull.
5. **IMAP-Body-Speicher-Strategie:** 100k Mails × 5kb Body = ~500MB Staging-Volumen. Akzeptabel? Alternative: nur indexierte Header + on-demand Body-Refetch.
6. **IMAP-Folder-Whitelist:** Sollen wir `Gesendet`, `Inbox`, `Archive`, `Spam`, `Papierkorb` indexieren? Empfehlung: Inbox + Sent + Archive, **nicht** Spam/Papierkorb (Privatpersonen-Schreiben aus diesen Foldern sind PII-Risiko ohne Bestell-Bezug).
7. **Master-Resolver-Threshold:** Wenn Email-Match + Adress-Hash-Match konfligieren (zwei Customers mit gleicher Email aber unterschiedlicher Adresse), wer gewinnt? Empfehlung: Email + Manual-Review-Queue.

**Tiering (G):**

8. **Tier-Schwellen final:** €5k/€1.5k/€500/€100 sind Vorschlag. Frank-Kalibrierung mit echtem Histogramm nach D+E+F. Erwartung: könnten je nach Customer-Verteilung um Faktor 2-3 angepasst werden.
9. **Recency-Decay-Faktoren:** 0.7× ab 24m, 0.4× ab 48m sind Vorschlag. Alternative: lineare Decay (`weight = max(0, 1 - months/60)`).
10. **Tier-Visibility auf Storefront:** Soll der Customer sein Tier sehen? Empfehlung Phase 1: **nein**, internes Marketing-Tool.

**Bestehende (von 2026-04-25):**

11. **Newsletter-Subscribers-Tabelle:** Cleanup oder belassen? Aktuell unsichtbar, Brevo hat dieselbe Liste.
12. **`customers` (Plural) Lifecycle:** Nach Master-Resolver — Read-Only-Archiv oder Drop nach 90 Tagen? FK auf `orders` muss bleiben → Drop nicht trivial.
13. **Brevo-Plan:** Free-Tier reicht für 12-18k Contacts? Pre-Check Plan-Limits vor F+G+B-Sync.
14. **Re-DOI für Brevo List 5 (3.580):** Anwalt-Frage. Carry-Over-OK oder Re-DOI-Pflicht? Geht in RSE-78-Scope.
15. **Magic-Link-Default an/aus:** Empfehlung: sekundär — Magic-Link-Mails landen oft im Spam.
16. **Test-Account-Backfill:** Die 12 bestehenden `customer`-Rows sind alle Test-Accounts. Sollen die `is_invited_user=true` bekommen + `metadata.is_test_account=true` Marker?
17. **`platform_mode='preview'`-Use-Case:** Soft-Open (Browse + Apply, kein Bid) — wollen wir das?

**Section-D-Phase-3-Decisions (deferred — OfficeConnect):**

18. **MO Phase-Out vs. Continued-Sync:** Empfehlung Continued-Sync dauerhaft mit OfficeConnect, aber erst wenn bidirectional Sync gewünscht.
19. **OfficeConnect-Lizenz:** Robin beantragt online im prosaldo-Shop, sobald Phase 3 ansteht.

---

## Verwandte Docs (zu erstellen / pflegen)

- [`docs/architecture/LEGACY_MYSQL_DATABASES.md`](../architecture/LEGACY_MYSQL_DATABASES.md) — vollständiges MySQL-DB-Inventar (vodtapes, maier_db1/11/2013) inkl. Schema, Counts, Cross-Source-Beziehungen
- [`Monkey Office/rechnungs-extraktion-crm-konzept.md`](../../Monkey%20Office/rechnungs-extraktion-crm-konzept.md) — Codex-Konzept (Section-D-Quelle), volle Schema-Listen für `contacts`/`transactions`/`transaction_items`/`email_candidates`
- [`docs/architecture/CUSTOMER_LIFECYCLE.md`](../architecture/CUSTOMER_LIFECYCLE.md) — verbindliche UX-Wording-Referenz für die 6 Online-Flows + Bridge-Logik (Pflicht-Lektüre für Storefront-Devs)
- [`docs/architecture/INVITE_FLOW.md`](../architecture/INVITE_FLOW.md) — operative Spec für das gehärtete Invite-System inkl. Wave-Handling (TODO)
- [`docs/architecture/MONKEY_OFFICE_PDF_PIPELINE.md`](../architecture/MONKEY_OFFICE_PDF_PIPELINE.md) — operative Spec für Section D PDF-Extraktion (TODO nach D1.0)
- [`docs/architecture/LEGACY_DB_PULL.md`](../architecture/LEGACY_DB_PULL.md) — operative Spec für Section E Legacy-DB-Konsolidierung (TODO nach E1.0)
- [`docs/architecture/IMAP_INDEXER.md`](../architecture/IMAP_INDEXER.md) — operative Spec für Section F IMAP-Pipeline + Match-Algorithmen (TODO nach F1.0)
- [`docs/architecture/CUSTOMER_TIERING.md`](../architecture/CUSTOMER_TIERING.md) — Tier-Engine (Section G) + Wave-Visibility-Gate-Spec (TODO nach G1.0)
- `docs/TODO.md` Workstream „CRM Legacy Konsolidierung" mit Sprint-Tabelle aus oben

---

**Vorgeschlagener nächster Schritt (überarbeitet 2026-05-03):**

1. **Diese Woche:** Sprint D1 starten — lokaler Prototyp `mo_pdf_pipeline.py` auf 100 Sample-PDFs aus 2019/2022/2025 (D1.0). Sobald die Parser-Robustheit auf Sample steht, Vollextraktion in den Hintergrund-Run schicken.
2. **Parallel:** Sprint E1 — `legacy_db_pull.py` mit `pymysql` gegen `dedi99.your-server.de:3306` (R/O-Accounts). db2013 zuerst (reichhaltigste Quelle, 8.544 Customers + 17.315 Adressen). Tape-mag MySQL parallel via 1Password-Credentials.
3. **3-Credentials-Hygiene:** Bevor irgendein Code committed wird — alle drei Hetzner-DB-Credentials + SSH-maier in 1Password Work ablegen (`Hetzner dedi99 SSH (maier)`, `Legacy MySQL maier_db1 (R/O)`, etc.). Skripte ziehen via `op` oder `.env` (nie git).
4. **Nach D1+E1:** Sprint F1 IMAP-Indexer. Background-Run startet sobald `imap_indexer.py` steht, 8-16h Laufzeit pro Account.
5. **Nach F1:** Master-Resolver (H1) → Tiering (G1) → Pre-Launch-Hardening (C1+C2) → Surface (A1+A2) → Wave 1 GO.

**Anwalt-Parallel-Track:** RSE-78 (AGB + Re-DOI Brevo List 5 + DSGVO für IMAP-Mining) so früh wie möglich starten — Lead-Time mehrere Wochen. **Speziell für Section F:** Anwalt muss bestätigen, dass das Indexieren von Frank's geschäftlicher Mail-Korrespondenz mit Kunden zum Zweck der CRM-Anreicherung im Rahmen des berechtigten Interesses (Art. 6 (1) f) zulässig ist + Lösch-Policy nach 90 Tagen für Body-Auszüge.

**Owner-Klarstellung:** Frank ist Vinyl-Operator. Sein Input wird gebraucht für:
- Manual-Review der ambigue Master-Resolver-Cluster (Section H1.2) — geschätzt 100-300 Cases
- Tier-Schwellen-Kalibrierung mit echtem Revenue-Histogramm (Section G1.1) — 30min Session
- Wave-1-Strategie-Bestätigung (welche Top-Spender werden persönlich kontaktiert?) — 30min Session

Robin koordiniert Discovery, Implementation, Auswahl der Match-Patterns, Anwalt-Briefing, Phase-3-Strategie.
