# CRM Phase 1 — Data Foundation (Staging-Layer)

**Status:** S0 done · S1/S2/S3 ready to start (parallel)
**Start:** 2026-05-03
**Ziel:** Vollständige Kundendaten + Transaktionsdaten aus 3 Legacy-Quellen in Supabase-Staging-Schema. **Kein Master-Resolver, kein Dedup** in dieser Phase — das passiert in Phase 2.

## Übergeordnete Doks
- [`CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md`](../optimizing/CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md) — Gesamt-Plan
- [`CRM_DATA_ARCHITECTURE_DECISIONS.md`](../architecture/CRM_DATA_ARCHITECTURE_DECISIONS.md) — Entscheidungsvorlage (Phase 2)
- [`LEGACY_MYSQL_DATABASES.md`](../architecture/LEGACY_MYSQL_DATABASES.md) — Quell-Schema-Inventar

## Robin-Decisions vom 2026-05-03 (verbindlich für Phase 1)

| Frage | Entscheidung |
|---|---|
| 2-Schichten-Modell (Staging zuerst, Master später) | ✅ ja |
| Schema-Prefix `crm_staging_*` + `crm_*` | ✅ ja |
| `pwd`-Hashes nicht ziehen | ✅ ja |
| `_kunden_bank` nicht ziehen (DB-2013) | ✅ ja |
| IMAP-Folder-Whitelist (Inbox + Sent + Archive, kein Spam/Papierkorb) | ✅ ja |
| MO-PDFs Pfad: `Monkey Office/Rechnungen/<Jahr>/` (2003-2026 alle hier) | ✅ ja |

---

## S0 — Schema-Foundation ✅ DONE

**Migration:** [`backend/scripts/migrations/2026-05-03_crm_staging_schema.sql`](../../backend/scripts/migrations/2026-05-03_crm_staging_schema.sql)
**Rollback:** [`backend/scripts/migrations/2026-05-03_crm_staging_schema_rollback.sql`](../../backend/scripts/migrations/2026-05-03_crm_staging_schema_rollback.sql)
**Applied:** 2026-05-03 via Supabase MCP (`apply_migration`, name `crm_staging_schema_2026_05_03`)
**Verified:** 9 Tables + 1 View live in `bofblwqieuvmqybzxapx.public`

### Tabellen
| Tabelle | Zweck | Spalten |
|---|---|---:|
| `crm_pull_run` | Pipeline-Run-Audit | 16 |
| `crm_staging_contact` | Roh-Kontakte pro Quelle (UNIQUE source+source_record_id) | 15 |
| `crm_staging_email` | 1:N Emails | 14 |
| `crm_staging_address` | 1:N Adressen | 23 |
| `crm_staging_phone` | 1:N Telefon-Nummern | 9 |
| `crm_staging_transaction` | Rechnungen + Bestellungen | 29 |
| `crm_staging_transaction_item` | Zeilen pro Transaction | 16 |
| `crm_imap_message` | IMAP-Index | 22 |
| `crm_layout_review_queue` | MO-PDF Layout-Drift | 12 |
| `crm_source_status` (View) | Aggregat für Sources-Tab | 11 |

---

## S1 — D1 MO-PDF-Pipeline (parallel)

**Quelle:** `Monkey Office/Rechnungen/<Jahr>/*.pdf` (10.575 PDFs 2019-2026, später bis 2003)
**Target:** `crm_staging_contact` (mo_pdf-Erscheinungen) + `crm_staging_address` + `crm_staging_transaction` + `crm_staging_transaction_item`

### Files anzulegen

| File | Zweck |
|---|---|
| `scripts/crm_staging_lib.py` | Shared: DB-Connect, Pull-Run-Lifecycle, Source-Tag-Konvention |
| `scripts/mo_pdf_pipeline.py` | Hauptskript — durchläuft alle PDFs, parst, schreibt nach Staging |
| `scripts/mo_pdf_lib/parser.py` | Versionierter Layout-Parser (Templates 2019-2026 zuerst, ältere bei Bedarf) |
| `scripts/mo_pdf_lib/regex_patterns.py` | Regex-Bibliothek pro Template |
| `scripts/mo_pdf_lib/normalize.py` | Name-Splitter, Adress-Normalizer |

### Pipeline-Flow
1. **Inventory** — `find Monkey Office/Rechnungen -name '*.pdf'` → File-Hash + Pfad in Memory
2. **Skip-if-known** — Hash gegen `crm_staging_transaction.source_pdf_hash` checken (idempotent)
3. **Extract** — `pdftotext -layout` → Roh-Text
4. **Layout-Detect** — Header-Struktur + Datums-Cluster → Template-Version
5. **Parse** — pro Template: Header (Rechnungsnummer/Datum/Kundennr/Adresse) + Positionen + Summen
6. **Validate** — Plausibilität (Σ Positionen ≈ Total ± 0.05), Pflichtfelder
7. **Insert** — Transaction (UPSERT auf `(source, source_record_id)`) + Items + Contact-Stub (UPSERT)
8. **Layout-Drift** — unbekannte Layouts oder Parse-Failures → `crm_layout_review_queue`

### Test-Strategie (vor Vollauf)
- **Sample-Run:** 100 zufällige PDFs aus 2019/2022/2025 → Inspect Output + QA-Report
- **Edge-Cases:** AR-2025-000001 (Abschlagsrechnung mit fehlenden Preisen), KR-Korrekturen, PR-Proforma
- **Doppel-Erkennung:** zwei verschiedene PDFs mit gleicher Rechnungsnummer → soll Konflikt loggen, nicht silent überschreiben

### Erwartete Outputs nach Vollauf
- ~10.575 `crm_staging_transaction`-Rows mit doc_type RG/KR/PR/AR
- ~50-70k `crm_staging_transaction_item`-Rows
- ~5.000-8.000 unique `crm_staging_contact`-Rows (eine Person hat mehrere Rechnungen)
- ~5.000-8.000 unique `crm_staging_address`-Rows
- 0-50 Cases in `crm_layout_review_queue` (akzeptabel)

### Aufwand
~4 Tage Code (Parser + Pipeline + Tests + Sample-Run + Vollauf)

### Out-of-Scope (Phase 1)
- Email-Adressen aus PDFs (PDFs enthalten meistens keine — kommt aus IMAP)
- Tier-Berechnung
- Master-Bridge zu `customer`-Tabelle

---

## S2 — E1 Legacy-DB-Pull (parallel)

**Quellen:** 4 MariaDB-DBs auf `dedi99.your-server.de:3306` (R/O-Accounts in 1Password Work)
**Target:** `crm_staging_contact` + `_email` + `_address` + `_phone` + `_transaction` + `_transaction_item`

### Files anzulegen

| File | Zweck |
|---|---|
| `scripts/legacy_db_pull.py` | Hauptskript — pullt alle 4 DBs nach Staging |
| `scripts/legacy_db_lib/connect.py` | pymysql-Wrapper, R/O-Connection, Charset-Detection |
| `scripts/legacy_db_lib/vodtapes.py` | Pull-Logik für tape-mag.com (Members-Table `3wadmin_extranet_user`) |
| `scripts/legacy_db_lib/maier_db.py` | Pull-Logik für maier_db1/db2013 (vod-records.com Webshop) |
| `scripts/legacy_db_lib/charset_repair.py` | ftfy-Pass für Mojibake (PHP4/MySQL4-Ära) |

### Pull-Reihenfolge (innerhalb S2)

| # | DB | source-Tag | Tabellen | Wichtig |
|---|---|---|---|---|
| 1 | vodtapes | `vodtapes_members` | 3wadmin_extranet_user (3.632 Members) | Login-Stamm tape-mag.com |
| 2 | maier_db2013 | `vod_records_db2013` | 3wadmin_shop_kunden (8.544) + `_kunden_adresse` (17.315) + `_kunden_alt` (3.097) + `_bestellungen` (8.230) + `_bestellungen_artikel` (13.617) | LIVE-Bestand vod-records.com (Date-Range bis 2026-04-30) |
| 3 | maier_db1 | `vod_records_db1` | 3wadmin_shop_kunden (3.114) + `_bestellungen` (3.062) + `_bestellungen_artikel` (4.701) | Pre-2013-Iteration (Schema kompakter, datum=int Unix-TS) |
| 4 | maier_db11 | (skip — Snapshot 2012, redundant) | — | Nur Cross-Check, kein eigenständiger Pull |

### Pipeline-Flow pro DB
1. Connect via `pymysql` mit R/O-User (Password aus 1Password via `op item get … --reveal`)
2. Charset-Sample: 20 Rows mit Umlauten → Mojibake-Detection
3. Pull `kunden`-Tabelle in Chunks à 500 → `crm_staging_contact` UPSERT
4. Pull `kunden_adresse` (sofern existent) → `crm_staging_address` UPSERT
5. Pull `bestellungen` → `crm_staging_transaction` UPSERT (datum konvertieren wenn int)
6. Pull `bestellungen_artikel` → `crm_staging_transaction_item` UPSERT
7. Bei `kunden_alt` (db2013): mit `source='vod_records_db2013_alt'` als separater Source ablegen
8. **Niemals `pwd`-Spalten** im SELECT, **niemals `_kunden_bank`**

### Edge-Cases
- `bestellungen.bid` ist varchar in Items → Cast bei JOIN nötig
- `rechadr`/`lieferadr` Free-Text bei db1/db11 → in `billing_address_raw`/`shipping_address_raw` legen, nicht parsen
- db2013 hat strukturierte Adressen separat → vorrangig nehmen
- Charset: bei utf8mb4 OK, bei latin1/cp1252 → `ftfy.fix_text()`-Pass

### Erwartete Outputs nach Vollauf
- ~17.730 `crm_staging_contact`-Rows (mit Doppel-Erscheinungen über DBs — Dedup erst Phase 2)
- ~17.315 `crm_staging_address`-Rows aus db2013 alone
- ~14.792 `crm_staging_transaction`-Rows
- ~22.090 `crm_staging_transaction_item`-Rows

### Aufwand
~4 Tage Code (Connect + 4 Pull-Skripte + Charset-Repair + Tests + Vollauf)

---

## S3 — F1 IMAP-Indexer (parallel — Code 2 Tage, Background-Run 8-16h pro Account)

**Quellen:** 2 IMAP-Postfächer auf `mail.your-server.de:993` (Hetzner Mailbox-Hosting)
- `frank@vod-records.com` (1Password `mfcjmrompkjjxap6il5nbsd7pa`)
- `frank@vinyl-on-demand.com` (1Password `7fos2enccq4p7moqnpkcjdlpgi`)

**Target:** `crm_imap_message` (Header + Body-Excerpt + erkannte Refs)

### Files anzulegen

| File | Zweck |
|---|---|
| `scripts/imap_indexer.py` | Hauptskript — IMAP-Connection + UID-Iteration + Postgres-Insert |
| `scripts/imap_lib/connection.py` | imaplib-SSL-Wrapper mit BODY.PEEK-Pflicht |
| `scripts/imap_lib/parser.py` | Header-Parser, Body-Excerpt-Extractor, Regex-Detection |
| `scripts/imap_lib/regex_refs.py` | Regex für `ADR-XXXXXX` (Customer) + `RG-/KR-/PR-XXXXXX` (Invoice) + Email-Match |

### Pipeline-Flow pro Account
1. Connect IMAPS:993 mit SSL-Context (Hetzner-Cert via DigiCert)
2. Folder-Whitelist: `INBOX`, `Sent` (oder `Gesendet`), `Archive` (oder `Archiv`) — **NIEMALS** Spam/Papierkorb
3. Pro Folder: `UIDVALIDITY` lesen → in `crm_imap_message.uid_validity` (Inkrementell-Sync-Key)
4. `UID SEARCH ALL` → UID-Liste, in Chunks à 200
5. **`UID FETCH (BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.5120>)`** — `PEEK` zwingend, sonst werden Mails als gelesen markiert
6. Header parsen: From/To/Cc/Reply-To/Subject/Date/Message-ID
7. Body-Excerpt: erste 5kb plain (decode MIME wenn nötig)
8. Regex-Detect: `ADR-\d{6}`, `(RG|KR|PR)-\d{4}-\d{6}`, `\b[\w.+-]+@[\w-]+\.[\w.-]+\b`
9. UPSERT auf `(account, folder, msg_uid)`

### Sicherheit
- **`BODY.PEEK[…]` zwingend** — sonst Frank's Postfach „verbrannt"
- Body-Excerpt nach 90 Tagen anonymisieren (separater Cron später, in Phase 2)
- Logs ohne Vollinhalt — nur msg_uid + match-result

### Erwartete Outputs nach Vollauf
- ~80-120k `crm_imap_message`-Rows total über beide Accounts
- ~20-40% mit `detected_customer_refs` oder `detected_invoice_refs` (= IMAP-Match-Pool für Phase 2)

### Aufwand
~2 Tage Code (IMAP-Wrapper + Parser + Tests) + 8-16h Background-Run pro Account (parallel)

### Out-of-Scope (Phase 1)
- Match auf `crm_staging_contact` (= `crm_email_candidate`-Befüllung) → Phase 2 Master-Resolver
- AI-Klassifikation der Mail-Inhalte → später

---

## Parallelitäts-Matrix

S1, S2, S3 dürfen alle parallel laufen — kein Code-Konflikt:
- S1 schreibt mit `source='mo_pdf'`
- S2 schreibt mit `source IN ('vodtapes_members','vod_records_db1','vod_records_db2013','vod_records_db2013_alt')`
- S3 schreibt nur in `crm_imap_message` (eigene Tabelle)

Robin/Frank kann während der Background-Runs (S3) bereits in S1/S2-Daten reinschauen.

---

## Was nach Phase 1 fertig ist

- ✅ Vollständige Roh-Daten aus 3 Quellen in Supabase
- ✅ Pro Quelle eine `pull_run`-Audit-Spur
- ✅ Layout-Drift-Queue für unbekannte MO-PDFs
- ✅ IMAP-Header-Index mit erkannten Customer-/Invoice-Refs

## Was Phase 1 NICHT macht (= Phase 2)

- ❌ Master-Resolver (Cross-Source-Dedup)
- ❌ `crm_contact`-Master-Tabelle (Single-Source-of-Truth pro Person)
- ❌ Tier-Klassifikation (Bronze/Silver/Gold/Platinum)
- ❌ Activity-Timeline-View
- ❌ Bridge zu Medusa-`customer`
- ❌ Admin-UI für Contact-Detail-Page
- ❌ Brevo-Bidirectional-Sync für Master

Phase 2 startet, sobald S1+S2+S3 fertig durchgelaufen sind und Robin die Roh-Daten stichprobenartig sichten konnte. Vorher trifft Robin in [`CRM_DATA_ARCHITECTURE_DECISIONS.md`](../architecture/CRM_DATA_ARCHITECTURE_DECISIONS.md) die noch offenen 6 Architektur-Entscheidungen.

---

## Sprint-Tracking

| Sprint | Status | Started | Done | Notes |
|---|---|---|---|---|
| S0 Schema | ✅ | 2026-05-03 | 2026-05-03 | 9 Tables + 1 View live in `bofblwqieuvmqybzxapx`. Plus UNIQUE-Constraints auf `_email`/`_phone`/`_address` nachgerüstet |
| S2.1 vodtapes_members | ✅ | 2026-05-03 | 2026-05-03 | 3.632 contacts + 3.632 emails. 100% Email-Coverage |
| S2.2 vod_records_db2013 | ✅ | 2026-05-03 | 2026-05-03 | 8.544 contacts + 17.309 addresses + 8.230 transactions + 13.504 items. Plus 3.097 contacts_alt + 3.089 alt-addresses |
| S2.3 vod_records_db1 | ✅ | 2026-05-03 | 2026-05-03 | 3.114 contacts + 3.106 addresses + 3.062 transactions + 4.679 items |
| S1 MO-PDF | ✅ | 2026-05-03 | 2026-05-03 | 10.575 PDFs → 3.954 unique customers + 10.574 transactions + 48.277 items. 99,99% Erfolgsrate, 1 Edge-Case (leere stornierte Rechnung) reprocessed |
| S3 IMAP frank@vod-records.com | ✅ | 2026-05-03 | 2026-05-03 | ~91k Mails (INBOX 56.140 + Sent + Sent Messages je ~35k + Archive 319) |
| S3 IMAP frank@vinyl-on-demand.com | ✅ | 2026-05-03 | 2026-05-04 | ~21k Mails (INBOX 13.910 + Sent + Sent Messages je 6.561 + Archive 5 + Notes 1) |

## Phase 2 — Master-Resolver

| Sprint | Status | Done | Notes |
|---|---|---|---|
| Master-Schema | ✅ | 2026-05-03 | 7 Tabellen (crm_master_*) + 1 View live |
| Stage 1 Email-Match | ✅ | 2026-05-03 | 18.387 staging_contacts mit Email → 10.797 unique Master-Contacts |
| Stage 1b Address+Phone Attach | ✅ | 2026-05-03 | 11.933 master_addresses, 6.923 master_phones |
| Stage 2a Adress-Hash mo_pdf | ✅ | 2026-05-03 | 302 mo_pdf-Customers gemerged mit Webshop-Customers |
| Stage 2b/c eigene Master für mo_pdf-Rest | ✅ | 2026-05-03 | 3.652 neue Master via Tag-basiertes 1:1-Mapping. Final ergänzt um 1.064 orphans via `sid_<staging_id>`-Tag |
| Stage 3 Name+PLZ-Fuzzy | 🟡 | — | Pending — derzeit keine offenen unmatched-Customers übrig, kann übersprungen werden |
| Stage 4 IMAP-Email-Anreicherung | 🟡 | — | 3.350 mo_pdf-only-Master ohne Email könnten Email aus IMAP-Header bekommen |
| Lifetime-Revenue-Aggregation | 🟡 | — | `master_contact.lifetime_revenue` aus `crm_staging_transaction` summieren |
| Tier-Engine | 🟡 | — | Bronze/Silver/Gold/Platinum auf Basis Revenue + Recency-Decay |
| Bridge zu Medusa-`customer` | 🟡 | — | Phase 3 |
| Admin-UI | 🟡 | — | `/app/crm` „Master Contacts"-Tab — Phase 3 |

## Lessons aus dieser Phase

1. **MySQL-Idle-Timeout via SSH-Tunnel:** Bei 3-4 Min Pass-Dauer killt MySQL die idle Connection. Fix: `ping(reconnect)` vor jedem neuen Pass + `fetchall()` statt Streaming-Cursor. Memory-Eintrag `feedback_mysql_streaming_idle_timeout.md`.
2. **Idempotente Re-Runs sind essential.** UPSERT auf `(source, source_record_id)` lässt jede Pipeline beliebig oft neu starten ohne Datenverlust.
3. **`customer_uuid_map` aus DB rekonstruierbar:** `load_customer_uuid_map()` lädt die map nach einem Crash mid-Pass aus dem Staging — kein Datenverlust durch in-memory-Verlust.
4. **Sample-PDFs zeigen stabiles MO-Layout** für 2019-2026 — Layout-Detection wird in S1 simpler als befürchtet (vermutlich nur ein Template für diese Range). 99,99% Erfolg bestätigt das.
5. **MCP-basierter SQL-Resolver schlägt Python-via-Tunnel** für set-basierte Stages. Stages 1+2 komplett via `apply_migration`/`execute_sql` — schneller, robuster, kein Tunnel-Risiko.
6. **Cross-Source-Email-Match deckt nur ~50%** des Customer-Bestands. mo_pdf-Customers (3.954) haben 0% Email-Coverage und brauchen Adress-Hash + Name-Match-Strategien parallel.
7. **mo_pdf-Customers sind zu ~92% telefonisch/Messen-Customers** ohne Web-Account-Bindung (nur 8% Adress-Match mit Online-Customers). Tier-Engine muss beide Welten zusammenbringen: Online-Lifetime-Revenue + MO-Buchhaltungs-Revenue.

## Lessons aus Sprint S2 (2026-05-03)

1. **MySQL-Idle-Timeout via SSH-Tunnel:** Bei 3-4 Min Pass-Dauer killt MySQL die idle Connection. Fix: `ping(reconnect)` vor jedem neuen Pass + `fetchall()` statt Streaming-Cursor. Memory-Eintrag `feedback_mysql_streaming_idle_timeout.md`.
2. **Idempotente Re-Runs sind essential.** UPSERT auf `(source, source_record_id)` lässt jede Pipeline beliebig oft neu starten ohne Datenverlust.
3. **`customer_uuid_map` aus DB rekonstruierbar:** `load_customer_uuid_map()` lädt die map nach einem Crash mid-Pass aus dem Staging — kein Datenverlust durch in-memory-Verlust.
4. **Sample-PDFs zeigen stabiles MO-Layout** für 2019-2026 — Layout-Detection wird in S1 simpler als befürchtet (vermutlich nur ein Template für diese Range).
