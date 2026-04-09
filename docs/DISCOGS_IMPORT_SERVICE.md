# Discogs Collection Import Service

**Version:** 3.0
**Datum:** 2026-04-09
**Status:** Live — Kompletter Workflow über Admin UI

## Zweck

Genereller, wiederverwendbarer Importer für Discogs Collection Exports. Wird genutzt wenn VOD Sammlungen aufkauft — Verkäufer liefern ihren Discogs-Export (CSV oder Excel), der Service parsed die Datei, zieht Detaildaten von der Discogs API, gleicht gegen die bestehende Supabase-DB ab und importiert mit vollständigem Tracking.

**Der gesamte Workflow läuft über die Admin UI** — kein Terminal/SSH nötig.

## Komponenten

| Komponente | Pfad | Status | Zweck |
|-----------|------|--------|-------|
| Admin UI | `/app/discogs-import` (Operations Hub) | **Live** | Upload, Fetch, Analyse, Review, Import — kompletter Workflow |
| Upload API | `backend/src/api/admin/discogs-import/upload/` | **Live** | CSV/XLSX Parsing (Collection + Inventory Formate) |
| Fetch API | `backend/src/api/admin/discogs-import/fetch/` | **Live** | Discogs API Fetch mit SSE Live-Progress |
| Analyze API | `backend/src/api/admin/discogs-import/analyze/` | **Live** | DB-Matching gegen Snapshots |
| Commit API | `backend/src/api/admin/discogs-import/commit/` | **Live** | DB-Import mit SSE Live-Progress |
| History API | `backend/src/api/admin/discogs-import/history/` | **Live** | Import-Übersicht aus `import_log` |
| Python CLI | `scripts/discogs_collection_import.py` | **Backup** | CLI-Alternative (nicht für Normalbetrieb) |
| DB Snapshots | `scripts/data/db_discogs_ids.json` + `db_unlinked_releases.json` | **Live** | Offline-Match-Daten |
| API Cache | `scripts/data/discogs_import_cache.json` | **Live** | Gecachte Discogs-API-Responses |

## Unterstützte Export-Formate

### CSV (Standard-Discogs-Export)
```
Catalog#,Artist,Title,Label,Format,Rating,Released,release_id,CollectionFolder,Date Added
TAP 1,The Distributors,T.V. Me / Wireless,? Records ?,7",",1979,955745,Uncategorized,2009-12-13 23:51:52
```
**Quelle:** Discogs → Collection → Export → CSV

### Excel (Custom Export, kein Header)
```
| Artist | Title | CatalogNumber | Label | Format | Condition(2-5) | Year | DiscogsID |
```
**Quelle:** Manuell aus Discogs-Daten erstellt

## Workflow

### 3-Phasen-Ablauf

### Kompletter Workflow (4 Schritte, alle in Admin UI)

```
Schritt 1: UPLOAD       — Export-Datei hochladen + parsen
                          Admin UI → "Upload & Parse"
                          Ergebnis: Row Count, Unique IDs, Format, Sample

Schritt 2: FETCH        — Discogs API für jede Release abfragen        ← Live
                          Admin UI → "Fetch Discogs Data" (SSE Live-Progress)
                          Holt: Bilder, Tracklist, Credits, Genres, Styles, Preise/Condition
                          ~130 min für 2.619 Releases (2 API-Calls pro Release, 40 req/min)
                          Resumable: überspringt bereits gecachte Releases
                          Ergebnis: Voller API-Cache

Schritt 3: ANALYSE      — Gegen DB abgleichen + Preview
                          Admin UI → "Start Analysis"  
                          Matching: Exact (discogs_id) → Fuzzy (Artist+Title+CatNo) → New
                          Ergebnis: EXISTING / LINKABLE / NEW / SKIPPED mit Detail-Preview

Schritt 4: IMPORT       — Nach Admin-Freigabe in DB schreiben
                          Admin UI → Review (Checkboxen, Detail-Preview) → "Approve & Import"
                          SSE Live-Progress (aktueller Artikel, Fortschrittsbalken)
                          Ergebnis: Releases in DB + import_log Tracking
```

### Schritt 2 Detail: Discogs API Fetch

Neue API Route `POST /admin/discogs-import/fetch` mit SSE:

**Für jede `discogs_id` werden 2 API-Calls gemacht:**
1. `GET /releases/{id}` → Title, Year, Country, Artists, Labels, Formats, Tracklist, Genres, Styles, Images, Notes, Community, lowest_price
2. `GET /marketplace/price_suggestions/{id}` → Preise pro Condition (M, NM, VG+, VG, G+, G, F, P)

**Rate Limit:** 40 req/min (Discogs erlaubt 60, Sicherheitsmarge)
**Dauer:** ~1,5 Sekunden pro Release (2 Calls + Rate Limit Wait) → ~65 min pro 2.619 Releases
**Cache:** `scripts/data/discogs_import_cache.json` — gleiche Datei die Analyse + Python nutzen
**Resumable:** Releases die schon im Cache sind werden übersprungen
**SSE Events:** `{ type: "progress", current: 42, total: 2619, artist: "39 Clocks", title: "Pain It Dark" }`

**Admin UI Darstellung:**
```
┌─────────────────────────────────────────────────────────┐
│ Step 2: Fetch Discogs Data                              │
│                                                         │
│ 2.619 releases to fetch (20 already cached)             │
│ Estimated time: ~128 minutes                            │
│                                                         │
│ [Fetch Discogs Data]    [Skip → Use cached only]        │
│                                                         │
│ 39 Clocks — Pain It Dark                                │
│ [████████░░░░░░░░░░░░░░] 42 / 2619 (1.6%)              │
│ ~125 min remaining                                      │
└─────────────────────────────────────────────────────────┘
```

**"Skip → Use cached only"** für den Fall dass der Cache schon von einem früheren Import existiert.

### Matching-Strategie (3-stufig)

1. **EXISTING** — `discogs_id` bereits in `Release.discogs_id` vorhanden
   → Aktion: Preise + Community-Daten updaten
2. **LINKABLE** — Artist + Title + CatalogNumber matcht einen Release ohne discogs_id
   → Aktion: `discogs_id` + Preise auf bestehendem Release setzen
3. **NEW** — Kein Match gefunden
   → Aktion: Voller Import (Release + Artist + Label + Tracks + ReleaseArtist)

### Import-Tracking

Jeder Import-Lauf wird in der `import_log` Tabelle protokolliert:

| Feld | Beschreibung |
|------|-------------|
| `run_id` | UUID pro Import-Lauf |
| `collection_name` | z.B. "Sammlung Müller" |
| `import_source` | Dateiname des Exports |
| `release_id` | FK zur importierten Release |
| `discogs_id` | Discogs Release ID |
| `action` | `inserted` / `linked` / `updated` / `skipped` |
| `data_snapshot` | JSONB mit Excel-Row + API-Summary |

→ Nachvollziehbar: "Diese 621 Releases kamen am 09.04.2026 aus Sammlung Müller."

## Nutzung: Admin UI (Primär)

Der komplette Workflow läuft über die Admin UI unter `admin.vod-auctions.com/app/discogs-import`:

### Schritt 1: Upload & Parse
1. Operations Hub → "Discogs Collection Import"
2. Datei (CSV/XLSX) per Dropzone hochladen
3. Collection Name eingeben (z.B. "Sammlung Müller")
4. "Upload & Parse" → Summary: Row Count, Unique IDs, Format

### Schritt 2: Fetch Discogs Data (Live)
5. "Fetch Discogs Data" → SSE Live-Progress (aktueller Artikel, Fortschrittsbalken, ETA)
6. Holt für jede Release: Bilder, Tracklist, Credits, Genres, Preise pro Condition
7. ~130 min für 2.619 Releases, resumable, überspringt gecachte Releases
8. Alternative: "Skip → Use cached only" wenn Cache von früherem Import existiert

### Schritt 3: Analyse & Preview
9. "Start Analysis" → Matching gegen DB: EXISTING / LINKABLE / NEW / SKIPPED
10. Detail-Preview pro Release: Cover, Tracklist, Credits, Genres, Preise, Labels
11. Checkboxen zur Auswahl (Default: alle ON)

### Schritt 4: Import Settings & Approve
12. Condition Dropdown (Default: VG+/VG+)
13. Inventory Toggle (Default: ON = Stock 1)
14. Price Markup (Default: VG+ × 1.2)
15. "Approve & Import" → SSE Live-Progress → Releases in DB

### History Tab
- Vergangene Imports mit Datum, Collection, Counters (Inserted/Linked/Updated/Skipped)

### Performance
- **API Fetch:** 40 req/min, 2 Calls pro Release → ~20 Releases/min → ~130 min für 2.619
- **Resumable:** gecachte Releases werden übersprungen
- **Cache:** `scripts/data/discogs_import_cache.json`

## Nutzung: Python CLI (Backup)

Das Python CLI Script ist die Backup-Alternative falls die Admin UI nicht nutzbar ist:

```bash
cd scripts && source venv/bin/activate
python3 discogs_collection_import.py --file ../discogs/export.xlsx --collection "Sammlung Müller"          # Simulation
python3 discogs_collection_import.py --file ../discogs/export.xlsx --collection "Sammlung Müller" --commit  # Import
```

## DB-Snapshots aktualisieren

Die Matching-Phase nutzt lokale JSON-Snapshots der DB (nicht Live-Queries). Diese müssen aktualisiert werden wenn sich die DB signifikant ändert:

```bash
# Via Supabase MCP oder SQL:
# 1. db_discogs_ids.json: SELECT id, discogs_id FROM "Release" WHERE discogs_id IS NOT NULL
# 2. db_unlinked_releases.json: SELECT r.id, r.title, r."catalogNumber", a.name FROM "Release" r LEFT JOIN "Artist" a ...
```

## IDs für neue Einträge

| Typ | ID-Format | Beispiel |
|-----|----------|---------|
| Release | `discogs-release-{discogs_id}` | `discogs-release-1104999` |
| Artist | `discogs-artist-{discogs_artist_id}` | `discogs-artist-56789` |
| Label | `discogs-label-{discogs_label_id}` | `discogs-label-12345` |
| Track | `dt-{discogs_id}-{position}` | `dt-1104999-A1` |
| Import Log | `ilog-{run_id_prefix}-{discogs_id}` | `ilog-a1b2c3d4-1104999` |

Konsistent mit bestehendem `legacy-release-{id}` Pattern.

## Discogs API

- **Endpoint:** `GET /releases/{id}` (volle Release-Daten)
- **Auth:** Token-basiert (in `scripts/shared.py`)
- **Rate Limit:** 60 req/min authenticated, Script nutzt 40 req/min
- **Retry:** Exponential Backoff bei 429 (Rate Limit Exceeded)
- **Extrahierte Felder:** title, year, country, artists, labels, formats, tracklist, genres, styles, community (have/want), lowest_price, num_for_sale, images

## Dateien

```
scripts/
  discogs_collection_import.py      # Haupt-CLI-Script
  shared.py                         # DB-Connection, RateLimiter, Discogs-Headers
  data/
    discogs_import_cache.json       # API-Response Cache (auto-generiert)
    discogs_import_progress.json    # Resumable Progress (auto-generiert)
    db_discogs_ids.json             # DB-Snapshot: discogs_id → release_id
    db_unlinked_releases.json       # DB-Snapshot: Releases ohne discogs_id

discogs/
  VOD_discogs_export.xlsx           # Eigener Export (Testdaten)
  Waschsalon-Berlin-collection-*.csv # Beispiel: Fremder Export
  import_test_report.md             # Test-Report (Simulation)

backend/src/
  admin/routes/discogs-import/page.tsx          # Admin Page (3 Tabs)
  api/admin/discogs-import/
    upload/route.ts                              # File Upload + Parse
    analyze/route.ts                             # DB Matching
    commit/route.ts                              # DB Import
    history/route.ts                             # Import History
```
