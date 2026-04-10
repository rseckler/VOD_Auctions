# Discogs Collection Import Service

**Version:** 5.1.1
**Datum:** 2026-04-10
**Status:** Live — Vollständige Live-Transparenz + Commit-Hardening (Batching, Validation, Partial-Success Resume)
**Post-Import Fixes:** Next.js images whitelist (`**.discogs.com`), Catalog Category Filter (`format_id IS NULL` OR-Clause), Price Rounding (whole_euros_only)

## Zweck

Genereller, wiederverwendbarer Importer für Discogs Collection/Inventory Exports. Wird genutzt wenn VOD Sammlungen aufkauft — Verkäufer liefern ihren Discogs-Export (CSV oder Excel), der Service parsed die Datei, zieht Detaildaten von der Discogs API, gleicht gegen die bestehende Supabase-DB ab und importiert mit vollständigem Tracking.

**Der gesamte Workflow läuft über die Admin UI** — kein Terminal/SSH nötig. Jeder Schritt hat Live-Progress, Cancel/Pause-Buttons und überlebt Server-Restarts.

## Komponenten

### API Routes (Backend)

| Route | Typ | Zweck |
|-------|-----|-------|
| `POST /admin/discogs-import/upload` | JSON + SSE (via Accept header) | CSV/XLSX parsen, Session anlegen, Cache-Status prüfen |
| `POST /admin/discogs-import/fetch` | SSE | Discogs API fetch mit Heartbeat, Rate-Limit, Cancel/Pause |
| `POST /admin/discogs-import/analyze` | SSE | 4-Phasen Matching (exact → cache → fuzzy batches → aggregate) |
| `POST /admin/discogs-import/commit` | SSE | 3-Phasen transaktionaler Import (existing → linkable → new) |
| `GET /admin/discogs-import/history` | JSON | Run-Übersicht + aktive Sessions + Drill-Down per `?run_id=` |
| `GET /admin/discogs-import/session/:id/status` | JSON | Session-State + letzte 100 Events (für Resume + Polling) |
| `POST /admin/discogs-import/session/:id/cancel` | JSON | Setzt `cancel_requested`, laufende Ops brechen kontrolliert ab (Rollback bei Commit) |
| `POST /admin/discogs-import/session/:id/pause` | JSON | Setzt `pause_requested`, laufende Ops warten auf Resume |
| `POST /admin/discogs-import/session/:id/resume` | JSON | Löscht `pause_requested` |

### Shared Libraries

| Datei | Zweck |
|-------|-------|
| `backend/src/lib/discogs-import.ts` | `SSEStream`-Klasse, session helpers (`getSession`, `updateSession`), `expandRow`/`compactRow`, `isCancelRequested`, `awaitPauseClearOrCancel`, `pushLastError`, `clearControlFlags` |
| `backend/src/admin/components/discogs-import.tsx` | `useSSEPostReader` hook, `useSessionPolling` hook, `ImportPhaseStepper`, `ImportPhaseProgressBar`, `ImportLiveLog`, `SessionResumeBanner`, localStorage helpers |

### Admin UI

`/app/discogs-import` — 3 Tabs:
1. **Upload** — Dropzone + Step-2 Fetch Panel + Analyze Integration
2. **Analysis** — Match Review + Import Settings + Live Progress
3. **History** — Run-Tabelle mit Drill-Down-Modal (Event-Timeline)

Oben im Workflow: **Phase-Stepper** mit visuellen States (pending / active / completed / error) über Upload → Fetch → Analyze → Review → Import.

Unter laufenden Operationen: **Live-Log-Panel** mit den letzten ~200 Events, Auto-Scroll, Filter (all/progress/errors).

Bei aktiven Operationen: **Cancel** (führt zu sauberem Rollback bei Commit) / **Pause** / **Resume** Buttons.

## Unterstützte Export-Formate

### CSV (Discogs Collection Export)
```
Catalog#,Artist,Title,Label,Format,Rating,Released,release_id,CollectionFolder,Date Added
TAP 1,The Distributors,T.V. Me / Wireless,? Records ?,7",,1979,955745,Uncategorized,2009-12-13 23:51:52
```
**Quelle:** Discogs → Collection → Export → CSV

### CSV (Discogs Inventory Export)
```
listing_id,artist,title,label,catno,format,release_id,status,price,media_condition,sleeve_condition,...
```
**Quelle:** Discogs → Seller Dashboard → Inventory → Export

### Excel (Custom Export, kein Header)
```
| Artist | Title | CatalogNumber | Label | Format | Condition(2-5) | Year | DiscogsID |
```
**Quelle:** Manuell aus Discogs-Daten erstellt

## Workflow (End-to-End in Admin UI)

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN UI WORKFLOW                         │
│                                                             │
│  1. UPLOAD         CSV/XLSX → Parse (SSE) → import_session  │
│     └─ Events: parse_start → parse_progress (jede 1000      │
│         rows) → dedup → cache_check → session_saved → done  │
│     └─ Zeigt: Row Count, Format, Already Cached, To Fetch   │
│                                                             │
│  2. FETCH          Discogs API → discogs_api_cache (DB)     │
│     └─ SSE mit Heartbeat alle 5s                            │
│     └─ Events: start → plan → progress (pro Release) →      │
│         rate_limited (optional) → error_detail (optional) → │
│         done / cancelled                                    │
│     └─ Rate Limit: 40 req/min                               │
│     └─ Crash-resilient: Session + Cache in DB, Resume OK    │
│                                                             │
│  3. ANALYZE        Live-DB-Query (pg_trgm fuzzy matching)   │
│     └─ SSE mit Heartbeat                                    │
│     └─ 4 Phasen:                                            │
│        phase:exact_match  → eine SELECT-Query               │
│        phase:cache_load   → API-Cache aus DB laden          │
│        phase:fuzzy_match  → Batches à 500 Rows, pro Batch   │
│                              ein LATERAL-Query mit % GIN    │
│                              Index-Lookup                   │
│        phase:aggregating  → Ergebnis-Verteilung             │
│     └─ Cancel/Pause zwischen Batches möglich                │
│                                                             │
│  4. REVIEW         Admin prüft, Checkboxen, Settings        │
│     └─ Condition, Inventory, Price Markup                   │
│     └─ Match-Confidence Badges: grün ≥80%, gelb 60-79%,     │
│         rot <60% (pg_trgm similarity score)                 │
│     └─ Detail-Preview pro Release                           │
│                                                             │
│  5. IMPORT         Per-Batch Transaktionen (v5.1)           │
│     └─ SSE mit Heartbeat                                    │
│     └─ 5 Phasen:                                            │
│        phase:preparing         → Row-Partitionierung        │
│        phase:validating        → Pre-Commit Checks (V1-V3)  │
│        phase:existing_updates  → Batches à 500, jede eigene │
│                                  Transaktion                │
│        phase:linkable_updates  → dito                       │
│        phase:new_inserts       → Batches INSERT Release +   │
│                                  Tracks + Credits + Images  │
│     └─ Bad Batch → Rollback + continue (max 500 verlust)    │
│     └─ completed_batches_{phase} tracked für resume         │
│     └─ Partial success → status='analyzed', resume möglich  │
│                                                             │
│  6. HISTORY        Run-Übersicht mit Drill-Down Modal       │
│     └─ Tabelle mit Counters (Inserted/Linked/Updated)       │
│     └─ Click → Modal mit Event-Timeline (letzte ≤1000 evts) │
└─────────────────────────────────────────────────────────────┘
```

## Architektur-Prinzipien

### 1. Single Source of Truth: Datenbank

Alle relevanten Zustände sind in PostgreSQL persistent:
- **Sessions** → `import_session` (keine In-Memory-Map, überlebt Deploy)
- **API-Cache** → `discogs_api_cache` (30d TTL, Errors 7d)
- **Events** → `import_event` (für Live-Log, Resume, Drill-Down)
- **Run-Log** → `import_log` (pro importierter Release ein Eintrag)

### 2. SSE mit Heartbeat, nicht lange Timeouts

```
Browser ←── SSE Stream ──→ Medusa
           data: heartbeat (alle 5s)
           data: { type: "progress", ... }
           ...
```

**Grundsatz:** Timeouts sind keine Job-Dauer-Begrenzung. Sie sind Idle-Detection.
- nginx `proxy_read_timeout` bleibt beim Default (300s)
- Backend `SSEStream.startHeartbeat(5000)` sendet alle 5s ein `: heartbeat` Kommentar
- → Verbindung ist nie idle → 4h-Fetches funktionieren ohne Timeout-Hacks
- Einzige per-op Timeouts: `AbortSignal.timeout(30000)` pro Discogs-API-Call (Safety-Net gegen hängende externe Calls)

### 3. Resume-fähig durch Session-Persistenz

- Frontend speichert `session_id` + collection name in `localStorage` nach Upload
- Beim Page-Load: `GET /admin/discogs-import/session/:id/status` → zeigt Resume-Banner wenn Session nicht in `done` oder `error`
- Click auf "Resume" → lädt Session + letzte 200 Events aus `import_event` → aktiviert Polling-Fallback (alle 2s) bis Job terminal wird

### 4. Cancel/Pause via DB-Flags

```
Client  → POST .../session/:id/cancel  → UPDATE import_session SET cancel_requested=true
Running SSE loop  → isCancelRequested() poll  → throw "__CANCEL__"
                 → Commit transaction rollback  → DB unverändert
                 → SSE emit "rollback" event    → UI zeigt Error + Rollback-Reason
```

Ähnlich für Pause: setzt `pause_requested=true`, running loop pollt via `awaitPauseClearOrCancel()` und wartet bis Resume oder Cancel.

### 5. Commit Hardening v5.1: Per-Batch Transaktionen

**Problem (bis v5.0):** Eine riesige Transaktion für alle INSERTs. Ein Fehler bei Release #4.999 wirft alle 4.998 vorherigen weg.

**Lösung:** `BATCH_SIZE = 500` Rows, jede Batch in eigener `pgConnection.transaction()`. Bei Batch-Fehler: rollback + `continue` mit nächster Batch.

**Progress-Tracking:** `commit_progress.completed_batches_{phase}: number[]` speichert welche Batch-Indices erfolgreich committed sind. Bei Resume werden diese skipped.

**Trade-off:** Verliert "alles-oder-nichts" Semantik. Partial state möglich wenn ein Batch failt. Dafür:
- Max 500 rows Verlust statt aller 5000 bei einem bad row
- Resume nach Crash fängt genau bei dem nicht-committed Batch an
- Transparenz via `commit_progress.completed_batches_*` zeigt exakt was schon drin ist

**Pre-Commit Validation Pass** (vor erster Transaktion):
- **V1:** Alle `new` rows haben cached API data (sonst kann der Full-Insert nicht gebaut werden)
- **V2:** Keine duplicate slugs im new set (verhindert `Release_slug_key` unique violation)
- **V3:** Keine Release IDs die schon in DB existieren (heißt analyze hat misklassifiziert)

Fehler → `validation_failed` Event, Session zurück auf `analyzed`, **keine DB-Änderungen**.

**Slug-Generator mit discogs_id suffix:**
```typescript
buildImportSlug(artist, title, discogs_id) → "{artist}-{title}-{discogs_id}"
```
Garantiert unique per Definition (discogs_id ist PK). Lässt legacy slugs unberührt — nur neue Imports bekommen suffix.

**Settings Persistence:** Erster `updateSession` im Commit schreibt `import_settings = { media_condition, sleeve_condition, inventory, price_markup, selected_discogs_ids }`. Bei Resume auf Status `importing` werden diese Settings automatisch in den React-State restored — User muss nicht re-selecting.

**Terminal State Logic:**
- `errors === 0` → status `done` (alles committed)
- `errors > 0` → status `analyzed` (partial success, resume möglich)
- `completed_batches_*` Keys werden über den finalen updateSession hinweg **preserviert** — retry skippt bereits committed batches

### 6. Echtes Fuzzy-Matching mit pg_trgm

- Extension: `pg_trgm` + `fuzzystrmatch`
- GIN-Index: `idx_release_title_trgm ON "Release" USING GIN ((lower(title)) gin_trgm_ops)`
- Query-Strategie: `lower(r.title) % lower(q.search_title)` als Pre-Filter (Index-Lookup), dann `similarity(lower(a.name || ' ' || r.title), lower(q.search_full))` als Ranking
- Session-Param: `SET pg_trgm.similarity_threshold = 0.3`
- Batch-Size: 500 Rows pro SQL-Query → 12 Batches für 5000 Rows (statt 5000 einzelner Queries)

## Event-Schema (SSE)

Jedes Event hat diese Basisstruktur:
```json
{
  "type": "phase_progress",
  "phase": "fuzzy_match",
  "timestamp": "2026-04-10T10:15:32.124Z",
  ...payload
}
```

### Upload Events
| type | payload |
|------|---------|
| `parse_start` | `{ session_id, filename, size_bytes }` |
| `parse_progress` | `{ rows_parsed, estimated_total }` (jede 1000 Rows) |
| `parse_done` | `{ rows }` |
| `dedup` | `{ before, after, duplicates }` |
| `session_saved` | `{ session_id }` |
| `cache_check` | `{ cached, to_fetch }` |
| `done` | Full upload result |

### Fetch Events
| type | payload |
|------|---------|
| `start` | `{ session_id }` |
| `plan` | `{ total, already_cached, to_fetch }` |
| `progress` | `{ current, total, fetched, cached, errors, artist, title, status, eta_min }` |
| `rate_limited` | `{ wait_s }` |
| `error_detail` | `{ discogs_id, kind, artist, title }` |
| `paused` | `{ message }` |
| `cancelled` | `{ current, total, fetched, cached, errors }` |
| `done` | `{ fetched, cached, errors, duration_min }` |

### Analyze Events
| type | payload |
|------|---------|
| `start` | `{ session_id }` |
| `phase_start` | `{ phase: "exact_match" \| "cache_load" \| "fuzzy_match" \| "aggregating", ... }` |
| `phase_progress` | `{ phase: "fuzzy_match", batch, total_batches, rows_processed, total_rows, matches_so_far }` |
| `phase_done` | `{ phase, duration_ms, ... }` |
| `batch_error` | `{ batch, error }` |
| `cancelled` | `{ at_phase, batch }` |
| `done` | `{ summary, existing, linkable, new, skipped }` |

### Commit Events
| type | payload |
|------|---------|
| `start` | `{ session_id }` |
| `phase_start` | `{ phase: "preparing" \| "existing_updates" \| "linkable_updates" \| "new_inserts" \| "committing", total }` |
| `phase_progress` | `{ phase, current, total, last, counters? }` |
| `phase_done` | `{ phase, ... }` |
| `rollback` | `{ reason, cancelled, counters }` |
| `done` | `{ run_id, collection, inserted, linked, updated, skipped, errors }` |

### Heartbeat
SSE-Kommentar-Zeilen (kein JSON-Event), werden vom Client ignoriert aber halten die Verbindung aktiv:
```
: heartbeat 1712750130000
```

## Datenbankschema

### `import_session` (erweitert v5.0)
| Spalte | Typ | Zweck |
|--------|-----|-------|
| `id` | TEXT PK | UUID |
| `collection_name` | TEXT | "Sammlung Müller" |
| `filename` | TEXT | Original export filename |
| `rows` | JSONB | Compact rows (nur essenzielle Felder, siehe `compactRow`) |
| `row_count` / `unique_count` | INT | Vor/nach Dedup |
| `format_detected` / `export_type` | TEXT | "CSV" / "COLLECTION" oder "INVENTORY" |
| `status` | TEXT | uploading → uploaded → fetching → fetched → analyzing → analyzed → importing → done |
| `parse_progress` | JSONB | `{ phase, rows_parsed, estimated_total }` |
| `fetch_progress` | JSONB | `{ current, total, fetched, cached, errors }` |
| `analyze_progress` | JSONB | `{ phase, batch, total_batches, rows_processed, total_rows, matches_so_far }` |
| `commit_progress` | JSONB | `{ phase, current, total, last_release, counters }` |
| `analysis_result` | JSONB | Full output from analyze step (fed to commit) |
| `import_settings` | JSONB | Condition, inventory, markup etc. |
| `cancel_requested` | BOOLEAN | Set via POST /cancel |
| `pause_requested` | BOOLEAN | Set via POST /pause, cleared via /resume |
| `last_event_at` | TIMESTAMPTZ | Updated on every session mutation |
| `last_error` | JSONB | Rolling buffer (last 10) `{ phase, discogs_id, message, timestamp }` |
| `run_id` | TEXT | Set on commit done |
| `error_message` | TEXT | Human-readable error from failed phase |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

### `import_event` (neu v5.0)
| Spalte | Typ | Zweck |
|--------|-----|-------|
| `id` | BIGSERIAL PK | |
| `session_id` | TEXT FK → import_session | ON DELETE CASCADE |
| `phase` | TEXT | "upload" / "fetch" / "analyze" / "commit" / "control" / "error" |
| `event_type` | TEXT | Event-Type-String (siehe Events-Tabelle) |
| `payload` | JSONB | Event-Payload ohne `type`/`phase`/`timestamp` |
| `created_at` | TIMESTAMPTZ | |

Indizes: `(session_id, created_at DESC)`, `(created_at)` für Cleanup.

### `discogs_api_cache` (unverändert seit v4.0)
| Spalte | Typ | Zweck |
|--------|-----|-------|
| `discogs_id` | INT PK | |
| `api_data` | JSONB | Release-Daten |
| `suggested_prices` | JSONB | Price Suggestions pro Condition |
| `is_error` | BOOLEAN | 404 oder Fehler |
| `error_message` | TEXT | |
| `fetched_at` | TIMESTAMPTZ | |
| `expires_at` | TIMESTAMPTZ | Default NOW() + 30 days (Errors 7 days) |

### `import_log` (unverändert)
Run-Log mit einem Eintrag pro importierter Release: `run_id`, `collection_name`, `action` (inserted/linked/updated/skipped), `data_snapshot` (Excel-Row + API-Summary).

## Migration-Files

| Datei | Inhalt |
|-------|--------|
| `backend/scripts/migrations/2026-04-09_discogs_import_v2.sql` | Release-Spalten: genres, styles, discogs_price_history, additional_labels, data_source, discogs_suggested_prices |
| `backend/scripts/migrations/2026-04-10_discogs_import_refactoring.sql` | `import_session`, `discogs_api_cache`, pg_trgm/fuzzystrmatch Extensions, GIN-Index |
| `backend/scripts/migrations/2026-04-10_discogs_import_live_feedback.sql` | Session-Erweiterung (`parse/analyze/commit_progress`, `last_event_at`, `last_error`, `cancel_requested`, `pause_requested`), `import_event` Tabelle |

## Betrieb

### Ein Import starten

1. Operations Hub → "Discogs Collection Import"
2. Datei per Dropzone hochladen
3. Collection Name eingeben
4. "Upload & Parse" → Live-Log zeigt Parse-Progress
5. "Fetch Discogs Data" → SSE Progress für Discogs-Fetch (~20 Releases/min)
6. Nach Fetch: Auto-Analyze (pg_trgm Fuzzy Match, typisch 30-60s)
7. Review Tab: Checkboxen, Condition, Markup
8. "Approve & Import" → Phase-basiertes Live-Progress → Transaction COMMIT/ROLLBACK

### Fortsetzen nach Crash/Reload

- Page-Reload: Resume-Banner erscheint wenn Session nicht final
- Click "Resume": Session wird geladen, Polling startet (2s), Live-Log zeigt vorherige Events
- Click "Abandon": Session aus localStorage entfernt (bleibt in DB bis cleanup)

### Import abbrechen

- Während **Fetch**: Click "Cancel" → Loop bricht am nächsten Release ab, Session-Status → `fetched` mit `cancelled: true` in `fetch_progress`
- Während **Analyze**: Click "Cancel" → Loop bricht am nächsten Batch ab, Session zurück auf `fetched`
- Während **Commit**: Click "Cancel" → Transaction `ROLLBACK` → DB unverändert, Session zurück auf `analyzed`, `rollback`-Event mit `cancelled: true`

### Import pausieren / fortsetzen

- Click "Pause" → `pause_requested=true` → nächster Check im Loop emit'ed `paused` Event und wartet
- Click "Resume" → `pause_requested=false` → Loop läuft weiter
- Cancel während Pause: clearet pause, setzt cancel, Loop bricht ab

### Ein Commit-Rollback debuggen

1. `SELECT last_error FROM import_session WHERE id = '...'` → letzte 10 Fehler mit phase + release_id
2. `SELECT * FROM import_event WHERE session_id = '...' AND event_type IN ('rollback', 'batch_error') ORDER BY id DESC`
3. Admin UI: History Tab → "View ▶" neben dem Run → Modal mit kompletter Event-Timeline

## Performance-Eckdaten

| Schritt | 5.000 Releases | 500 Releases |
|---------|---------------|--------------|
| Upload + Parse | 2-5s | <1s |
| Fetch (20/min rate limit) | ~4h | ~25min |
| Analyze (pg_trgm, 12 Batches à 500) | 30-60s | 3-6s |
| Commit (per-batch, 500 rows each) | ~7 min | 30-60s |

**Gemessen in Produktion (Pargmann Run `cbce39b2`, 2026-04-10):** Commit von 3.251 neuen Releases in 7 Batches, durchschnittlich ~55s/Batch (erste 65s wegen Artist/Label Setup, später schneller durch Dedup-Cache). Inklusive 997 existing updates + 1.398 linkable updates: **6 Minuten 11 Sekunden Gesamt**.

## Post-Import Checklist

Bei jedem neuen Import-Source (oder großen Code-Changes am Commit) sollten diese Punkte nach dem ersten erfolgreichen Commit geprüft werden — sie sind alles Bugs die wir beim Pargmann-Import gefunden haben und die nicht durch den Commit selbst sichtbar werden:

### Visibility
- [ ] Release-Detail-Page lädt (keine 404)
- [ ] Cover-Image erscheint (nicht nur Placeholder) → `next.config.ts` `images.remotePatterns` whitelist?
- [ ] Additional Images erscheinen in der Gallery
- [ ] Alle Image-Hostnames sind in Next.js whitelist

### Catalog Integration
- [ ] `GET /store/catalog?search=<Title>` findet den Release
- [ ] `GET /store/catalog/suggest?q=<Title>` zeigt ihn im Autocomplete
- [ ] `GET /store/catalog?category=vinyl` zeigt LPs (falls Release-Format LP)
- [ ] `GET /store/catalog?category=tapes` zeigt Cassettes/Reels
- [ ] Alphabetische Sortierung platziert ihn an der erwarteten Stelle

### Plattform Policies
- [ ] `estimated_value` ist Integer (`whole_euros_only: true`)
- [ ] `direct_price` wenn gesetzt ist Integer
- [ ] `legacy_available = false` (nicht true — Discogs ist nicht "legacy")
- [ ] `product_category = 'release'` (nicht band_literature/etc.)

### Datenintegrität
- [ ] `coverImage IS NOT NULL` für visibility
- [ ] `artistId` zeigt auf existierenden `Artist` row
- [ ] `labelId` zeigt auf existierenden `Label` row (bei den neuen)
- [ ] `Track` rows verknüpft via `releaseId`
- [ ] `Image` rows mit `rang` korrekt geordnet (1 = primary cover)

## Cleanup

- `discogs_api_cache` Einträge laufen automatisch ab (TTL 30d / 7d Errors)
- `import_event` wächst unbegrenzt — periodisches Cleanup empfohlen (z.B. älter als 30 Tage löschen)
- `import_session` wächst unbegrenzt — historische Sessions bleiben erhalten als Dokumentation

Vorschlag Cron (TBD):
```sql
-- Täglich: abgelaufene Cache-Einträge
DELETE FROM discogs_api_cache WHERE expires_at < NOW();

-- Wöchentlich: alte Events
DELETE FROM import_event WHERE created_at < NOW() - INTERVAL '30 days';

-- Wöchentlich: alte done-Sessions
DELETE FROM import_session WHERE status = 'done' AND updated_at < NOW() - INTERVAL '90 days';
```

## Credentials

In `backend/.env`:
```
DISCOGS_TOKEN=...    # Discogs personal access token, 60 req/min authenticated
```

## IDs für neue Einträge

| Typ | ID-Format | Beispiel |
|-----|-----------|----------|
| Release | `discogs-release-{discogs_id}` | `discogs-release-1104999` |
| Artist | `discogs-artist-{discogs_artist_id}` | `discogs-artist-56789` |
| Label | `discogs-label-{discogs_label_id}` | `discogs-label-12345` |
| Track | `dt-{discogs_id}-{position}` | `dt-1104999-A1` |
| Image | `discogs-image-{discogs_id}-{n}` | `discogs-image-1104999-1` |
| Import Log | `ilog-{run_id_prefix}-{discogs_id}` | `ilog-a1b2c3d4-1104999` |

Konsistent mit bestehendem `legacy-release-{id}` Pattern.

## Related Docs

- `docs/DISCOGS_IMPORT_AUDIT.md` — Initial Audit (v3→v4 Refactoring-Grundlage)
- `docs/DISCOGS_IMPORT_REFACTORING_PLAN.md` — Plan für v4 (DB-Sessions, pg_trgm, Transaktionen) — IMPLEMENTIERT
- `docs/DISCOGS_IMPORT_LIVE_FEEDBACK_PLAN.md` — Plan für v5 (SSE überall, Resume, Cancel/Pause) — IMPLEMENTIERT
- `docs/architecture/CHANGELOG.md` — rc13 (v3.0), rc14 (v4.0), rc15 (v5.0)

## File-Layout

```
backend/src/
  api/admin/discogs-import/
    upload/route.ts              # Header-based SSE or plain JSON
    fetch/route.ts               # SSE, heartbeat, cancel/pause, error buffer
    analyze/route.ts             # SSE, 4-phase, pg_trgm batch
    commit/route.ts              # SSE, 3-phase, transactional, cancel→rollback
    history/route.ts             # Runs + drill-down (entries + events)
    session/[id]/
      status/route.ts            # GET — state + recent events
      cancel/route.ts            # POST — set cancel_requested
      pause/route.ts             # POST — set pause_requested
      resume/route.ts            # POST — clear pause_requested
  lib/discogs-import.ts          # SSEStream, session helpers, cancel/pause, errors
  admin/
    components/discogs-import.tsx  # React components + hooks
    routes/discogs-import/page.tsx  # Main admin page
  scripts/migrations/
    2026-04-10_discogs_import_refactoring.sql    # v4: DB-Sessions + pg_trgm
    2026-04-10_discogs_import_live_feedback.sql  # v5: Progress + events + controls
```
