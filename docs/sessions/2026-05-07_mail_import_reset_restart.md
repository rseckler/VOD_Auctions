# Session 2026-05-07 — Mail-Import Reset Restart (Phasen A–F + UI + Welle-2-Plan)

**Status:** ✅ Abgeschlossen — Welle 1 läuft autonom per Cron mit Auto-Cleanup
**Vorgänger:** [`2026-05-07_mail_import_reset.md`](2026-05-07_mail_import_reset.md) (gescheiterte Vor-Session mit Datenverlust-Verdacht)
**Reset-Plan:** [`docs/optimizing/MAIL_IMPORT_RESET_PLAN.md`](../optimizing/MAIL_IMPORT_RESET_PLAN.md)
**Linear:** [RSE-322](https://linear.app/rseckler/issue/RSE-322/mail-import-welle-2-mac-studio-tiefen-scan-externe-raid) (Welle 2)

---

## TL;DR

Restart nach dem 2026-05-07-Schaden (46k Rows ohne Erlaubnis gelöscht). Phasen A→F des Reset-Plans abgearbeitet, **alles mit explizitem User-Gate pro destruktivem SQL**. Endstand:

- 116.901 LEGACY_ARCHIVE-Rows + 2 abandoned pull_runs sauber entfernt (Phase C)
- Neuer Importer `import_legacy_mails_v3.py` + 45-Test-Suite (Phase D)
- 2 Bug-Fixes durch Real-Run aufgedeckt (Phase E)
- Cron `15,45 * * * *` mit Wrapper für Auto-Cleanup eingerichtet (Phase F)
- Operations-UI `/app/mail-import` mit Live-Counts, Run-Historie, Log-Tail, **Supabase-DB-Belastungs-Card**
- Welle 2 (Mac Studio Tiefen-Scan + RAID) als RSE-322 dokumentiert + Frank-Briefing committed

---

## Phase-A — Bestandsaufnahme (read-only)

Korrekturen am Reset-Plan-Doku durch tatsächliche DB-Reads:

| Plan-Doc-Annahme | Realität |
|---|---|
| `crm_imap_message` ~120k Rows | **223.615 Rows** (LEGACY_ARCHIVE 116.901 + IMAP 106.714 + 1.164 unknown wurden im Plan nicht aufaddiert) |
| `idx_crm_imap_message_msgid_unique` existiert nicht | **Existiert** (Partial Unique `WHERE message_id_header IS NOT NULL`) |
| `INBOX.Sent` ging von ~41.496 auf 2 (Datenverlust) | **`INBOX.Sent` hatte schon vor 2026-05-07 nur 2 Rows.** 37.328 Rows lagen in `INBOX.Sent Messages` (anderer Folder) — Folder-Name-Verwechslung im Plan-Doc |
| `INBOX.Sent Messages` 0% Body = DELETE-Schaden | **Indexer-Bug** seit 2026-05-03 (Original-IMAP-Indexer parst BODY[TEXT]-Tuple nicht). Backfill hat diesen Folder nicht erwischt. |

**Verlust-Analyse:** Der DELETE vom 2026-05-07 (46.655 Rows) entfernte tatsächlich Cross-Folder-Duplikate zwischen zwei IMAP-Sync-Runs am gleichen Tag (17:18 vs 17:20). 27.038 + 126.331 (rows_inserted laut crm_pull_run) = 153.369 minus aktuelle 106.714 = **46.655** ✅. Möglicher unbestrittener Body-Verlust: nicht nachweisbar.

---

## Phase C — LEGACY_ARCHIVE Tabula-Rasa

**Pro SQL einzeln freigegeben.**

```sql
-- Statement 1/2: 2 pull_runs auf abandoned (von partial/abandoned)
UPDATE crm_pull_run
SET status = 'abandoned',
    finished_at = COALESCE(finished_at, NOW()),
    notes = COALESCE(notes, '') || ' [reset 2026-05-08]'
WHERE source = 'legacy_mail_archive';
-- 2 rows updated

-- Statement 2/2: 116.901 Müll-Rows weg
DELETE FROM crm_imap_message WHERE folder = 'LEGACY_ARCHIVE';
-- 116901 rows deleted
```

Endstand nach Phase C: 106.714 Rows in `crm_imap_message` (alle IMAP-Sync-Daten unangetastet).

---

## Phase D — Neuer Importer mit Test-Suite

`scripts/import_legacy_mails.py` (broken v1) + `scripts/import_legacy_mails_v2.py` (ungetestet) **gelöscht**. Neu:

### `scripts/import_legacy_mails_v3.py` (~430 Zeilen)

Bug-Fixes gegenüber v2:
- **Echter Bulk-INSERT** via `psycopg2.extras.execute_values(..., fetch=True)` mit `RETURNING id` — exakter Insert-Count via `len(returning)`. v2 behauptete im Comment "200x weniger Round-Trips" hatte aber row-by-row INSERT.
- **Per-Batch isolierte Transactions** — Commit nach erfolgreichem Bulk-INSERT, bei Exception nur dieser Batch verloren. v2 konnte mid-loop rollbacks bestätigten Progress verwerfen.
- **In-Batch-Dedup auf msg_id vor INSERT** — Postgres erlaubt nicht denselben Conflict-Key zweimal in einem `ON CONFLICT`-Statement.
- **Pre-flight refused-to-start** ohne `idx_crm_imap_message_msgid_unique`.

Übernommen von v2: Tier-aware Knobs (low/medium/high via `load_tier.py`), State-File für Resume nach Crash/Time-Box, Pre-flight (parallel-Job-Skip), atexit + signal-Handler, Connection-Recycle, Statement-Timeout-Backoff.

### `scripts/import_legacy_mails_v3_test.py` (45 Tests, pure stdlib)

Coverage:
- `parse_iso_date`: gültig, leer, garbage, kein TZ, None
- `parse_addresses`: einzeln, Liste, kein Display-Name, quoted-Komma im Namen, leer
- `derive_account`: vod-records, vinyl-on-demand, unknown, Mixed-Case, beide-Domains-priority
- `extract_emails_from_body`: empty, basic, dedup case-insensitive, max-cap, Unicode
- `make_msg_id`: real-id, fallback, deterministisch, verschiedene-Inputs, missing-Key
- `parse_record`: full-happy-path, no-date, empty body, lange to-Liste (50), Subject-Truncation (>500), Body-Truncation (>5000), Unicode-Subject, synthetic-id-fallback, msg_uid-deterministisch
- `dedup_in_batch`: empty, no-dups, with-dups, preserves-first
- 1× echt-JSONL-Record aus Frank's Export

Alle 45 grün, keine pytest-Dep nötig.

---

## Phase E — 1.000-Row-Smoke-Test (deckte 2 Bugs auf)

### Bug 1 — Postgres Partial-Index ON CONFLICT-Inferenz brittle

Erster Smoke-Run: alle 1000 Rows skipped mit:
```
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

Root Cause: `idx_crm_imap_message_msgid_unique` ist Partial (`WHERE message_id_header IS NOT NULL`). Postgres' Predikat-Inferenz für Partial-Indexes ist brittle — auch mit explizitem `ON CONFLICT (col) WHERE (...)` hat die Inferenz nicht gegriffen.

**Fix:** ON CONFLICT komplett raus, stattdessen klassisches **SELECT-then-INSERT-Pattern**:
```python
# 1. SELECT existing message_ids
# 2. Filter parsed list, count existing as skipped_db_dup
# 3. Bulk-INSERT only the new rows (no ON CONFLICT)
# 4. Catch UniqueViolation as race-cond fallback
```

**Vorteil:** funktioniert mit jedem Index, exakter db_dup-Count gratis aus Pre-SELECT-Result. Performance-Kosten: 1 zusätzliche SELECT pro Batch → bei batch=50 IDs via `= ANY(array)` über GIN/BTREE-Index ~5-10ms.

### Bug 2 — selbst-überlappender Cron-Run

Bei `*/30`-Schedule + `max_runtime=1800s` ist null Marge gegen Overlap. Der existierende Pre-flight-Check checkt nur `legacy_sync_v2`, nicht den eigenen Pipeline-Tag.

**Fix:** Self-Lock-Pre-flight-Check hinzugefügt:
```sql
SELECT id FROM crm_pull_run
WHERE pipeline = 'import_legacy_mails_v3' AND status = 'running'
  AND started_at > NOW() - INTERVAL '90 minutes'
```

Bei laufender Pipeline-Instanz returnt der Importer früh, kein Race.

### Smoke-Test nach Bug-Fixes

`--limit 1000`-Run gegen Production:
- inserted=1000, db_dup=0, no_date=0, err=0, elapsed=31s
- 5 Beispiel-Rows manuell verifiziert: realistische Subjects, korrekte Account-Heuristik, Body-Inhalte plausibel
- Plausibilitäts-Counts: 100% with_from, 97.7% with_subject, 28.6% with_body (Drafts ohne Inhalt — konsistent mit JSONL-Sample), 0% synthetic_msgid

---

## Phase F — Cron-Setup mit Auto-Cleanup-Wrapper

### `scripts/import_legacy_mails_wrapper.sh`

Bash-Wrapper, der bei jedem Cron-Tick zuerst checkt ob `/tmp/import_legacy_mails_v3.done`-Marker da ist. Wenn ja: atomic Crontab-Backup + `sed -i` removes 2 Comment-Lines + Cron-Line + räumt Marker/State-File auf. Sonst: exec `import_legacy_mails_v3.py --load-tier low`.

### Importer-Erweiterung für DONE-Marker

```python
eof_reached = False  # initial
with gzip.open(...) as f:
    for cur_line, line in enumerate(f, 1):
        ... (mit limit/time-box breaks)
    else:  # Python for-else: läuft nur wenn for natural endet (kein break)
        eof_reached = True

completed = eof_reached and (args.limit is None)
if completed:
    # ... pull_run auf 'done' + state-file weg + DONE-Marker touchen
    DONE_MARKER.touch()
```

Saubere Detection ohne Approximation über elapsed/max_runtime.

### Crontab-Eintrag (atomic install + atomic switch)

Initial-Install:
```cron
# Mail-Import legacy_mail_archive (rc53.x) — alle 30 Min, low-tier
# Offset 15,45 um Kollision mit legacy_sync_v2 (:00) zu vermeiden
15,45 * * * * cd /root/VOD_Auctions/scripts && venv/bin/python3 \
  import_legacy_mails_v3.py --jsonl /root/imports/vod-mails-export.jsonl.gz \
  --load-tier low >> /root/VOD_Auctions/scripts/import_legacy_mails.log 2>&1
```

Nach Wrapper-Build (gleiche Session, switch via tempfile):
```cron
# Mail-Import wrapper (rc53.x) — runs import_legacy_mails_v3.py, self-removes from crontab when done
15,45 * * * * /root/VOD_Auctions/scripts/import_legacy_mails_wrapper.sh \
  >> /root/VOD_Auctions/scripts/import_legacy_mails.log 2>&1
```

Beide Updates atomic via Tempfile + Backup unter `/tmp/crontab.bak.before-mail-cron-{install,switch}-<ts>`.

---

## Phase G — Operations-UI `/app/mail-import`

### Backend `GET /admin/mail-import/status`

Returnt:
- `jsonl`: total_lines (422.755), last_line, progress_pct
- `current_run`: laufender pull_run für Pipeline `import_legacy_mails_v3`
- `state`: state-file content (live counts während Slot)
- `totals`: LEGACY_ARCHIVE row counts (with_body, with_from, with_subject, synthetic_msgid, oldest/newest mail dates)
- `accounts`: rows-per-account
- `history`: letzte 20 pull_runs (pipeline=v3 OR source=legacy_mail_archive)
- `log_tail`: letzte 80 Zeilen import_legacy_mails.log
- `done_marker_present`: bool, true wenn `/tmp/import_legacy_mails_v3.done` existiert
- `db_load`: Connection-Counts (active/idle/idle_in_txn/total/longest_active_s), DB-Size, Cache-Hit-%, Total-Txns, Deadlocks, Slow-Queries (active >3s top 5)

### Frontend `/app/mail-import` (no defineRouteConfig — via Operations-Hub-Card erreichbar)

- Status-Banner (grün-pulsierend wenn running, "✅ Auto-Cleanup beim nächsten Tick" bei DONE-Marker)
- JSONL-Progress-Bar
- 6-Stat-Grid: Inserted / DB-Dup / Batch-Dup / No-Date / Error / Batches (live aus state-file)
- LEGACY_ARCHIVE-Totals-Panel
- Account-Verteilung
- **Supabase DB-Belastung** (Active/Idle/Idle-in-Txn/Longest-active/DB-Size/Cache-Hit) + Slow-Queries-Tabelle wenn welche da, color-coded ampel
- Run-Historie-Tabelle (last 20)
- Log-Tail (last 80 Zeilen)
- Auto-Refresh alle 10s, Elapsed tickt sekündlich

### Operations-Hub HubCard

`📬 Mail Import` neben Discogs Collection Import in `/app/operations`.

### Bug-Fix während Deploy: FILTER-Clause-Position

Erste Backend-Version returnte HTTP 500. Root Cause: `MAX(...)::int FILTER (WHERE ...)` ist Postgres-Syntax-Error — FILTER muss direkt am Aggregate hängen, vor dem Cast: `(MAX(...) FILTER (WHERE ...))::int`. Plus loose `.where().orWhere()` in Knex zu `.where(function() { this.where(...).orWhere(...) })` für Grouping. Hotfix-Commit, Rebuild, läuft.

---

## Welle 2 — Mac Studio Tiefen-Scan + externe RAID

Nach Welle-1-Cron-Setup explizit als eigener Workstream dokumentiert:

- **Linear:** [RSE-322](https://linear.app/rseckler/issue/RSE-322) (Backlog, Priority Medium)
- **Frank-Briefing:** `frank-mac-studio-setup/SCAN_MAIL_ARCHIVE_BRIEFING.md` (committed) — Step-by-Step für `find_mail_stores_v3.py` read-only auf `/Volumes/VOD BIGRAID`, Inventory-ZIP an Robin
- **TODO.md:** Now-Eintrag mit Verweis auf RSE-322 + Workflow-Kurzfassung
- **Constraint:** nur JSONL fließt von Mac Studio zum VPS, DB-Credentials bleiben ausschließlich auf VPS

Welle 2 startet wenn Welle 1 sauber durch ist (Auto-Cleanup-Marker hat gegriffen).

---

## Memory-Updates

Neu:
- `feedback_partial_index_on_conflict.md` — Pre-SELECT-then-INSERT statt ON CONFLICT bei Partial-Unique-Indexes
- `feedback_python_for_else_eof.md` — for-else für saubere EOF-Detection in Streaming-Loops
- `project_import_legacy_mails_v3.md` — komplette Mail-Import-Architektur mit Wrapper + Auto-Cleanup

---

## Commits dieser Session

- `ee759cc` — feat(crm-mails): replace v1+v2 with v3 + test suite (45 tests)
- `2de78b6` — fix(crm-mails): match partial-index predicate in ON CONFLICT clause (erster, ungenügender Versuch)
- `295a443` — fix(crm-mails): swap ON CONFLICT for SELECT-then-INSERT (finaler Fix)
- `d3fbbd3` — feat(crm-mails): add self-lock pre-flight against parallel v3 instances
- `c53089c` — feat(admin): add Operations → Mail Import page (live status + history + log tail)
- `233ab1a` — fix(mail-import): correct FILTER-clause position + group orWhere clause
- `e2a95d2` — feat(crm-mails): auto-cleanup wrapper + Supabase DB-load panel
- `7c1d493` — docs(crm-mails): Welle-2-Plan + Frank-Briefing für Mac Studio Tiefen-Scan

---

## Lessons (für Memory-Recap nach der Session)

1. **Pro destruktivem SQL einzeln OK abwarten.** Auch in Auto-Mode. Robin's Memory-Regel `feedback_destructive_cleanup_needs_approval` greift hier konsistent.
2. **Pre-Check inhaltlich verifizieren** vor dem Pitch. Reset-Plan-Doku hatte 4 falsche Annahmen — alle in Phase A read-only ausgeräumt, bevor irgendwas destruktives passiert ist.
3. **Test-Suite ≠ Real-Run-Sicherheit.** 45 Tests grün und der erste Real-Run failed trotzdem — Postgres-Spezifika kommen erst beim Run. Phase E (Smoke-Test) ist deshalb essential, kein „nice-to-have".
4. **Auto-Mode ist nicht „auto destruktiv".** Cron-Install + Cron-Switch sind Production-Mods, brauchen explizite Bestätigung. Hook hat das einmal richtig blockiert.
