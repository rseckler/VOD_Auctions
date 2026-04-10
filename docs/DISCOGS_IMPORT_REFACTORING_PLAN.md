# Discogs Import Service — Refactoring Plan

**Version:** 1.0
**Datum:** 2026-04-10
**Status:** Plan — Implementierung noch NICHT gestartet
**Voraussetzung:** Kein weiterer Import bis Refactoring abgeschlossen
**Referenz:** `docs/DISCOGS_IMPORT_AUDIT.md` (Problembeschreibung)

---

## 1. Zielbild

Ein robuster, crash-resistenter Import-Service der:
- **Keinen Datenverlust** bei Server-Restart/Deploy hat
- **Live gegen die DB** matcht, nicht gegen veraltete Snapshots
- **Echtes Fuzzy-Matching** für Artist/Title-Vergleiche nutzt
- **Transaktional** importiert (alles oder nichts)
- **Komplett über die Admin UI** bedienbar ist (kein Terminal nötig)

---

## 2. Architektur-Änderungen

### 2.1 Sessions → PostgreSQL (statt In-Memory Map)

**Neue Tabelle: `import_session`**

```sql
CREATE TABLE import_session (
    id TEXT PRIMARY KEY,                    -- UUID
    collection_name TEXT NOT NULL,
    filename TEXT NOT NULL,
    rows JSONB NOT NULL,                    -- Geparste CSV/XLSX-Rows
    row_count INTEGER NOT NULL,
    unique_count INTEGER NOT NULL,
    format_detected TEXT,
    export_type TEXT,                        -- 'COLLECTION' | 'INVENTORY'
    status TEXT DEFAULT 'uploaded',          -- uploaded → fetching → fetched → analyzing → analyzed → importing → done
    fetch_progress JSONB,                   -- { current, total, fetched, cached, errors }
    analysis_result JSONB,                  -- { summary, existing[], linkable[], new[], skipped[] }
    import_settings JSONB,                  -- { condition, inventory, price_markup }
    run_id TEXT,                             -- UUID, gesetzt bei Commit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_import_session_status ON import_session(status);
```

**Warum:**
- Überlebt Server-Restart/Deploy
- Status-Feld ermöglicht Resume nach Crash
- Analyse-Ergebnis wird gespeichert → kein Re-Analyze nach Tab-Wechsel
- Fetch-Progress wird gespeichert → UI kann nach Reconnect den Fortschritt anzeigen

**Was wegfällt:**
- `const sessions = new Map<string, Session>()` (upload/route.ts)
- `touchSession()` Funktion
- Session-Cleanup-Interval
- Alle `sessions.get(session_id)` Aufrufe → werden zu DB-Queries

### 2.2 API-Cache → PostgreSQL (statt JSON-Datei)

**Neue Tabelle: `discogs_api_cache`**

```sql
CREATE TABLE discogs_api_cache (
    discogs_id INTEGER PRIMARY KEY,
    api_data JSONB NOT NULL,                -- Volle API-Response (title, year, artists, images, etc.)
    suggested_prices JSONB,                 -- Price Suggestions pro Condition
    is_error BOOLEAN DEFAULT FALSE,         -- True wenn 404/error
    error_message TEXT,
    fetched_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL         -- fetched_at + 30 Tage (Errors: + 7 Tage)
);
CREATE INDEX idx_discogs_cache_expires ON discogs_api_cache(expires_at);
```

**Warum:**
- Keine Race Conditions bei parallelen Fetches
- TTL: 30 Tage für erfolgreiche Einträge, 7 Tage für Errors (automatisch re-fetcht)
- Per-discogs_id statt per-Import → effizientes Caching über Imports hinweg
- Keine 65 MB JSON-Datei mehr die bei jedem Schreiben komplett neu serialisiert wird

**Was wegfällt:**
- `scripts/data/discogs_import_cache.json` (komplett)
- `fs.readFileSync(cachePath)` / `fs.writeFileSync(cachePath)` in fetch/route.ts
- Alles in analyze/route.ts was den Cache per `fs` liest

### 2.3 Snapshots → Live-DB-Queries (statt JSON-Dateien)

**Aktuell (kaputt):**
```typescript
// analyze/route.ts — liest statische Dateien
const existingByDiscogs = JSON.parse(fs.readFileSync("db_discogs_ids.json"))
const unlinked = JSON.parse(fs.readFileSync("db_unlinked_releases.json"))
```

**Neu:**
```typescript
// analyze/route.ts — Live-Query gegen DB
const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

// Schritt 1: Exact Match via discogs_id
const existingRows = await pgConnection.raw(`
    SELECT id, discogs_id FROM "Release" 
    WHERE discogs_id = ANY(?)
`, [discogsIds])

// Schritt 2: Fuzzy Match via pg_trgm (nur für nicht-gematchte)
const fuzzyMatches = await pgConnection.raw(`
    SELECT r.id, r.title, a.name as artist_name, r."catalogNumber",
           similarity(lower(a.name || ' ' || r.title), lower(?)) as sim
    FROM "Release" r
    LEFT JOIN "Artist" a ON r."artistId" = a.id
    WHERE r.discogs_id IS NULL
    AND similarity(lower(a.name || ' ' || r.title), lower(?)) > 0.4
    ORDER BY sim DESC
    LIMIT 1
`, [searchString, searchString])
```

**Warum:**
- Immer aktuell — matcht gegen die echte DB, nicht gegen Tage-alte Snapshots
- `pg_trgm` für echtes Fuzzy-Matching (similarity > 0.4 = 40% Übereinstimmung)
- Kein manuelles Regenerieren von Snapshots nötig

**Was wegfällt:**
- `scripts/data/db_discogs_ids.json` (komplett)
- `scripts/data/db_unlinked_releases.json` (komplett)
- Alles in analyze/route.ts + commit/route.ts was Snapshots per `fs` liest
- Die Supabase MCP Export-Routine die diese Dateien erstellt hat

### 2.4 Transaktionaler Import

**Aktuell (kaputt):**
```typescript
for (const row of session.rows) {
    try {
        await pgConnection.raw(`INSERT INTO "Release" ...`)  // committed sofort
        await pgConnection.raw(`INSERT INTO "Track" ...`)    // committed sofort
    } catch { counters.errors++ }  // Rest wird weiter verarbeitet
}
```

**Neu:**
```typescript
const trx = await pgConnection.transaction()
try {
    for (const row of selectedRows) {
        await trx.raw(`INSERT INTO "Release" ...`)
        await trx.raw(`INSERT INTO "Track" ...`)
    }
    await trx.commit()
} catch (err) {
    await trx.rollback()
    throw err  // Nichts wurde geschrieben
}
```

**Warum:**
- Alles oder nichts — kein Zustand wo 2.000 von 5.000 Releases importiert sind
- Fehler bei Release #3.500 → Rollback → DB unverändert → Fehler fixen → Retry

### 2.5 Echtes Fuzzy-Matching mit pg_trgm

**PostgreSQL Extension aktivieren:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
```

**Matching-Strategie (3-stufig, in Reihenfolge):**

| Stufe | Methode | Schwelle | Beispiel |
|-------|---------|----------|---------|
| 1. Exact | `discogs_id` Match | 100% | discogs_id 797653 → legacy-release-23759 |
| 2. Trigram | `pg_trgm similarity()` auf `artist + title` | ≥ 60% | "39 Clocks Pain It Dark" ~ "39 Clocks - Pain It Dark" |
| 3. Phonetic | `soundex()` auf Artist + exact Title | Match | "Björk" ~ "Bjork" |

**Für jede nicht-gematchte Row:**
```sql
SELECT r.id, r.title, a.name,
       similarity(lower(a.name || ' ' || r.title), lower($1)) as score
FROM "Release" r
LEFT JOIN "Artist" a ON r."artistId" = a.id  
WHERE r.discogs_id IS NULL
  AND lower(a.name || ' ' || r.title) % lower($1)  -- GiST-Index nutzen
ORDER BY score DESC
LIMIT 1
```

**GiST-Index für Performance:**
```sql
CREATE INDEX idx_release_trgm ON "Release" 
    USING GIN ((lower(title)) gin_trgm_ops);
```

**Admin UI zeigt Match-Confidence:**
```
✅ 39 Clocks — Pain It Dark  →  legacy-release-23759  (98% match)
⚠️ Einstürzende Neubauten — Halber Mensch  →  legacy-release-12345  (72% match)
❓ Unknown Artist — Rare Title  →  No match found
```

---

## 3. Neuer Workflow (End-to-End)

```
┌─────────────────────────────────────────────────────────────────┐
│                    ADMIN UI WORKFLOW                             │
│                                                                 │
│  1. UPLOAD            CSV/XLSX → Parse → import_session (DB)    │
│     └─ Status: uploaded                                         │
│     └─ Zeigt: Row Count, Format, Already Cached (aus DB)        │
│                                                                 │
│  2. FETCH             Discogs API → discogs_api_cache (DB)      │
│     └─ Status: fetching → fetched                               │
│     └─ SSE Live-Progress (crash-resilient: Session in DB)       │
│     └─ Überspringt cached Einträge (TTL 30d)                   │
│     └─ Nach Crash: Resume von wo gestoppt                       │
│                                                                 │
│  3. ANALYZE           Live-DB-Query (nicht Snapshots!)           │
│     └─ Status: analyzing → analyzed                             │
│     └─ Exact Match (discogs_id) → Trigram Match → No Match      │
│     └─ Ergebnis in import_session.analysis_result gespeichert   │
│     └─ UI zeigt Match-Confidence (98%, 72%, etc.)               │
│                                                                 │
│  4. REVIEW            Admin prüft, Checkboxen, Settings          │
│     └─ Condition, Inventory, Price Markup                       │
│     └─ Detail-Preview pro Release (Bilder, Tracks, Credits)     │
│     └─ Unsichere Matches (< 80%) gelb markiert                  │
│                                                                 │
│  5. IMPORT            Transaktional in DB schreiben              │
│     └─ Status: importing → done                                 │
│     └─ Alles-oder-nichts (Transaction + Rollback)               │
│     └─ SSE Live-Progress                                        │
│     └─ Ergebnis in import_log                                   │
│                                                                 │
│  6. HISTORY           Vergangene Imports einsehen                │
│     └─ Pro Run: Inserted/Linked/Updated/Skipped/Errors          │
│     └─ Drill-Down: welche Releases, welche Fehler               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Dateien: Was ändert sich?

### Neue Dateien

| Datei | Zweck |
|-------|-------|
| `backend/scripts/migrations/2026-04-10_discogs_import_refactoring.sql` | Migration: `import_session`, `discogs_api_cache`, pg_trgm Extension, GiST-Index |

### Zu überarbeitende Dateien (Rewrite)

| Datei | Aktuell | Neu |
|-------|---------|-----|
| `backend/src/api/admin/discogs-import/upload/route.ts` | In-Memory Map, CSV/XLSX Parse | Parse → Speichert in `import_session` (DB). Prüft Cache-Status per DB-Query |
| `backend/src/api/admin/discogs-import/fetch/route.ts` | Liest Session aus Map, schreibt JSON-Cache | Liest Session aus DB, schreibt `discogs_api_cache` (DB). Status-Updates in `import_session` |
| `backend/src/api/admin/discogs-import/analyze/route.ts` | Liest Snapshots per `fs`, einfacher String-Match | Live-DB-Queries mit pg_trgm. Ergebnis in `import_session.analysis_result` |
| `backend/src/api/admin/discogs-import/commit/route.ts` | Liest Snapshots, einzelne INSERTs ohne Transaktion | Liest Analyse aus `import_session`, transaktionaler Import |
| `backend/src/api/admin/discogs-import/history/route.ts` | Nur `import_log` Query | Zeigt auch Session-Status + Drill-Down |
| `backend/src/admin/routes/discogs-import/page.tsx` | Session-ID im React State | Session-ID im React State (bleibt), aber Backend ist crash-resilient. Match-Confidence Anzeige. |

### Dateien die entfallen

| Datei | Grund |
|-------|-------|
| `scripts/data/db_discogs_ids.json` | Ersetzt durch Live-DB-Query |
| `scripts/data/db_unlinked_releases.json` | Ersetzt durch Live-DB-Query |
| `scripts/data/discogs_import_cache.json` | Ersetzt durch `discogs_api_cache` Tabelle |
| `scripts/data/discogs_import_progress.json` | Ersetzt durch `import_session.status` |

---

## 5. Migration SQL

```sql
-- 1. PostgreSQL Extensions für Fuzzy-Matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- 2. Import Session (ersetzt In-Memory Map)
CREATE TABLE IF NOT EXISTS import_session (
    id TEXT PRIMARY KEY,
    collection_name TEXT NOT NULL,
    filename TEXT NOT NULL,
    rows JSONB NOT NULL,
    row_count INTEGER NOT NULL,
    unique_count INTEGER NOT NULL,
    format_detected TEXT,
    export_type TEXT,
    status TEXT DEFAULT 'uploaded',
    fetch_progress JSONB,
    analysis_result JSONB,
    import_settings JSONB,
    selected_ids JSONB,
    run_id TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_session_status ON import_session(status);
CREATE INDEX IF NOT EXISTS idx_import_session_created ON import_session(created_at);

-- 3. Discogs API Cache (ersetzt JSON-Datei)
CREATE TABLE IF NOT EXISTS discogs_api_cache (
    discogs_id INTEGER PRIMARY KEY,
    api_data JSONB NOT NULL,
    suggested_prices JSONB,
    is_error BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);
CREATE INDEX IF NOT EXISTS idx_discogs_cache_expires ON discogs_api_cache(expires_at);

-- 4. GiST-Index für Trigram-Matching
CREATE INDEX IF NOT EXISTS idx_release_artist_trgm 
    ON "Release" USING GIN ((lower(title)) gin_trgm_ops);

-- 5. Cleanup: alte Sessions nach 7 Tagen automatisch löschen
-- (Kann als Cron-Job oder DB-Trigger implementiert werden)
```

---

## 6. API Route Spezifikationen (Rewrite)

### POST /admin/discogs-import/upload

**Input:** `{ data, filename, collection_name, encoding }`
**Ablauf:**
1. CSV/XLSX parsen (wie bisher)
2. Deduplizieren (wie bisher)
3. `INSERT INTO import_session` (statt Map)
4. Cache-Status per DB-Query: `SELECT COUNT(*) FROM discogs_api_cache WHERE discogs_id = ANY(?) AND expires_at > NOW()`
5. Return: `{ session_id, row_count, unique_count, already_cached, to_fetch }`

### POST /admin/discogs-import/fetch

**Input:** `{ session_id }`
**Ablauf:**
1. Session aus DB laden: `SELECT * FROM import_session WHERE id = ?`
2. Status auf `fetching` setzen
3. Für jede discogs_id die NICHT in `discogs_api_cache` ist (oder expired):
   - `GET /releases/{id}` + `GET /marketplace/price_suggestions/{id}`
   - `INSERT INTO discogs_api_cache ... ON CONFLICT (discogs_id) DO UPDATE`
   - SSE Progress Event
4. Status auf `fetched` setzen
5. **Crash-Resilient:** Bei Reconnect → Session aus DB laden → Status prüfen → Cache-DB zeigt was schon gefetcht ist → Resume

### POST /admin/discogs-import/analyze

**Input:** `{ session_id }`
**Ablauf:**
1. Session aus DB laden
2. Status auf `analyzing` setzen
3. **Stufe 1 — Exact Match:**
   ```sql
   SELECT id, discogs_id FROM "Release" WHERE discogs_id = ANY($1)
   ```
4. **Stufe 2 — Trigram Fuzzy Match** (nur für nicht-gematchte):
   ```sql
   SELECT r.id, r.title, a.name, r."catalogNumber",
          similarity(lower(a.name || ' ' || r.title), lower($1)) as score
   FROM "Release" r
   LEFT JOIN "Artist" a ON r."artistId" = a.id
   WHERE r.discogs_id IS NULL
     AND similarity(lower(a.name || ' ' || r.title), lower($1)) > 0.4
   ORDER BY score DESC LIMIT 1
   ```
5. API-Daten aus `discogs_api_cache` joinen
6. Ergebnis in `import_session.analysis_result` speichern
7. Status auf `analyzed` setzen
8. Return: `{ summary, existing[], linkable[], new[], skipped[] }`

### POST /admin/discogs-import/commit

**Input:** `{ session_id, selected_discogs_ids, media_condition, sleeve_condition, inventory, price_markup }`
**Ablauf:**
1. Session aus DB laden (inkl. `analysis_result`)
2. Status auf `importing` setzen
3. `BEGIN TRANSACTION`
4. Für jede selected Row:
   - EXISTING → UPDATE Preise + Community
   - LINKABLE → UPDATE discogs_id + Preise
   - NEW → INSERT Release + Artist + Label + Track + Image + ReleaseArtist
5. `COMMIT` (oder `ROLLBACK` bei Fehler)
6. Import-Log schreiben
7. Status auf `done` setzen
8. SSE Progress Events während der Schleife

### GET /admin/discogs-import/history

**Ablauf:**
1. `import_log` GROUP BY run_id (wie bisher)
2. Zusätzlich: aktive Sessions anzeigen (`import_session WHERE status NOT IN ('done', 'error')`)
3. Drill-Down: bei Klick auf Run → Details aus `import_log`

---

## 7. Admin UI Änderungen

### Upload Tab
- Nach Upload: zeigt **"X already cached (from previous imports)"** per DB-Query
- Fetch-Button: **"Fetch N remaining releases (~M min)"** mit konkreter Zahl

### Fetch Step
- SSE Progress (wie bisher)
- **NEU:** Nach Crash/Reconnect: Seite zeigt Session-Status aus DB → "Fetch was interrupted at 2.400/5.653. Resume?"
- **NEU:** Cancel-Button der den Fetch abbricht (Status → `fetched` mit partial data)

### Analysis Tab
- **NEU:** Match-Confidence Score pro Release (98%, 72%, etc.)
- **NEU:** Unsichere Matches (< 80%) gelb markiert, > 95% grün
- **NEU:** "Rematch" Button für einzelne Releases (manuelle Zuordnung)

### Import Settings
- Condition, Inventory, Price Markup (wie bisher)
- **NEU:** Warnung wenn keine API-Daten für X% der Releases vorhanden

### History Tab
- **NEU:** Aktive/laufende Sessions anzeigen (Status: fetching, analyzing)
- **NEU:** Drill-Down pro Import-Run (welche Releases, welche Fehler)

---

## 8. Reihenfolge der Implementierung

### Schritt 1: Migration + Extensions (15 min)
- SQL ausführen via Supabase MCP
- pg_trgm + fuzzystrmatch aktivieren
- Tabellen `import_session` + `discogs_api_cache` erstellen
- GiST-Index auf Release.title

### Schritt 2: Upload Route rewrite (1h)
- Session in DB speichern statt Map
- Cache-Status aus DB lesen
- Upload-Route testen: CSV hochladen → Session in DB prüfen

### Schritt 3: Fetch Route rewrite (2h)
- Session aus DB laden
- API-Calls → `discogs_api_cache` Tabelle
- SSE Progress mit Status-Updates in DB
- Testen: 20 Releases fetchen → Cache-Einträge in DB prüfen

### Schritt 4: Analyze Route rewrite (2h)
- Live-DB-Queries statt Snapshots
- pg_trgm Fuzzy-Matching
- Ergebnis in `import_session.analysis_result`
- Testen: Analyse mit bekannten Daten → Matching-Ergebnisse vergleichen

### Schritt 5: Commit Route rewrite (2h)
- Transaktionaler Import
- Liest Analyse-Ergebnis aus Session
- SSE Progress
- Testen: 20 Releases importieren → DB prüfen → Rollback testen

### Schritt 6: Admin UI update (2h)
- Match-Confidence Anzeige
- Session-Resume nach Crash
- Cache-Status im Upload
- History Drill-Down

### Schritt 7: End-to-End Test (1h)
- Kompletter Workflow: Upload → Fetch → Analyze → Review → Import
- Mit einer kleinen Test-CSV (50 Releases)
- Crash-Test: Server während Fetch restarten → Resume prüfen

### Schritt 8: Aufräumen (30 min)
- Alte Snapshot-Dateien löschen
- Alte Cache-Datei löschen
- Dokumentation aktualisieren

**Geschätzter Gesamtaufwand: ~11 Stunden**

---

## 9. Risiken

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|-------------------|------------|
| pg_trgm Performance bei 41.546 Releases | Niedrig | GiST-Index, LIMIT pro Query |
| `import_session.rows` JSONB zu groß (10.000 Rows) | Mittel | Rows komprimieren (nur discogs_id + artist + title) |
| Discogs API Rate Limit Änderung | Niedrig | Rate Limiter konfigurierbar |
| Supabase Free Plan Limits (DB-Größe) | Mittel | `discogs_api_cache` Cleanup-Job (expired löschen) |

---

## 10. Verifikation nach Refactoring

### Funktionale Tests
- [ ] Upload CSV → Session in DB (`SELECT * FROM import_session`)
- [ ] Fetch 20 Releases → Cache-Einträge in DB (`SELECT COUNT(*) FROM discogs_api_cache`)
- [ ] Server-Restart während Fetch → Session still there → Resume
- [ ] Analyze → Exact Match korrekt (discogs_id)
- [ ] Analyze → Fuzzy Match korrekt ("39 Clocks" ~ "39 Clocks")
- [ ] Analyze → Fuzzy Match mit Abweichung ("The Beatles" ~ "Beatles, The")
- [ ] Commit 20 NEW Releases → alle in DB (`SELECT * FROM "Release" WHERE id LIKE 'discogs-release-%'`)
- [ ] Commit mit Fehler → Rollback → DB unverändert
- [ ] History zeigt alle Runs korrekt

### Performance Tests
- [ ] Upload 10.000-Row CSV → < 5s Parse-Time
- [ ] Analyze 5.000 Releases → < 30s (mit pg_trgm)
- [ ] Commit 5.000 Releases → < 60s (transaktional)

### Regression Tests
- [ ] Bestehende 41.546 Releases unverändert
- [ ] Legacy Sync weiterhin funktional
- [ ] Discogs Daily Sync weiterhin funktional
- [ ] Admin UI andere Seiten nicht betroffen
