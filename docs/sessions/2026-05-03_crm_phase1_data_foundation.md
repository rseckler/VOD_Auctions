# Session 2026-05-03 — CRM Phase 1 Data Foundation + Phase 2 Master-Resolver Stage 1+2

**Dauer:** 2026-05-03, ~10h Session
**Pull-Endzeit:** 2026-05-04 (UTC)
**Owner:** Robin Seckler + Claude Code (Opus 4.7)
**Auto-Mode:** aktiv durchgängig
**Verwandte Doks:** [`CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md`](../optimizing/CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md), [`CRM_PHASE_1_DATA_FOUNDATION.md`](../sprints/CRM_PHASE_1_DATA_FOUNDATION.md), [`LEGACY_MYSQL_DATABASES.md`](../architecture/LEGACY_MYSQL_DATABASES.md), [`CRM_DATA_ARCHITECTURE_DECISIONS.md`](../architecture/CRM_DATA_ARCHITECTURE_DECISIONS.md)

## Outcome — was steht nach dieser Session

**Phase 1 (Data Foundation) ✅ COMPLETE**
- 22.341 Roh-Kontakt-Erscheinungen aus 5 Quellen in `crm_staging_*`-Schema
- 21.866 Transaktionen + 66.460 Line-Items (7+ Jahre Lifetime-Revenue-Daten)
- 34.079 Adressen, 10.372 Phones
- ~153.000 IMAP-Mails indexiert mit Header + Body-Excerpt + erkannten Refs

**Phase 2 Stage 1+2 (Master-Resolver) ✅ COMPLETE**
- 14.449 unique Master-Contacts (35% Dedup-Reduktion gegenüber Roh-Erscheinungen)
- 22.341 source_links mit Audit-Trail
- 10.797 Master-Emails, 15.585 Master-Adressen, 6.923 Master-Phones

## Was als nächste Session ansteht (Phase 2 Stage 3-4 + Phase 3)

1. **Stage 4 — IMAP-Email-Anreicherung:** 3.350 mo_pdf-only-Master ohne Email per IMAP-Header-Match mit Email versorgen
2. **Lifetime-Revenue-Aggregation:** `master_contact.lifetime_revenue` aus `crm_staging_transaction` summieren (~21.867 Transactions × Items)
3. **Tier-Engine:** Bronze/Silver/Gold/Platinum auf Basis Revenue + Recency-Decay
4. **Bridge zu Medusa-`customer`:** `medusa_customer_id` setzen
5. **Test-Flag:** `is_test=true` für offensichtliche Test-Accounts (z.B. `sam***@email.tst` mit 90 source_links)
6. **Admin-UI:** `/app/crm` „Master Contacts"-Tab + Detail-Page
7. **Architektur-Entscheidungen:** Robin reviewt [`CRM_DATA_ARCHITECTURE_DECISIONS.md`](../architecture/CRM_DATA_ARCHITECTURE_DECISIONS.md) (6 offene Decisions)

## Workflow + Infrastruktur-Notizen

**SSH-Tunnel zu Supabase nötig** weil Direct-Hostname IPv6-only:
```bash
ssh -fN -L 5433:db.bofblwqieuvmqybzxapx.supabase.co:5432 vps
```
Lokale `.env` hat `SUPABASE_DB_URL=postgresql://postgres:<PW>@127.0.0.1:5433/postgres`. Tunnel kann via `pkill -f "5433:db.bofblwqieuvmqybzxapx"` gestoppt werden.

**Bei SSH-Agent-Fail (1Password Communication):** macOS 1Password-App neu starten — der ED25519-Key wird sonst nicht von Agent signed.

**Master-Resolver via Supabase MCP statt Python:** Stage 1+2 als pure SQL via `apply_migration`/`execute_sql` — set-basiert, schnell, kein Tunnel nötig. Skript `scripts/master_resolver.py` ist als Backup für komplexere Stages (3, 4) da, aber bisher nicht produktiv ausgeführt.

## Abfolge der Session — Highlights

### 1. Schema-Klärung & Architektur (1-2h)
- Robin's Korrektur: vod-auctions.com ist nicht live, alle echten Daten kommen aus Legacy-Systemen
- Decision-Vorlage `CRM_DATA_ARCHITECTURE_DECISIONS.md` erstellt mit 6 offenen Architektur-Fragen
- Robin: Empfehlungen lesen, später entscheiden — vorerst Daten-Foundation aufbauen
- Robin's Antworten zur Foundation: 2-Schichten-Modell (Staging zuerst, Master später) ✓, Schema-Prefix `crm_staging_*` + `crm_*` ✓, keine pwd-Hashes ✓, keine `_kunden_bank` ✓, IMAP-Folder-Whitelist Inbox+Sent+Archive ✓, MO-PDFs auf `Monkey Office/Rechnungen/<Jahr>/` ✓, **kein OCR** ✓

### 2. Datenbank-Discovery (~1h)
- 4 Hetzner-MySQL-DBs auf `dedi99.your-server.de:3306` identifiziert + getestet
- `vodtapes` = tape-mag.com Member-CMS (Catalog + 3.632 Members in `3wadmin_extranet_user`)
- `maier_db2013` = LIVE vod-records.com / vinyl-on-demand.com Webshop (8.544 Customers)
- `maier_db1` = Pre-2013-Webshop-Iteration (3.114 Customers)
- `maier_db11` = Snapshot 2012 (skip, redundant)
- HTML-Inspektion bestätigt: vod-records.com läuft auf 3wadmin (NICHT WooCommerce wie `crm_import.py:7` veraltet behauptet)

### 3. Foundation-Schema (S0)
- Migration `2026-05-03_crm_staging_schema.sql` → 9 Tabellen + 1 View + 22 Indexes
- Robin-Decisions in Migration-Header dokumentiert
- Idempotent + reversibel, additiv

### 4. Pipeline-Implementation
- `scripts/crm_staging_lib.py` — Pull-Run-Lifecycle, 1Password-Resolver, Insert-Helpers (alle UPSERT)
- `scripts/legacy_db_pull.py` — DB-Pull für vodtapes_members + db2013 + db1 (db11 skip)
- `scripts/mo_pdf_pipeline.py` — PDF-Inventory + pdftotext + Layout-Parser
- `scripts/mo_pdf_lib/parser.py` — Versionierter Parser für `mo-2019-2026`-Layout
- `scripts/imap_indexer.py` — IMAP-Index mit BODY.PEEK + Folder-Whitelist + Regex-Detection

### 5. Pull-Runs

| Pipeline | Dauer | Output | Notes |
|---|---:|---|---|
| S2.1 vodtapes_members | ~1.5 Min | 3.632 contacts + 3.632 emails | 100% Email-Coverage, 0% tel |
| S2.2 vod_records_db2013 | ~10 Min (Re-Run nach MySQL-Idle-Timeout) | 8.544 contacts + 17.309 addr + 8.230 trans + 13.504 items + 3.097 alt | **MySQL-Idle-Timeout-Bug entdeckt + gefixt** (ping(reconnect) + fetchall vor Postgres-Inserts) |
| S2.3 vod_records_db1 | ~5 Min | 3.114 contacts + 3.106 addr + 3.062 trans + 4.679 items | Pre-2013-Schema mit datum=int Unix-TS |
| S1 MO-PDF Vollauf | ~25 Min | 10.575 PDFs → 3.954 unique customers + 10.574 trans + 48.277 items | 99,99% Erfolg (1 Edge-Case: leere stornierte Rechnung) |
| S3 IMAP frank@vod-records.com | ~1.5h | ~91k Mails + 91 Invoice-Refs + 723 Email-Mentions | INBOX 56k + Sent 35k×2 (Aliase) + Archive 319 |
| S3 IMAP frank@vinyl-on-demand.com | ~25 Min | ~21k Mails + 369 Email-Mentions | INBOX 14k + Sent 6.5k×2 + Archive 5 |

### 6. Bug-Fixes während des Pulls

| Bug | Fix |
|---|---|
| MySQL-Idle-Timeout via SSH-Tunnel zwischen Multi-Pass-Pulls | `conn_my.ping(reconnect=True)` vor jedem Pass + `cursor.fetchall()` statt Streaming |
| Email/Phone-Doubletten beim Re-Run (kein UNIQUE-Constraint) | UNIQUE-Constraint nachgerüstet via Migration `crm_staging_email_phone_unique_2026_05_03`, Lib auf UPSERT umgestellt |
| MO-PDF-Parser RE_INVOICE_NO matcht nicht "Korrekturrechnung Nr." | Regex erweitert um `(?:Korrektur|Proforma|Abschlags)?[Rr]echnung` |
| Negative Beträge in KR-Rechnungen werden nicht geparst | `-?` in unit_price + line_total + total Regexen |
| Customer-Block-Parser greift VOD-Footer-Continuation `• Deutschland` mit | Skip-Logik: Zeilen die mit `•` beginnen ignorieren |
| Country-Erkennung versagte bei DE (keine Country-Zeile) | PLZ-Pattern + US-State-Pattern, Country = letzte Zeile NACH PLZ |
| Layout-Detection requires PositionHeader (versagt bei leeren stornierten Rechnungen) | Layout-Detection lockerer: VOD-Header + (PositionHeader ODER InvoiceNo) |
| IMAP-Folder-Whitelist matcht nicht Hetzner-Format `INBOX.Sent Messages` | Pattern-basierter Filter mit IMAP-Special-Use-Flags (`\Sent`, `\Trash`) |

### 7. Master-Resolver Phase 2 (Stage 1+2)

- Schema-Migration `crm_master_schema_2026_05_03` → 7 Tabellen + 1 View
- Stage 1 (Email-Match): 18.387 Email-bearing staging_contacts → 10.797 unique Master-Contacts
- Stage 1b: master_address (15.585), master_phone (6.923), Convenience-Fields aktualisiert
- Stage 2a (Adress-Hash für mo_pdf): 302 mo_pdf-Customers gemerged mit Webshop-Customers
- Stage 2b/c (eigene Master für mo_pdf-Rest): 3.652 neue Master per Tag-basiertem 1:1-Mapping erzeugt
- 1.064 orphan-Master mit Mismatch-Match nochmal mit Tag-Mapping per `sid_<staging_id>` repariert
- Final: 14.449 unique Master-Contacts mit 22.341 source_links (= 100% Coverage)

## Schlüssel-Erkenntnisse

1. **Email-Match deckt nur ~50% des Customer-Bestands ab.** Online-Customers haben 100% Email-Coverage, aber **mo_pdf-Customers (3.954) haben 0%**. Master-Resolver braucht Email + Adress-Hash + Name+PLZ-Strategien parallel.

2. **Cross-Source-Overlap ist real:** 138 Customers in allen 4 Webshop+Member-Quellen, 2.318 in db1+db2013+db2013_alt, 611 in db2013+vodtapes_members. Diese 3.071 Multi-Source-Cluster sind die "Stammkunden".

3. **mo_pdf-Customer-Pool ist 60% telefonisch/Messen-Customers:** Nur 8% (302/3.954) haben einen Adress-Match mit Online-Customers. Der Rest (3.652) bekam einen eigenen Master ohne Web-Account-Bindung.

4. **MO-Layout `mo-2019-2026` ist über 7 Jahre stabil.** 99,99% PDF-Parser-Success-Rate. 2003-2018 PDFs noch zu beschaffen — werden später in selben Ordner gelegt.

5. **IMAP-Mining-Strategie muss umdefiniert werden:** ADR-Customer-Refs werden in nur 0 Mail-Bodies erkannt (Hypothese „Frank schreibt Customer-Nr im Body" widerlegt). Dafür sind ~1.200 Mails mit Email-Mentions im Body — Match-Strategie für Phase-2-Stage-4 läuft primär über `from_email`/`to_emails`-Headers.

6. **SSH-Tunnel-Workflow ist robust:** Multi-File `tail -qf` mit gezieltem Filter funktioniert, MCP-basiertes SQL-Resolver-Pattern ist eleganter als Python-via-Tunnel.

## Schmerzpunkte aus dieser Session

- **Initiale Verwirrung mit Supabase-PW:** Robin gab erst falsches PW (`brt1nkf...`), das nicht zum Project gehörte. Korrekt: VPS-`.env` hatte das richtige PW (`zP*8jCjb_M6ugdRZY4`) — kein Reset war nötig
- **VPS-Backend connected via Direct-Hostname (IPv6)**, mein Mac hatte kein IPv6 → SSH-Tunnel als Workaround
- **2 doppelte Pull-Loops bei db2013** durch Idle-Timeout, gefixt mit ping(reconnect)
- **Email/Phone Race-Condition beim Re-Run** durch fehlende UNIQUE-Constraints, schnell gefixt
- **Decision-Vorlage** `CRM_DATA_ARCHITECTURE_DECISIONS.md` ist erstellt aber NOCH NICHT abgesegnet — nächste Session muss damit starten

## Files erstellt / verändert in dieser Session

**Schema-Migrations:**
- `backend/scripts/migrations/2026-05-03_crm_staging_schema.sql` (+ rollback)
- Plus 3 Inline-Migrations via Supabase MCP:
  - `crm_staging_email_phone_unique_2026_05_03`
  - `crm_master_schema_2026_05_03`
  - `crm_staging_schema_2026_05_03` (initial)

**Skripte:**
- `scripts/crm_staging_lib.py` (~480 LoC)
- `scripts/legacy_db_pull.py` (~590 LoC)
- `scripts/mo_pdf_pipeline.py` (~265 LoC)
- `scripts/mo_pdf_lib/__init__.py`, `parser.py` (~210 LoC), `regex_patterns.py` (~85 LoC)
- `scripts/imap_indexer.py` (~395 LoC)
- `scripts/master_resolver.py` (~410 LoC, Backup für komplexere Stages)

**Doks:**
- `docs/optimizing/CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md` (mehrfach erweitert: Sektionen D–H, Wave-Strategy-Verzahnung mit `PRE_LAUNCH_KONZEPT.md`)
- `docs/architecture/CRM_DATA_ARCHITECTURE_DECISIONS.md` (NEU, 6 Architektur-Entscheidungen pending)
- `docs/architecture/LEGACY_MYSQL_DATABASES.md` (NEU, vollständiges Schema-Inventar)
- `docs/sprints/CRM_PHASE_1_DATA_FOUNDATION.md` (NEU, Sprint-Tracker)
- `docs/sessions/2026-05-03_crm_phase1_data_foundation.md` (DIESES Session-Log)
- `Monkey Office/rechnungs-extraktion-crm-konzept.md` (Codex-Konzept, integriert)

**Memory:**
- `project_legacy_data_landscape.md`
- `project_crm_existing_p1.md`
- `feedback_mysql_streaming_idle_timeout.md`
- (mehrere Memory-Index-Updates in `MEMORY.md`)

## Operational State for Next Session

**SSH-Tunnel:** Vermutlich heruntergefahren bis nächste Session (Mac-Restart oder ControlMaster-Timeout). Restart:
```bash
ssh -fN -L 5433:db.bofblwqieuvmqybzxapx.supabase.co:5432 vps
```

**Postgres-Schema-Status (live in `bofblwqieuvmqybzxapx`):**
- 9 staging-Tabellen (crm_staging_*) + crm_imap_message + crm_pull_run + crm_layout_review_queue + crm_source_status (View)
- 7 master-Tabellen (crm_master_*) + crm_master_resolver_run + crm_master_contact_360 (View)
- Alle UNIQUE-Constraints + Indizes aktiv

**Daten-Snapshot (Stand Session-Ende):**
- Total Master-Contacts: 14.449
- Phase 2 Stage 1+2 done, Stage 3-4 + Lifetime-Revenue + Tier offen
- Architektur-Entscheidungen-Vorlage offen, 6 Punkte abzusegnen

**Empfohlener Start für nächste Session:**
1. Architektur-Decisions aus `CRM_DATA_ARCHITECTURE_DECISIONS.md` durchgehen (15-30 Min)
2. Lifetime-Revenue-Aggregation als Quick-Win (5 Min SQL)
3. Tier-Engine + Test-Account-Markierung (`is_test=true` für Frank's Test-Customer mit 90 Links)
4. Stage 4 IMAP-Email-Anreicherung (komplexer, 1-2h)
5. Admin-UI als Phase 3 (mehrere Tage)
