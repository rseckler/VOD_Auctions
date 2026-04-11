# Discogs Collections Overview — Implementation Plan

**Status:** ✅ Implemented & Deployed (commit `2a96b3e`, rc17, 2026-04-11)
**Created:** 2026-04-11
**Last Updated:** 2026-04-11
**Author:** Robin Seckler
**Related:** `DISCOGS_IMPORT_SERVICE.md` v5.1.1, `DISCOGS_IMPORT_SESSION_2026-04-10.md`, `CHANGELOG.md` rc17

## Motivation

Nach erfolgreichem Pargmann-Import (5653 Releases, rc16) fehlt eine vernünftige Übersicht über alle jemals importierten Discogs-Collections. Der bestehende History-Tab in `/app/discogs-import` zeigt nur eine flache Tabelle und ein Modal mit Event-Timeline — zu wenig für echtes Collection-Management.

**User-Ziel:**
- Übersicht aller importierten Listen (Name, was wurde importiert, Statistiken)
- Detailansicht pro Import mit allen Releases
- Direkt aus der Detailansicht auf Storefront-Catalog-Seiten springen
- Live-Zustand sehen (wie viele Releases aus diesem Import sind aktuell sichtbar, kaufbar, verkauft)

## Bestehende Datenbasis

| Tabelle | Zweck | Reuse |
|---------|-------|-------|
| `import_session` | Master-Record pro Import (collection_name, filename, status, counts, commit_progress, import_settings, run_id) | ✅ Vollständig |
| `import_log` | 1 Zeile pro Release im Commit (run_id, release_id, discogs_id, action, data_snapshot JSONB) | ✅ Vollständig |
| `import_event` | Event-Timeline pro Session | ✅ Für Drill-Down |
| `Release` × `Artist` × `Image` | Aktueller Zustand der Releases | ✅ Via LEFT JOIN für Live-Stats |

**Bestehende Route:** `GET /admin/discogs-import/history` liefert:
- Liste aller Runs (aggregiert aus `import_log` GROUP BY run_id)
- Bei `?run_id=...`: Entries + Events für Drill-Down-Modal

Die Liste ist zu dünn (keine Session-Metadaten, keine Stats), das Drill-Down ist ein Modal ohne Catalog-Links.

---

## Zielbild

### Liste (History-Tab bleibt, wird ausgebaut)

- **Stats-Header:** Total Imports / Total Releases / Last Import Date / Total inserted vs linked vs skipped
- **Filter/Suche:** nach Collection-Name, Source-File, Datum-Range, Status
- **Tabelle** mit Zeilen — Row-Click öffnet **dedizierte Detail-Route** statt Modal

### Detail-Seite `/app/discogs-import/history/[runId]`

- **Run-Metadaten:** Collection, File, Datum, Dauer, Import-Settings (condition/priceMarkup/inventory)
- **Stats-Grid:** inserted / linked / updated / skipped / errors / **visible_now** / **purchasable_now** / sold_since
- **Release-Tabelle** — JOIN `import_log` × `Release` × `Artist`:
  - Cover (aktuelles `coverImage`), Artist — Title, Format, Year
  - Action-Badge (inserted/linked/updated/skipped)
  - Aktueller Preis / Verfügbarkeit / sale_mode
  - **Discogs-Link** → `discogs.com/release/{id}`
  - **Storefront-Link** → `vod-auctions.com/catalog/{slug}` (neuer Tab)
  - **Admin-Catalog-Link** → `/app/catalog?q={id}`
- **Filter:** by action, by visibility, search artist/title
- **Event-Timeline:** einklappbar, aus `import_event`
- **CSV-Export** nur dieses Runs
- **Action-Buttons:**
  - "Re-open in Review Tab" (falls Session noch existiert)
  - "Copy Run ID"
  - _(Später)_ "Bulk price adjustment for this collection"

---

## Dateien die geändert/erstellt werden

### 1. `backend/src/api/admin/discogs-import/history/route.ts` — erweitern

Aktuell liefert `GROUP BY` nur `import_log`-Aggregation. Wir joinen mit `import_session` für Source-Dateiname, Status, Settings.

```typescript
// Neue Liste-Query (ersetzt bestehendes SELECT):
SELECT
  il.run_id,
  il.collection_name,
  il.import_source,
  MIN(il.created_at) as started_at,
  MAX(il.created_at) as ended_at,
  COUNT(*)::int as total,
  COUNT(*) FILTER (WHERE il.action = 'inserted')::int as inserted,
  COUNT(*) FILTER (WHERE il.action = 'linked')::int as linked,
  COUNT(*) FILTER (WHERE il.action = 'updated')::int as updated,
  COUNT(*) FILTER (WHERE il.action = 'skipped')::int as skipped,
  s.status as session_status,
  s.id as session_id,
  s.row_count,
  s.unique_count,
  s.import_settings
FROM import_log il
LEFT JOIN import_session s ON s.run_id = il.run_id
WHERE il.import_type = 'discogs_collection'
GROUP BY il.run_id, il.collection_name, il.import_source,
         s.status, s.id, s.row_count, s.unique_count, s.import_settings
ORDER BY MIN(il.created_at) DESC
LIMIT 100
```

**Neue Stats-Query** (parallel):
```sql
SELECT
  COUNT(DISTINCT run_id)::int as total_runs,
  COUNT(*)::int as total_releases,
  COUNT(*) FILTER (WHERE action = 'inserted')::int as total_inserted,
  COUNT(*) FILTER (WHERE action = 'linked')::int as total_linked,
  MAX(created_at) as last_import_at
FROM import_log WHERE import_type = 'discogs_collection'
```

Response wird um `stats` erweitert. `active_sessions` bleibt unverändert.

### 2. `backend/src/api/admin/discogs-import/history/[runId]/route.ts` — NEU

`GET` liefert alles was die Detail-Seite braucht. Drei parallele Queries:

```typescript
// (A) Run + Session
const run = await pg.raw(`
  SELECT s.*,
    (SELECT MIN(created_at) FROM import_log WHERE run_id = s.run_id) as log_started_at,
    (SELECT MAX(created_at) FROM import_log WHERE run_id = s.run_id) as log_ended_at
  FROM import_session s WHERE s.run_id = ? LIMIT 1
`, [runId])

// (B) Releases mit aktuellem Zustand
const releases = await pg.raw(`
  SELECT
    il.id as log_id,
    il.action,
    il.discogs_id,
    il.release_id,
    il.data_snapshot,
    il.created_at as logged_at,
    r.slug,
    r.title as current_title,
    r.format,
    r.year,
    r."coverImage",
    r.legacy_price,
    r.legacy_available,
    r.sale_mode,
    r.direct_price,
    r.auction_status,
    a.name as artist_name,
    a.slug as artist_slug
  FROM import_log il
  LEFT JOIN "Release" r ON r.id = il.release_id
  LEFT JOIN "Artist" a ON a.id = r."artistId"
  WHERE il.run_id = ? AND il.import_type = 'discogs_collection'
  ORDER BY il.created_at, il.id
`, [runId])

// (C) Live-Stats
const stats = await pg.raw(`
  SELECT
    COUNT(*)::int as total,
    COUNT(*) FILTER (WHERE il.action = 'inserted')::int as inserted,
    COUNT(*) FILTER (WHERE il.action = 'linked')::int as linked,
    COUNT(*) FILTER (WHERE il.action = 'updated')::int as updated,
    COUNT(*) FILTER (WHERE il.action = 'skipped')::int as skipped,
    COUNT(*) FILTER (WHERE r."coverImage" IS NOT NULL)::int as visible_now,
    COUNT(*) FILTER (WHERE r.legacy_price > 0 AND r.legacy_available = true)::int as purchasable_now
  FROM import_log il
  LEFT JOIN "Release" r ON r.id = il.release_id
  WHERE il.run_id = ? AND il.import_type = 'discogs_collection'
`, [runId])

// (D) Events (reuse Query aus /history, Limit auf 2000)
```

**Response:** `{ run, releases, stats, events }`

### 3. `backend/src/api/admin/discogs-import/history/[runId]/export/route.ts` — NEU

`GET` streamt CSV (BOM, Excel-kompatibel):
```
Action,Discogs ID,Release ID,Slug,Artist,Title,Format,Year,Price,Available,Visible,Discogs URL,Storefront URL
```
Nutzt die gleiche Query wie der Detail-Endpoint. Content-Type `text/csv; charset=utf-8`, Content-Disposition als Download.

### 4. `backend/src/admin/routes/discogs-import/history/[runId]/page.tsx` — NEU

Dedizierte Detail-Seite. Struktur:

- `PageHeader` mit Back-Link "← Collections", Collection-Name als Titel, Datum als Subtitle
- `StatsGrid` mit 6-8 Karten: Total / Inserted / Linked / Visible now / Purchasable now / Source file
- **Filter-Bar:** Search-Input (Artist/Title), Action-Dropdown (all/inserted/linked/updated/skipped), Visibility-Checkbox "Visible only"
- **Release-Tabelle** — initial 200 Rows + "Load more" Button (kein Virtualizer, Chrome handled 5k Rows ok)
  - Sticky Header
  - Row: Cover 48×48 / Artist+Title+Format+Year / Action-Badge / Price / Visible-Dot / Links (Catalog, Admin-Catalog, Discogs)
- `ImportLiveLog` collapsible — Event Timeline
- **Action-Buttons unten:** "Export CSV" / "Copy Run ID"

**Kein `defineRouteConfig`** (Unterseite, nicht in Sidebar — siehe Governance-Regel in `CLAUDE.md`).

### 5. `backend/src/admin/routes/discogs-import/page.tsx` — History-Tab aufwerten

- Stats-Header-Karten (aus neuem `stats` im Response)
- Filter-Bar: Search-Input, Date-Range, Source-Dropdown
- Tabelle wie heute, **aber** Row-Click:
  ```typescript
  navigate(`/app/discogs-import/history/${run.run_id}`)
  ```
  (via `useNavigate` aus react-router-dom)
- `drillRun`/`drillLoading`/Modal-Code komplett entfernen (~40 Zeilen weg)

### 6. `backend/src/admin/components/discogs-import.tsx` — optional

Falls sinnvoll: `CollectionStatsHeader` als Shared-Component. Kein Muss — kann auch inline bleiben.

---

## Storefront-Link-Aufbau

| Link-Typ | URL |
|----------|-----|
| Storefront Release-Page | `https://vod-auctions.com/catalog/${slug}` |
| Admin Catalog Search | `/app/catalog?q=${release_id}` |
| Discogs External | `https://www.discogs.com/release/${discogs_id}` |

Alle drei als Icon-Links in einer Tabellenzelle der Detail-Seite.

---

## Edge Cases

| Fall | Verhalten |
|------|-----------|
| Run ohne zugehörige Session (alte Imports) | Detail-Page zeigt Basis-Info aus `import_log`, "Events not available" Hinweis |
| `release_id` ist NULL (skipped action) | Zeile ohne Cover/Price, nur Discogs-Link aktiv |
| Release wurde nach Import gelöscht | `coverImage`/`slug` sind NULL → "Deleted" Badge, Catalog-Link ausgeblendet |
| Run mit 5000+ Releases | "Load more" Button, initial 200, keine Virtualisierung |
| Stats-Query langsam | Separater async Call, Skeleton bis Stats da sind |
| Import noch am Laufen (`session.status != 'done'`) | Live-Indikator, "Re-open in Wizard" Button im Header |

---

## Out of Scope (separate Tickets)

- **Bulk-Operations auf Collections** (Price Adjustment, Re-analyze, Bulk-Delete)
- **Collection-Tagging/Renaming nach Import** — `collection_name` bleibt Import-Snapshot
- **Soft-Delete für ganze Runs** — `import_log` bleibt Audit-Trail, nie gelöscht
- **Time-Series Charts** (Imports über Zeit) — Phase 3 falls gewünscht

---

## Verifikation

### List view
1. `/app/discogs-import` → History-Tab
2. Stats-Header zeigt korrekte Totals (verify gegen `SELECT COUNT(*) FROM import_log WHERE import_type='discogs_collection'`)
3. Pargmann-Run (5653 rows) erscheint mit korrektem inserted/linked/skipped
4. Such-Filter "Pargmann" findet den Run

### Detail view
1. Click → `/app/discogs-import/history/cbce39b2...` lädt
2. Stats-Grid zeigt 3251 / 1398 / 997 / 7 / visible_now / purchasable_now
3. Erste 200 Releases laden, "Load more" Button funktioniert
4. Catalog-Link für einen Pargmann-Release öffnet Storefront korrekt
5. Admin-Link öffnet Catalog mit gefiltertem Release
6. Discogs-Link öffnet Discogs-Page
7. Action-Filter "inserted" reduziert auf genau 3251 Zeilen
8. CSV-Export lädt `{run_id}.csv` mit 5646 Zeilen, BOM vorhanden, Excel-lesbar

### Edge cases
- Skipped-Action Zeile hat korrekten "deleted"-Look
- Run ohne Session zeigt Fallback
- TypeScript: `cd backend && npx tsc --noEmit 2>&1 | grep discogs-import` leer
- Build: `cd backend && rm -rf .medusa node_modules/.vite && npx medusa build` ohne Errors

---

## Umsetzung — Schritt für Schritt

Die Umsetzung erfolgt in 6 Schritten. Jeder Schritt ist für sich abgeschlossen, deploybar und testbar. Schritte mit `Prereq:` hängen von vorherigen Schritten ab, Schritte ohne Prereq können parallel laufen.

**Testdaten für alle Schritte:** Pargmann-Run (`cbce39b2...`, 5646 Releases: 3251 inserted, 1398 linked, 997 updated, 7 skipped). Erwartete Live-Zahlen: `visible_now` ≈ 5646 (alle haben coverImage), `purchasable_now` ≈ 5646 (alle wurden mit `legacy_available=true` committed).

---

### Schritt 0 — CSV Export pro Run ✅ DONE

**Status:** Committed, noch nicht deployed
**Files:**
- `backend/src/api/admin/discogs-import/history/[runId]/export/route.ts` (NEU, ~180 Zeilen)
- `backend/src/admin/routes/discogs-import/page.tsx` (+20 Zeilen — 2 Buttons)

**Was wurde gebaut:**
- `GET /admin/discogs-import/history/:runId/export` liefert CSV mit 27 Spalten (Import-Metadaten + Excel-Snapshot + Discogs-API + Live-DB-State)
- UTF-8 BOM + Excel-kompatibel
- Filename: `{collection-slug}-{runId-8}-{date}.csv`
- 2 Entry-Points im History-Tab: CSV-Link pro Tabellenzeile + Button im Drill-Down-Modal

**Testing:**
- `curl -b cookies.txt "https://api.vod-auctions.com/admin/discogs-import/history/cbce39b2.../export" -o pargmann.csv` → 5646 Zeilen + Header
- Excel-Öffnung zeigt Umlaute korrekt (BOM)
- Discogs/Storefront-URLs klickbar

**Deploy mit Schritt 5 zusammen** (kein eigener Round-Trip auf VPS nötig).

---

### Schritt 1 — History List Endpoint erweitern

**Prereq:** keine
**Est. LoC:** +30 / -5
**Files:** `backend/src/api/admin/discogs-import/history/route.ts`

**Änderungen:**

1. **Liste erweitern** — JOIN mit `import_session` für Session-Metadaten:
   ```sql
   SELECT
     il.run_id,
     il.collection_name,
     il.import_source,
     MIN(il.created_at) as started_at,
     MAX(il.created_at) as ended_at,
     COUNT(*)::int as total,
     COUNT(*) FILTER (WHERE il.action = 'inserted')::int as inserted,
     COUNT(*) FILTER (WHERE il.action = 'linked')::int as linked,
     COUNT(*) FILTER (WHERE il.action = 'updated')::int as updated,
     COUNT(*) FILTER (WHERE il.action = 'skipped')::int as skipped,
     s.status as session_status,
     s.id as session_id,
     s.row_count,
     s.unique_count,
     s.import_settings
   FROM import_log il
   LEFT JOIN import_session s ON s.run_id = il.run_id
   WHERE il.import_type = 'discogs_collection'
   GROUP BY il.run_id, il.collection_name, il.import_source,
            s.status, s.id, s.row_count, s.unique_count, s.import_settings
   ORDER BY MIN(il.created_at) DESC
   LIMIT 100
   ```

2. **Neue Stats-Query parallel:**
   ```sql
   SELECT
     COUNT(DISTINCT run_id)::int as total_runs,
     COUNT(*)::int as total_releases,
     COUNT(*) FILTER (WHERE action = 'inserted')::int as total_inserted,
     COUNT(*) FILTER (WHERE action = 'linked')::int as total_linked,
     COUNT(*) FILTER (WHERE action = 'updated')::int as total_updated,
     MAX(created_at) as last_import_at
   FROM import_log WHERE import_type = 'discogs_collection'
   ```

3. **Bestehenden `?run_id=...` Drill-Down Mode behalten** (wird in Schritt 3 vom alten Modal noch genutzt, Schritt 4 entfernt ihn).

**Response-Shape (neu):**
```typescript
{
  stats: {
    total_runs: number,
    total_releases: number,
    total_inserted: number,
    total_linked: number,
    total_updated: number,
    last_import_at: string | null
  },
  runs: Array<{
    run_id, collection_name, import_source,
    started_at, ended_at,
    total, inserted, linked, updated, skipped,
    session_status, session_id, row_count, unique_count, import_settings
  }>,
  active_sessions: [...]  // unchanged
}
```

**Test nach Schritt 1:**
```bash
curl -b cookies.txt https://api.vod-auctions.com/admin/discogs-import/history | jq '.stats'
# → {total_runs: N, total_releases: M, ..., last_import_at: "..."}
# Sanity: total_releases == sum der row counts aller Runs
```

**Keine UI-Änderung in diesem Schritt** — nur der Endpoint. Der alte History-Tab ignoriert das neue `stats`-Feld.

---

### Schritt 2 — History Detail Endpoint (NEU)

**Prereq:** keine (parallel zu Schritt 1)
**Est. LoC:** ~120
**Files:** `backend/src/api/admin/discogs-import/history/[runId]/route.ts` (NEU)

**⚠ Route-Collision-Check:** Schritt 0 hat bereits `history/[runId]/export/route.ts` angelegt. Medusa unterstützt parallele `route.ts`- und Subfolder-Routen (verifiziert über `auction-blocks/[id]/`, `transactions/[id]/`). Kein Konflikt erwartet, aber **nach Build prüfen**: `curl /admin/discogs-import/history/TEST` darf nicht 404 werfen.

**Route:** `GET /admin/discogs-import/history/:runId`

**Drei parallele Queries:**

```typescript
// (A) Run-Metadaten + Session
const run = await pg.raw(`
  SELECT
    il.run_id,
    il.collection_name,
    il.import_source,
    (SELECT MIN(created_at) FROM import_log WHERE run_id = il.run_id) as started_at,
    (SELECT MAX(created_at) FROM import_log WHERE run_id = il.run_id) as ended_at,
    s.id as session_id,
    s.status as session_status,
    s.row_count,
    s.unique_count,
    s.format_detected,
    s.export_type,
    s.import_settings,
    s.filename
  FROM import_log il
  LEFT JOIN import_session s ON s.run_id = il.run_id
  WHERE il.run_id = ? AND il.import_type = 'discogs_collection'
  LIMIT 1
`, [runId])

// (B) Releases mit Live-Zustand (die Haupt-Tabelle der Detail-Seite)
const releases = await pg.raw(`
  SELECT
    il.id as log_id,
    il.action,
    il.discogs_id,
    il.release_id,
    il.data_snapshot,
    il.created_at as logged_at,
    r.slug,
    r.title as current_title,
    r.format,
    r.year,
    r.country,
    r."coverImage",
    r.legacy_price,
    r.legacy_available,
    r.legacy_condition,
    r.sale_mode,
    r.direct_price,
    r.auction_status,
    a.name as artist_name,
    a.slug as artist_slug,
    l.name as label_name
  FROM import_log il
  LEFT JOIN "Release" r ON r.id = il.release_id
  LEFT JOIN "Artist" a ON a.id = r."artistId"
  LEFT JOIN "Label" l ON l.id = r."labelId"
  WHERE il.run_id = ? AND il.import_type = 'discogs_collection'
  ORDER BY il.created_at, il.id
`, [runId])

// (C) Live-Stats (1 Row, aggregiert)
const stats = await pg.raw(`
  SELECT
    COUNT(*)::int as total,
    COUNT(*) FILTER (WHERE il.action = 'inserted')::int as inserted,
    COUNT(*) FILTER (WHERE il.action = 'linked')::int as linked,
    COUNT(*) FILTER (WHERE il.action = 'updated')::int as updated,
    COUNT(*) FILTER (WHERE il.action = 'skipped')::int as skipped,
    COUNT(*) FILTER (WHERE r."coverImage" IS NOT NULL)::int as visible_now,
    COUNT(*) FILTER (WHERE r.legacy_price > 0 AND r.legacy_available = true)::int as purchasable_now,
    COUNT(*) FILTER (WHERE r.legacy_available = false)::int as unavailable_now
  FROM import_log il
  LEFT JOIN "Release" r ON r.id = il.release_id
  WHERE il.run_id = ? AND il.import_type = 'discogs_collection'
`, [runId])

// (D) Event-Timeline (nur wenn session_id vorhanden)
let events: unknown[] = []
if (run.session_id) {
  const ev = await pg.raw(`
    SELECT id, phase, event_type, payload, created_at
    FROM import_event WHERE session_id = ? ORDER BY id ASC LIMIT 2000
  `, [run.session_id])
  events = ev.rows
}
```

**Response:**
```typescript
{
  run: {...},      // ein Objekt
  stats: {...},    // ein Objekt
  releases: [...], // bis zu 5646 Zeilen, OK für Pargmann
  events: [...]    // bis zu 2000 Events
}
```

**Error Handling:**
- `runId` unbekannt → 404 `{ error: "Run not found" }`
- Session fehlt (alter Import ohne Session-Link) → `run.session_id = null`, `events = []`, Detail zeigt "Events not available"

**Test nach Schritt 2:**
```bash
curl -b cookies.txt "https://api.vod-auctions.com/admin/discogs-import/history/cbce39b2..." | jq '.stats'
# → {total: 5646, inserted: 3251, linked: 1398, updated: 997, skipped: 7, visible_now: 5646, purchasable_now: 5646, unavailable_now: 0}

curl -b cookies.txt "https://api.vod-auctions.com/admin/discogs-import/history/cbce39b2..." | jq '.releases | length'
# → 5646
```

**Performance:** Query B mit 5646 JOIN-Rows ist ca. 300-500ms (akzeptabel für Detail-Load). Query C mit FILTER-COUNTS ca. 100-200ms. Query D ist index-based auf `session_id` und schnell.

---

### Schritt 3 — History-Tab List-Enhancement (UI)

**Prereq:** Schritt 1
**Est. LoC:** +80 / -20
**Files:** `backend/src/admin/routes/discogs-import/page.tsx` (History-Tab-Block)

**Änderungen:**

1. **Neuer State:**
   ```typescript
   const [historyStats, setHistoryStats] = useState<{
     total_runs: number
     total_releases: number
     total_inserted: number
     total_linked: number
     total_updated: number
     last_import_at: string | null
   } | null>(null)
   const [historySearch, setHistorySearch] = useState("")
   ```

2. **Fetch erweitern:**
   ```typescript
   .then((r) => r.json()).then((d) => {
     setHistory(d.runs || [])
     setHistoryStats(d.stats || null)
   })
   ```

3. **StatsGrid über der Tabelle** (6 Karten):
   ```typescript
   {historyStats && (
     <StatsGrid stats={[
       { label: "Total Imports", value: fmtNum(historyStats.total_runs) },
       { label: "Total Releases", value: fmtNum(historyStats.total_releases) },
       { label: "Inserted", value: fmtNum(historyStats.total_inserted), color: C.success },
       { label: "Linked", value: fmtNum(historyStats.total_linked), color: C.gold },
       { label: "Updated", value: fmtNum(historyStats.total_updated), color: C.blue },
       { label: "Last Import", value: historyStats.last_import_at ? fmtDate(historyStats.last_import_at) : "—" },
     ]} />
   )}
   ```

4. **Search-Input** (client-side Filter auf `collection_name` + `import_source`):
   ```typescript
   <Input placeholder="Search collection or file..." value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
   const filteredHistory = useMemo(() => {
     if (!historySearch.trim()) return history
     const q = historySearch.toLowerCase()
     return history?.filter((r) =>
       (r.collection_name || "").toLowerCase().includes(q) ||
       (r.import_source || "").toLowerCase().includes(q)
     ) || []
   }, [history, historySearch])
   ```

5. **Row-Click bleibt zunächst Modal** (Schritt 4 macht navigate). Damit ist Schritt 3 für sich deploybar und nicht destructive.

**Test nach Schritt 3:**
- `/app/discogs-import` → History-Tab öffnen
- Stats-Header zeigt ≥1 total_run (je nach Datenbasis)
- Search "Pargmann" reduziert Tabelle auf 1 Run
- Pargmann-Stats in Zeile: inserted=3251, linked=1398, updated=997, skipped=7
- CSV-Export pro Zeile (aus Schritt 0) funktioniert noch

---

### Schritt 4 — Detail-Seite `/history/[runId]` (UI)

**Prereq:** Schritt 2 + Schritt 3
**Est. LoC:** ~380
**Files:**
- `backend/src/admin/routes/discogs-import/history/[runId]/page.tsx` (NEU)
- `backend/src/admin/routes/discogs-import/page.tsx` (Row-Click → navigate, Modal entfernen)

**4a — Detail-Seiten-Skelett:**

```typescript
// backend/src/admin/routes/discogs-import/history/[runId]/page.tsx
// KEIN defineRouteConfig — Sub-Page, nicht in Sidebar
// useParams aus react-router-dom für runId
// useNavigate für Back-Button

const HistoryDetailPage = () => {
  useAdminNav()
  const { runId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState("")
  const [actionFilter, setActionFilter] = useState<"all" | "inserted" | "linked" | "updated" | "skipped">("all")
  const [visibleOnly, setVisibleOnly] = useState(false)
  const [visibleCount, setVisibleCount] = useState(200)
  const [eventsExpanded, setEventsExpanded] = useState(false)

  useEffect(() => {
    if (!runId) return
    fetch(`/admin/discogs-import/history/${runId}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [runId])

  const filteredReleases = useMemo(() => {
    if (!data) return []
    let rows = data.releases
    if (actionFilter !== "all") rows = rows.filter((r) => r.action === actionFilter)
    if (visibleOnly) rows = rows.filter((r) => r.coverImage != null)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter((r) =>
        (r.artist_name || "").toLowerCase().includes(q) ||
        (r.current_title || "").toLowerCase().includes(q) ||
        String(r.discogs_id || "").includes(q)
      )
    }
    return rows
  }, [data, actionFilter, visibleOnly, search])
  // ...
}
```

**Struktur:**
```
<PageShell>
  <Breadcrumbs: Operations / Discogs Import / {collection_name} />
  <PageHeader
    title={run.collection_name}
    subtitle={`${run.import_source} · ${fmtDate(run.started_at)}`}
    actions={[
      <Button onClick={copyRunId}>Copy Run ID</Button>,
      <a href={`/admin/discogs-import/history/${runId}/export`}>Export CSV</a>,
      <Button variant="ghost" onClick={() => navigate('/app/discogs-import')}>← Back</Button>
    ]}
  />

  <StatsGrid stats={8 Karten: Total / Inserted / Linked / Updated / Skipped / Visible now / Purchasable now / Unavailable now} />

  {run.import_settings && <SettingsCard>Condition, Price Markup, Inventory</SettingsCard>}

  <FilterBar>
    <Input placeholder="Search artist or title or discogs ID..." />
    <Select actionFilter />
    <Checkbox visibleOnly />
    <span>{filteredReleases.length} of {releases.length} releases</span>
  </FilterBar>

  <ReleaseTable rows={filteredReleases.slice(0, visibleCount)} />
  {filteredReleases.length > visibleCount && <button onClick={() => setVisibleCount(c => c + 200)}>Load more ({filteredReleases.length - visibleCount} remaining)</button>}

  <CollapsibleSection title="Event Timeline">
    <ImportLiveLog events={events} />
  </CollapsibleSection>
</PageShell>
```

**Release-Table Spec:**

| Col | Breite | Inhalt |
|---|---|---|
| Cover | 56px | `<img>` mit `coverImage`, Fallback "—" |
| Artist / Title | flex | 2 Zeilen: fett Artist, dünn Title |
| Meta | 180px | Format · Year · Condition |
| Action | 90px | Badge mit Farbe (inserted=green, linked=gold, updated=blue, skipped=muted) |
| Price | 80px | `€{legacy_price}` oder "—" |
| Visible | 60px | Dot-Indicator grün/grau |
| Links | 120px | 3 Icon-Links: Storefront (🌐), Admin (⚙), Discogs (D) |

**Link-Definitions:**
```typescript
const storefrontUrl = row.slug ? `https://vod-auctions.com/catalog/${row.slug}` : null
const adminCatalogUrl = `/app/catalog?q=${encodeURIComponent(row.release_id || "")}`
const discogsUrl = `https://www.discogs.com/release/${row.discogs_id}`
```

**4b — page.tsx History-Tab Cleanup:**

```typescript
// REMOVE: drillRun, drillLoading state, Modal JSX, modal close handler
// CHANGE row-click:
onClick={() => navigate(`/app/discogs-import/history/${r.run_id}`)}
// REMOVE the "View ▶" column last cell (optional — könnte als "Open →" bleiben)
```

Der bestehende CSV-Button pro Zeile (Schritt 0) bleibt unverändert.

**Test nach Schritt 4:**
1. Click auf Pargmann-Row → navigiert zu `/app/discogs-import/history/cbce39b2...`
2. Back-Button zurück zum Tab
3. Stats-Grid zeigt 8 Karten mit korrekten Werten
4. Tabelle lädt erste 200 Releases
5. "Load more" fügt weitere 200 hinzu
6. Search "Depeche" findet Depeche-Mode-Releases
7. Action-Filter "inserted" zeigt 3251 Treffer
8. Visible-Only reduziert auf Releases mit Cover
9. Link Storefront: öffnet öffentliche Catalog-Seite im neuen Tab
10. Link Admin: öffnet `/app/catalog?q=discogs-release-{discogs_id}`
11. Link Discogs: öffnet discogs.com im neuen Tab
12. Event-Timeline einklappbar
13. Copy Run ID kopiert in Clipboard

---

### Schritt 5 — Deploy + Verify + Docs

**Prereq:** Schritte 0-4
**Est. LoC:** Docs ~40

**Deploy-Sequenz:**
```bash
# Mac
git add backend/src/api/admin/discogs-import/history/ \
        backend/src/admin/routes/discogs-import/ \
        docs/architecture/DISCOGS_COLLECTIONS_OVERVIEW_PLAN.md \
        docs/architecture/CHANGELOG.md

git commit -m "Discogs Import: Collections overview + detail page with catalog deep-links + CSV export"
git push origin main

# VPS (clean build wegen neuer Admin-Route)
ssh vps
cd /root/VOD_Auctions && git pull && cd backend
rm -rf node_modules/.vite .medusa
npx medusa build
rm -rf public/admin && cp -r .medusa/server/public/admin public/admin
ln -sf /root/VOD_Auctions/backend/.env /root/VOD_Auctions/backend/.medusa/server/.env
pm2 restart vodauction-backend
pm2 logs vodauction-backend --lines 30   # verify "Server is ready"
```

**Post-Deploy Smoke Tests:**
1. `/app/discogs-import` → History-Tab → Stats-Header sichtbar
2. Pargmann-Row → Detail-Seite lädt
3. Storefront-Link eines Pargmann-Release → öffentliche Catalog-Page lädt ohne 404
4. CSV-Export eines Runs → Excel-Öffnung, Umlaute OK, Hyperlinks in Excel klickbar

**Docs-Updates:**
- `docs/architecture/CHANGELOG.md` — neuer Eintrag "2026-04-XX — Discogs Collections Overview (rc17)"
- `docs/DISCOGS_IMPORT_SERVICE.md` — neuer Abschnitt "Collections Management & Export"
- `CLAUDE.md` — API Quickref erweitern um:
  - `GET /admin/discogs-import/history/:runId` (detail)
  - `GET /admin/discogs-import/history/:runId/export` (CSV)
- Dieses File (`DISCOGS_COLLECTIONS_OVERVIEW_PLAN.md`) — Status auf "✅ Implemented & Deployed"
- GitHub Release-Notes aktualisieren (feedback_update_github_releases memory)

---

## Reihenfolge + Parallelisierung

```
Schritt 0 ✅ (done)
  ↓
Schritt 1 ──┐    (Backend List Endpoint)
Schritt 2 ──┤    (Backend Detail Endpoint)  ← können parallel
            ↓
Schritt 3 (History-Tab UI)   ← braucht Schritt 1
  ↓
Schritt 4 (Detail-Page UI)   ← braucht Schritt 2 + Schritt 3 (für Navigation-Integration)
  ↓
Schritt 5 (Deploy + Docs)
```

**Empfohlener Commit-Flow:**
- Commit A: Schritt 1 + Schritt 2 (beide Backend, kein UI-Break)
- Commit B: Schritt 3 (History-Tab mit Stats + Search, Modal bleibt)
- Commit C: Schritt 4 (Detail-Seite + Modal-Cleanup)
- Commit D: Schritt 5 (Docs + VPS-Deploy)

Nach jedem Commit TypeScript + Build lokal prüfen, erst nach Commit D auf VPS deployen.

---

## Risiken & Unknowns

| Risiko | Impact | Mitigation |
|---|---|---|
| Medusa file-routing collision zwischen `history/[runId]/route.ts` (Schritt 2) und `history/[runId]/export/route.ts` (Schritt 0) | Hoch — Detail-Endpoint könnte 404 werfen | Nach `medusa build` in Schritt 2 lokal testen: `curl localhost:9000/admin/discogs-import/history/TEST` vs `.../TEST/export`. Falls Konflikt: export in `history/[runId]-export/` umbenennen oder Query-Param nutzen. |
| Detail-Query mit 5646 JOIN-Rows zu langsam (>2s) | Medium — UX-Problem | Falls >1s: `LIMIT 500 OFFSET ?` mit serverseitiger Pagination einziehen. Fürs erste Probe-Deploy akzeptieren und messen. |
| `useNavigate` in Admin-Routes funktioniert nicht wie erwartet (Medusa nutzt eigenen Router) | Medium | Fallback: `window.location.href = '/app/...'`. In anderen Admin-Routes bereits via `useNavigate` genutzt — sollte OK sein. |
| Detail-Page wird vom Medusa-Admin-Shell nicht als "Sub-Page" erkannt (Breadcrumb-Problem) | Niedrig | Ohne `defineRouteConfig` sollte es funktionieren — wenn nicht: manuellem Back-Button reicht. |
| Alte Runs ohne `session_id` (vor rc14) | Niedrig | `LEFT JOIN` → session_id null → events leer → UI zeigt Fallback "Events not available for this run" |
| Release wurde nach Import gelöscht | Niedrig | `LEFT JOIN` → current_title/slug null → UI zeigt "Deleted" Badge, Catalog-Link ausgeblendet |

---

## Rollback-Plan

Bei Problemen nach Deploy:
1. **Nur Detail-Page kaputt:** History-Tab nutzen wie bisher. Detail-Route existiert, aber niemand klickt sie. Impact = 0.
2. **History-Tab kaputt:** `git revert {commit-B/C}` + Deploy. Export bleibt erhalten.
3. **Export kaputt:** Zeile entfernen, `git revert {commit-A}` + Deploy. Rest bleibt.
4. **Backend-Endpoint wirft 500:** Nginx-Log prüfen, rollback nur des Backend-Teils.

Alles additiv, keine Migrations, kein Data Loss möglich.

---

## Definition of Done

- [x] Schritt 0: CSV Export (GET `/history/:runId/export` + UI-Buttons)
- [x] Schritt 1: `/admin/discogs-import/history` liefert `stats` Objekt + erweiterte Run-Metadaten
- [x] Schritt 2: `/admin/discogs-import/history/:runId` liefert run+stats+releases+events
- [x] Schritt 3: History-Tab hat Stats-Header + Search, Pargmann findbar
- [x] Schritt 4: Detail-Seite lädt, alle Filter funktionieren, alle 3 Link-Typen öffnen korrekte Ziele
- [x] Schritt 5: Auf VPS deployed (commit `2a96b3e`), Server ready on port 9000, Routes antworten
- [x] CHANGELOG aktualisiert (rc17 Eintrag)
- [ ] GitHub Release-Info aktualisiert (manueller Schritt, TODO)
- [x] Dieses Dokument: Status = "Implemented & Deployed"

---

## Deploy-Sequenz (Standard)

```bash
git add backend/src/api/admin/discogs-import/history/ \
        backend/src/admin/routes/discogs-import/
git commit -m "Discogs Import: Collections overview + detail page with catalog deep-links"
git push origin main

# VPS:
ssh vps
cd /root/VOD_Auctions && git pull && cd backend
rm -rf node_modules/.vite .medusa
npx medusa build
rm -rf public/admin && cp -r .medusa/server/public/admin public/admin
ln -sf /root/VOD_Auctions/backend/.env /root/VOD_Auctions/backend/.medusa/server/.env
pm2 restart vodauction-backend
```

**Keine Migration, keine nginx-Änderung, keine neuen ENV-Variablen.**

---

## Geschätzter Umfang

| Datei | Zeilen |
|-------|--------|
| Backend History-Liste erweitert | ~30 |
| Backend Detail-Route | ~80 |
| Backend CSV-Export | ~60 |
| Admin Detail-Seite | ~350 |
| Admin History-Tab Refactor | -40 / +60 |

**Gesamt:** eine saubere Session. Additive Routes + UI, kein Refactoring von Bestands-Commit-Code.
