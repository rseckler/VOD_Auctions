# Session-Log 2026-05-04 — MO-PDF AI-Cleanup-Pipeline + Mail-Archive-Scanner

**Tag:** 2026-05-04 (Sonntag)
**Sessions an einem Tag:** 4 (rc53.1 + rc53.2 morgens, rc53.3+5 mittags via parallel session, rc53.7+8 nachmittags-abends)
**Diese Session:** rc53.7 + rc53.8 (mo_pdf cleanup + AI pipeline + mail archive scanner)
**Robin gegenüber:** "alles sauber dokumentieren und session sauber abschliesen"

## Kontext

Diese Session begann nachmittags, parallel zu rc53.6 (Inventory-Hub instant + MO-PDF-Parser-v-1, andere Session). Zuvor gab es heute morgen rc53.1 (Email Review Tab) und rc53.2 (Drawer Overview-first). Der MO-PDF-Backfill (Layout v-1 für 2007-2010, v0 für 2010-2018) wurde in der parallelen Session begonnen aber nicht zu Ende verarbeitet — diese Session schloss das ab und stieß dann auf Daten-Qualitäts-Probleme die einen AI-Cleanup-Sprint nach sich zogen.

## Workstreams + Outcome

### 1. rc53.7 — MO-PDF Backfill 2004-2021 vollständig (rc53.7-Tag in CHANGELOG)

**Input:** Externe HDD `Monkey Office/Rechnungen_ExternHDD/` mit 10.027 PDFs (2000-2021)
**Pipeline:** rsync nach VPS-tmp, dann `mo_pdf_pipeline.py --full`
**Coverage:** 88.6% via 3 Layouts (mo-2019-2026 / mo-2010-2018 / mo-2007-2010)

**Resultat:** 6.910 distinct Tx in `crm_staging_transaction`, 1.102 Layout-Reviews (Eingangsrechnungen Cartus/DHL/Telefonica + Edge-Cases)

**Address-Hash-Doppel-Bug entdeckt:** Master-Resolver Stage 2 fand 0 matches → 6.012 Doppel-Master angelegt. Root-Cause: zwei Bugs zusammen
- App-side `_addr_hash` nutzte SPACE-join, DB-Generated-Column nutzte `|`-Trenner
- Country inkonsistent normalisiert (NULL vs "Finnland" vs "FI")

**Fix:**
- DB-Migration `2026_05_04_address_hash_no_country` (Generation-Expression neu, ohne country)
- App-Code `_addr_hash` exakt an DB-Formula angeglichen (`|`-Trenner)
- 2.534 Doppel-Master via FK-Cascade DELETE
- Re-Run Stage 2: 5.127 matched, 885 echt neu, **0 Doppel**

**Daten-Snapshot:** 20.767 master_contacts (+885), 16.593 mo_pdf-Tx, **€6.02M MO-PDF Lifetime-Revenue total** (3.07M existing + 2.95M heute)

### 2. rc53.8 — AI-Daten-Cleanup-Pipeline (im Tag-Endstadium, läuft Background)

**Robin's Klage:** viele Master haben falsche/fehlende Daten (Last_name="Deutschland", first/last für Firmen, 40+ Doppel-Master für gleiche Firma, etc.). Quick-Fix-SQL hat einige offensichtliche Cases gefangen (Country-words, simple-2-token-names, biz-words für Firmen). Aber tiefere Cleanup nur via AI möglich.

**Anthropic Haiku 4.5 als LLM** (DSGVO-konform für Customer-PII via AVV; MiniMax explizit ausgeschlossen).

**4-Stage-Pipeline:**

1. **1st AI-Pass** `mo_pdf_ai_extract.py`: 2.500 problematische staging_contacts via 5 Filter (company-suffix-bug, country-in-street, anrede-only, empty-street, Lieferanschrift-Overlap). **Resultat:** 2.444 improved (97.8%), 53 no-change, 3 errors. Cost ~$3.25.

2. **Stage-2 empty-hash-guard fix:** 3 cross-contaminierte Master (Margareta Diedrich mit 12+ unrelated, Graham Cumming, Jeroen Lauwers) wurden gefunden — empty-hash `"||"` matched alle Master mit empty address_hash. Code-Fix: ≥2 non-empty parts + ≥8 chars guard. Cleanup + Re-Run Stage 2: 95 matched, 59 echt neu.

3. **Smart Master-Profile-Backfill:** display_name-aware DISTINCT ON statt random pick. **5.996 von 6.014 mo_pdf-Master haben jetzt Profile-Daten (99.7%)**.

4. **2nd AI-Pass** `mo_pdf_ai_consolidate_master.py` (Master-Level Address-Consolidation): Pro Master mit ≥2 master_addresses sammelt 2-6 partial inputs (existing master_addresses + raw_customer_blocks aus staging), Haiku merged zu 1 canonical. DELETE alte addresses + INSERT 1 mit source_list=`['ai_consolidated']`. **Status: läuft Background auf VPS, 4.775 eligible, ~$7 cost, ETA 5-6h**. Bei Session-Ende: 300/4.775 processed, 276 consolidated, 24 LLM-Errors (8%).

**Sample-Beispiele:**
- "Stefan Knappe (Drone Rec.)" mit 75 Addresses → 1 canonical, company="Drone Rec." extrahiert ✅
- "Jörg Steinmeyer c/o Kenkrach Schallplatten" → company="Kenkrach Schallplatten" (c/o erkannt) ✅
- "Esplendor Music SL" Anrede-vor-Name korrigiert ✅
- "Bleep Ltd Spectrum House" Multi-Address mit "Deutschland\nBleep Ltd..." → canonical street ✅

### 3. Mail-Archive-Scanner (separater Workstream, läuft auf Frank's Mac Studio)

**Hintergrund:** Robin entdeckte dass 78% der mo_pdf-Master kein primary_email haben. IMAP-Index 2010-2018 fast leer (372 Mails total für 6.564 PDF-Tx) — alte Mail-Setup-Lücke. Mac Studio + externe VOD BIGRAID haben aber lokale Mail-Backups.

**2-Stage-Architektur:**
- **Frank-Side:** `frank-mac-studio-setup/scan-old-emails.sh` (curl|bash One-Liner) + `find_old_emails.py` (pure stdlib)
  - Scant ~/Library/Mail + Container + iCloud + ausgewähltes Volume
  - Output 1: `_scan-results.tsv` (Catalog)
  - Output 2: `vod-mails-export.jsonl.gz` (VOD-relevante Mails mit Body, gzipped)
- **VPS-Side:** `scripts/import_legacy_mails.py` — liest JSONL.gz, INSERT in `crm_imap_message` mit folder='LEGACY_ARCHIVE', dedup via message_id_header, fake-UID `legacy:<hash>`

**Frank's erster Test:** 20.000 Mails durchgegangen, **19.412 VOD-relevant** (sehr hoher Anteil!). Crash bei Mail #~20000 wegen `'Header' object has no attribute 'strip'` (RFC2047-encoded subjects).

**Fix `ceb1aa0`:** `_h()`-helper mit `decode_header + make_header` + try/except wrap um `extract_full_message` damit ein einzelner bad-mail-Header nicht den ganzen Run killt. Frank läuft erneut.

**Erwartete Email-Coverage nach Import:** 22% → 80-90%.

## Bugs unterwegs gefixt (alle in Memory dokumentiert)

| Bug | File | Memory-Eintrag |
|---|---|---|
| App-side hash != DB-Generated-Column-formula → 0 matches | master_resolver.py | feedback_app_db_hash_formula_must_match.md |
| macOS Sequoia App-Sandbox auch mit FDA gesperrt | scan-old-emails.sh | feedback_macos_sequoia_app_sandbox.md |
| curl\|bash + read schluckt Skript-Source statt User-Input | scan-old-emails.sh | feedback_curl_bash_read_dev_tty.md |
| GitHub raw cached main-branch ~5min | (Workflow-Memory) | feedback_github_raw_cdn_cache.md |
| `'Header' object has no attribute strip` bei non-ASCII | find_old_emails.py | (im Code-Comment dokumentiert) |
| pipefail kill durch find\|head SIGPIPE | scan-old-emails.sh | (im Code-Comment dokumentiert) |
| Stage-2 empty-hash matcht alle Master mit empty address | master_resolver.py | (im CHANGELOG rc53.7) |

## Background-Tasks bei Session-Ende

**1. 2nd-AI-Pass auf VPS:**
- PID 59506 (`python3 mo_pdf_ai_consolidate_master.py --sample 5000 --commit`)
- Output-File: `/private/tmp/claude-501/-Users-robin-Documents-Claude-Work-PROJECTS-VOD-Auctions/95317d9e-7015-49ca-9d5b-5f1b40df1ef5/tasks/boogrsjxt.output` (Mac local cache)
- Check-Command: `ssh vps 'pgrep -af mo_pdf_ai_consolidate'`
- Bei completion: `ssh vps 'tail -20 /tmp/...'` ODER background-task notification
- ETA: ~5-6h ab Session-Ende
- Cost-Forecast: ~$7 ($0.0015 × 4.775 calls)

**2. Frank's Mail-Scanner auf Mac Studio:**
- Läuft mit aktualisiertem Skript (commit `ceb1aa0`)
- Output landet in `/Users/frank/Documents/VOD Mails Suche/vod-mails-export.jsonl.gz`
- Frank schickt dann das File per WeTransfer / iCloud Drive / Dropbox an Robin
- Robin lädt runter + scp nach VPS:/tmp/
- VPS-side Import via `scripts/import_legacy_mails.py /tmp/vod-mails-export.jsonl.gz --commit`

## Pickup-Pfad für nächste Session

1. **2nd-AI-Pass Done-Verify** (~5-6h nach session-end):
   - Counts checken: consolidated/errors/applied
   - DB-Verify: `SELECT COUNT(*) FROM crm_master_address WHERE source_list @> ARRAY['ai_consolidated']`
   - 8% LLM-Errors als 2nd-Run retry mit corrected prompt
   - Robin-UI-Smoke: HHV Handels GmbH sollte 1 Adresse haben statt 6, Bleep Ltd Spectrum House analog
2. **Mail-Archive-Import** (sobald Frank's JSONL.gz da):
   - scp + import_legacy_mails.py
   - Stage-4-Body-Match Re-Run für Email-Candidates
   - Erwartung: 3-4k neue email_candidates für mo_pdf-Master
3. **Master-Merge-UI** (separater Sprint rc54.x):
   - Eric Lanzillotta 4× / Second Layer 17× / HHV 6× — gleicher Customer pro display_name
   - Frank-side UI für Master-Konsolidierung: select 2+ master, merge into one
   - alle source_links/transactions/etc auf primary umhängen, others soft-delete
4. **rc53.8 GitHub Release** erstellen sobald 2nd-AI-Pass durch ist (CHANGELOG-Entry steht bereits)

## Code-Commits in dieser Session-Range (chronologisch)

```
623fc97  feat(crm-mo): Multi-layout parser — mo-2010-2018 (Vinyl-on-Demand era)
99c7785  fix(crm-mo): v-1 header pattern bidirektional
acf0bea  fix(crm-mo): v-1 patterns für 2004-2006 sub-vintage
144fd69  feat(crm-mo): Layout v-1 (mo-2007-2010, vinyl-on-demand era)
877f3cc  fix(crm-resolver): address_hash ohne country
17ae093  fix(crm-resolver): App-_addr_hash an DB-Generation-Expression angleichen
fc0c15b  fix(crm-resolver): Stage 2 schreibt first_name/last_name/company beim CREATE
cdd54b6  docs(crm): rc53.7 CHANGELOG entry für MO-PDF Backfill 2004-2021
5b06452  fix(crm-resolver): Stage-2 empty-hash-guard korrigieren
223d8a4  feat(crm-mo): AI-Fuzzy-Extract Script für problematische staging_contacts
e8850ff  feat(crm-mo-ai): Filter 5 für Lieferanschrift-Overlap-Bug (~1850 cases)
e4bb414  feat(crm-mo-ai): 2nd-Pass — Master-Level Address-Consolidation
35dea01  feat(crm-mo): Mail-Archiv-Scanner für Mac Studio + Volumes
4d461ed  feat(crm-mo): Mail-Archiv 2-Stage Architektur — Frank scannt, VPS importiert
9b42016  fix(mail-scanner): read from /dev/tty + macOS FDA detection
70fe377  fix(mail-scanner): pipefail kill durch find|head
d1c8be6  fix(mail-scanner): macOS Sequoia container-sandbox als skip statt blocker
ceb1aa0  fix(mail-scanner): Header-object .strip()-crash bei non-ASCII
```

Plus die heute morgen Commits (rc53.1+rc53.2): `a0e56b7`, `8bbcef5`, `d9666be`.

## Sync-State bei Session-Ende

| | |
|---|---|
| Mac HEAD | `ceb1aa0` |
| GitHub HEAD | `ceb1aa0` |
| VPS HEAD | `ceb1aa0` |
| 2nd-AI-Pass Status | running PID 59506 |
| Frank's Mail-Scan Status | running auf Mac Studio (nach Bug-Fix) |
| Production-/health | OK |
