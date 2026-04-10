# Discogs Import Session — 2026-04-10 — Pargmann Collection (5.646 releases)

**Context:** Erster großer Discogs-Import auf Produktion. Pargmann Waschsalon-Berlin Collection Export, 5.653 unique releases. Ergebnis: **5.646 erfolgreich committed** (7 skipped wegen Discogs 404). Run ID: `cbce39b2-...`.

Dieses Dokument ist eine Post-Mortem/Session-Chronologie die zeigt wie wir von "nichts funktioniert" zu "alles committed" gekommen sind. Wertvoll für zukünftige Refactorings und Trouble-shooting.

---

## Ausgangslage (morgens)

- Pargmann CSV war hochgeladen, Fetch lief, aber der Commit schlug reproduzierbar fehl
- Import Service war auf v5.0 (Live Feedback + Resume, rc15)
- In einem früheren Run: Foreign-Key-Error bei `legacy-release-1923` → komplette Transaktion rolled back → **alle 997 existing updates + 803 linked updates verloren**

## Die 6 Probleme die wir heute gefunden + gefixt haben

### Problem 1: All-or-nothing Transaction

**Symptom:** Ein einziger FK-Error in linkable_updates-Phase killt ~1.800 bereits erfolgreiche Operations via Rollback.

**Diagnose:** Commit-Route hatte EINE riesige `pgConnection.transaction()` über alle INSERTs und UPDATEs. Bei jedem Fehler throw + komplett-Rollback.

**Fix (Commit `ebdb98d`, rc16 v5.1):** Per-Batch Transaktionen, `BATCH_SIZE = 500`. Jede Batch in eigener Transaktion. Fehler in Batch → nur dieser Batch rolled back, continue mit nächster Batch. `completed_batches_{phase}` in session tracked.

**Learnings:** Large-batch imports brauchen IMMER partial-commit semantics. All-or-nothing klingt safe aber ist operativ ein Albtraum sobald die Daten auch nur einen kleinen Bug haben.

### Problem 2: Pre-Commit blind

**Symptom:** Crashes beim INSERT mit obskuren Postgres-Fehlern nach bereits geschriebenen Updates.

**Diagnose:** Commit-Route ging direkt in die Transaktion ohne predictive Checks. Jeder Fehler kam erst während der Transaktion raus.

**Fix (Commit `ebdb98d`):** Neue `validating` Phase VOR jeder Transaktion mit 3 Checks:
- V1: Alle new rows haben cached API data
- V2: Keine duplicate slugs im new set
- V3: Keine new Release IDs die schon in DB existieren

Fehler → fail-fast, zero DB writes, klarer Error an den User.

**Learnings:** Fail fast ohne Transaktion zu öffnen ist immer besser als mid-transaction surprise.

### Problem 3: Duplicate slugs (185 Stück)

**Symptom:** Pre-Commit Validation fing 185 duplicate slugs: "Depeche Mode Leave In Silence" hatte 3 Pressings, "Conrad Schnitzler Auf Dem Schwarzen Kanal" hatte 2 Pressings, etc.

**Diagnose:** `slugify(artist + title)` produzierte denselben String für verschiedene Pressings desselben Titels. `Release.slug` hat UNIQUE constraint → INSERT würde crashen.

**Fix (Commit `d7ce924`):** Neuer Helper `buildImportSlug(artist, title, discogs_id)` hängt `-{discogs_id}` an den Slug. Garantiert unique per Definition (discogs_id ist PK bei Discogs). Legacy slugs bleiben unberührt.

**Trade-off:** URL-Hässlichkeit. `depeche-mode-leave-in-silence-27717` statt `depeche-mode-leave-in-silence`. Akzeptabel weil jede Pressung ihre eigene Seite braucht.

**Learnings:** Slugs aus User-Input sind fast nie unique genug. Immer einen eindeutigen Discriminator (PK oder Hash) einbauen.

### Problem 4: `format_group` column does not exist

**Symptom:** Nach 17 Minuten Commit: `INSERT INTO "Release" ... column "format_group" of relation "Release" does not exist`.

**Diagnose:** Schema-Mismatch. Die Release-Tabelle hat eine `format` Spalte (USER-DEFINED enum `ReleaseFormat`, NOT NULL), nicht `format_group`. Der alte Commit-Code hatte diesen Bug seit Monaten, aber er wurde nie getriggert weil vorher immer was anderes gecrasht ist.

**Fix (Commit `7fa8f20`):**
- `format_group` → `format`
- Expliziter Enum-Cast `?::"ReleaseFormat"`
- `legacy_available = false` explizit gesetzt (Default ist `true` was semantisch falsch für Discogs-Imports ist)

**Learnings:** Wenn du eine neue Phase aktivierst die vorher nie getestet wurde, **sanity check alle INSERTs gegen die tatsächliche Schema**. Ich hätte das im Vorfeld durch eine Schema-Query verifizieren sollen statt zu hoffen dass der Legacy-Code korrekt war.

### Problem 5: `Track.createdAt` column does not exist

**Symptom:** Nächster Batch-Crash, wieder Schema-Mismatch, diesmal in der Track-INSERT.

**Diagnose:** Track-Tabelle hat **keine** `createdAt`/`updatedAt` Columns (anders als Release/Artist/Label/Image). Der Track-INSERT im Commit-Code versuchte trotzdem `createdAt` zu setzen.

**Fix (Commit `2df9c3a`):** `createdAt` aus Track INSERT entfernt. Spalten: `(id, releaseId, position, title, duration)`.

**Learnings:** Nach Problem 4 hätte ich proaktiv ALLE INSERTs gegen das tatsächliche Schema validieren sollen — nicht nur Release. Habe ich dann auch getan, aber einen Bug später als nötig.

### Problem 6: Session Status 'done' bei completed_with_errors

**Symptom:** Nach jedem partial-success-Run wurde `status = 'done'` gesetzt → Resume-Banner versteckt → User musste manuelles DB-UPDATE machen um retry zu können.

**Diagnose:** Finaler `updateSession` am Ende des Commit hat `status: "done"` hardcoded, unabhängig vom Error-Count. Plus: `commit_progress = { phase: "done", counters }` hat die `completed_batches_*` Keys überschrieben.

**Fix (Commit `d022ac1`):**
- `finalStatus = errors > 0 ? 'analyzed' : 'done'`
- Vor dem finalen updateSession werden `completed_batches_*` Keys aus dem alten commit_progress gemergt
- `error_message` freundlich formuliert: "Commit completed with N errors. M rows committed successfully. Click 'Approve & Import' again to retry."

**Learnings:** "Partial success" ist ein eigener Zustand der explizit gemodelled werden muss. `done` sollte nur gesetzt werden wenn _wirklich_ alles durch ist.

### Bonus: UX-Bug beim Resume-Banner

**Symptom:** Resume-Banner nur sichtbar wenn localStorage die session_id kannte. Nach `completed_with_errors` wurde localStorage cleared → User sah nichts mehr → musste manuell Browser-Konsole hacken um session ID zu setzen.

**Fix (Commit `974db03`):** Beim Page-Mount wird `/history` gequeried. Wenn `active_sessions` existieren (Status NOT IN `done`, `error`), wird der Banner sofort angezeigt — unabhängig von localStorage. localStorage bleibt als "preferred session" hint.

**Learnings:** State der nur im Browser lebt ist fragil. DB als Single Source of Truth + Frontend fragt ab.

---

## Timeline (chronologisch)

| Zeit | Event |
|---|---|
| 07:17 | Erster Commit-Versuch: `Release_labelId_fkey` bei `legacy-release-1923` → komplett-Rollback. 1.800 operations verloren. |
| 08:00 | v5.1 Plan approved, Implementierung beginnt |
| 09:00 | v5.1 lokal fertig, warten auf Ende des Fetch |
| 11:30 | Pargmann Fetch komplett (5.653/5.653 cached in `discogs_api_cache`). v5.1 deployed (`ebdb98d`) |
| 12:00 | Retry 1: Pre-Commit Validation fängt 185 duplicate slugs → fail-fast. `buildImportSlug` fix deployed (`d7ce924`) |
| 12:06 | Retry 2: existing (997) + linkable (1398) durch, new_inserts crasht mit `format_group`. Batch-Isolation greift: linkable bleibt committed. Format fix deployed (`7fa8f20`) |
| 12:17 | Retry 3: existing/linkable erneut durch (idempotent), new_inserts crasht mit `Track.createdAt`. Track fix deployed (`2df9c3a`) |
| 12:23 | Retry 4: **alles läuft**. Batch 1/7 committed in 65s |
| 12:25 | Batch 2/7 committed (60s) |
| 12:26 | Batch 3/7 committed (56s) |
| 12:26 | Batch 4/7 committed (51s) |
| 12:27 | Batch 5/7 committed (52s) |
| 12:28 | Batch 6/7 committed (46s) |
| 12:29 | **Batch 7/7 committed. Import done.** Run ID `cbce39b2`. inserted=3.251, linked=1.398, updated=997, errors=0 |
| 14:30 | Session Status Fix deployed (`d022ac1`) — für zukünftige partial-success Imports |

---

## Finale Datenbank-Zahlen

| Metric | Count |
|---|---|
| Neue Discogs-Releases | 3.251 |
| Davon mit Cover | 3.190 (98%) |
| Legacy Releases linked (fuzzy matched → discogs_id set) | 1.398 |
| Existing Releases updated (prices/community) | 997 |
| Skipped (Discogs 404) | 7 |
| **Total operations** | **5.653** |
| **Committed** | **5.646** |
| Tracks inserted | 26.464 (~8.1/release) |
| Images inserted | 11.277 (~3.5/release, max 5) |
| Discogs Artists (inkl. credits) | 30.776 |
| Discogs Labels (dedupliziert) | 1.508 |
| import_log entries | 5.646 |

---

## Key Architectural Learnings

### 1. Batch-Transactions sind default-safe für große Imports

All-or-nothing klingt wie "safety first", ist aber operativ katastrophal sobald ein einziger Bad Row drin ist. Per-batch Transactions sind der Default.

### 2. Pre-Commit Validation zahlt sich massiv aus

V2 (duplicate slugs) hat uns ~17 Minuten Commit-Zeit erspart durch fail-fast. V3 (existing Release IDs) ist eine gute Sanity-Check für die Analyze-Phase. V1 (missing cache) fängt corrupted sessions ab.

### 3. Schema-Drift zwischen Code und DB ist unvermeidbar

`format_group` und `Track.createdAt` waren tote Code-Spalten die nie getestet wurden. **Jeder neue INSERT muss gegen die aktuelle Schema via `information_schema.columns` validiert werden** bevor er live geht.

### 4. `status = 'done'` ist ein absoluter Terminal-Zustand

Wenn `done` gesetzt ist, muss wirklich **alles** durch sein. Bei partial success → `analyzed` (resumable). Neue Status wie `done_with_errors` sind möglich aber verkomplizieren die Status-Maschine unnötig.

### 5. Single Source of Truth muss DB sein, nicht localStorage

Alle UI-State-Recovery (Resume-Banner, session restoration) muss aus der DB kommen. localStorage ist ein UX-Hint, kein Zustand.

### 6. Idempotent Updates sind gold für Retry-Flows

Unser existing/linkable UPDATE Queries sind idempotent (mehrfache Ausführung = gleicher End-Zustand). Plus `ON CONFLICT DO NOTHING` auf INSERTs. Das macht jeden Retry sicher.

---

## Was wir NICHT angefasst haben (Follow-ups)

1. **Der FK-Bug bei `legacy-release-1923`** hat sich nicht reproduziert in den späteren Runs — vermutlich transient (ein anderer Process hat in der Zwischenzeit Label-Daten geändert, oder ein Race mit Legacy-Sync). **Follow-up:** Ein Check-Script das broken FKs in der Release-Tabelle findet und reported.

2. **Analysis Tab Virtualization.** Bei 5000+ rows im Frontend-State wird der DOM fett. Haben wir heute nicht geschafft, nicht kritisch.

3. **History Drill-Down mit Resume-Button.** Aktuell muss der User entweder localStorage haben oder /history active_sessions muss was zurückgeben. Follow-up: Button im History Modal "Resume this session".

4. **Recurring FK-Checks als Pre-Import-Validation.** Wir sollten auch V4 validieren: "alle linkable release_ids haben valid labelId FK".

---

## Referenz

- **Service Doc:** `docs/DISCOGS_IMPORT_SERVICE.md` v5.1
- **Live Feedback Plan:** `docs/DISCOGS_IMPORT_LIVE_FEEDBACK_PLAN.md` (rc15, IMPLEMENTIERT)
- **Refactoring Plan:** `docs/DISCOGS_IMPORT_REFACTORING_PLAN.md` (rc14, IMPLEMENTIERT)
- **Architecture Audit:** `docs/DISCOGS_IMPORT_AUDIT.md` (Ursprung der v4/v5 Refactorings)
- **Changelog:** `docs/architecture/CHANGELOG.md` (rc14, rc15, rc16 Einträge)
- **GitHub Release:** https://github.com/rseckler/VOD_Auctions/releases/tag/v1.0.0-rc16
