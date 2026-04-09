# Discogs Collection Import Service

## Zweck

Genereller, wiederverwendbarer Importer für Discogs Collection Exports. Wird genutzt wenn VOD Sammlungen aufkauft — Verkäufer liefern ihren Discogs-Export (CSV oder Excel), der Service parsed die Datei, zieht Detaildaten von der Discogs API, gleicht gegen die bestehende Supabase-DB ab und importiert mit vollständigem Tracking.

## Komponenten

| Komponente | Pfad | Zweck |
|-----------|------|-------|
| Python CLI | `scripts/discogs_collection_import.py` | API-Fetching, Matching, Import (Haupt-Engine) |
| Admin UI | `/app/discogs-import` (Operations Hub) | Upload, Preview, Commit über Browser |
| Upload API | `backend/src/api/admin/discogs-import/upload/` | CSV/XLSX Parsing |
| Analyze API | `backend/src/api/admin/discogs-import/analyze/` | DB-Matching |
| Commit API | `backend/src/api/admin/discogs-import/commit/` | DB-Import |
| History API | `backend/src/api/admin/discogs-import/history/` | Import-Übersicht |
| DB Snapshots | `scripts/data/db_discogs_ids.json` + `db_unlinked_releases.json` | Offline-Match-Daten |
| API Cache | `scripts/data/discogs_import_cache.json` | Gecachte Discogs-API-Responses |

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

```
Phase 1: FETCH    — Export-Datei lesen + Discogs API abfragen (rate-limited, resumable)
Phase 2: MATCH    — Gegen Supabase-DB abgleichen → EXISTING / LINKABLE / NEW / SKIPPED
Phase 3: IMPORT   — Nach Bestätigung in DB schreiben mit Tracking
```

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

## Nutzung: Python CLI

```bash
cd scripts && source venv/bin/activate

# Simulation (default) — kein DB-Write
python3 discogs_collection_import.py \
  --file ../discogs/VOD_discogs_export.xlsx \
  --collection "VOD Eigenbestand"

# Mit Markdown-Report
python3 discogs_collection_import.py \
  --file ../discogs/export.csv \
  --collection "Sammlung Müller" \
  --limit 20 \
  --report ../discogs/report.md

# Echter Import
python3 discogs_collection_import.py \
  --file ../discogs/export.xlsx \
  --collection "Sammlung Müller" \
  --commit

# Nur Cache nutzen (kein API-Fetch)
python3 discogs_collection_import.py \
  --file ../discogs/export.xlsx \
  --collection "Test" \
  --skip-fetch
```

### CLI-Optionen

| Flag | Default | Beschreibung |
|------|---------|-------------|
| `--file` | *required* | Pfad zur Export-Datei (.csv oder .xlsx) |
| `--collection` | *required* | Name der Sammlung (für Tracking) |
| `--commit` | `false` | Tatsächlich in DB schreiben |
| `--skip-fetch` | `false` | API-Cache nutzen, nicht neu fetchen |
| `--limit N` | alle | Nur erste N Einträge verarbeiten |
| `--report FILE` | — | Markdown-Report speichern |

### Performance

- **API Rate Limit:** 40 req/min (Discogs erlaubt 60, Sicherheitsmarge)
- **Dauer:** ~1 min pro 40 Releases (z.B. 2.619 IDs ≈ 66 min)
- **Resumable:** Bei Abbruch (Ctrl+C) wird Progress gespeichert, nächster Lauf setzt fort
- **Cache:** API-Responses werden in `data/discogs_import_cache.json` gespeichert

## Nutzung: Admin UI

1. **Operations Hub** → "Discogs Collection Import" Karte klicken
2. **Upload Tab:**
   - Datei (CSV/XLSX) per Dropzone hochladen
   - Collection Name eingeben (z.B. "Sammlung Müller")
   - "Upload & Parse" → Summary (Rows, Unique IDs, Format)
   - "Start Analysis" → Matching gegen DB
3. **Analysis Tab:**
   - StatsGrid: EXISTING / LINKABLE / NEW / SKIPPED
   - Collapsible Tabellen mit allen Einträgen pro Kategorie
   - Discogs-IDs verlinkt zu discogs.com
   - "Confirm Import" → DB-Write
4. **History Tab:**
   - Vergangene Imports mit Datum, Collection, Counters

### Hinweis: API-Daten

Die Admin UI nutzt **gecachte API-Daten** aus `scripts/data/discogs_import_cache.json`. Für neue Sammlungen muss zuerst das Python CLI laufen um die API-Daten zu fetchen:

```bash
# 1. Zuerst: API-Daten fetchen (dauert ~1h für 2.500 Releases)
python3 discogs_collection_import.py --file ../discogs/export.xlsx --collection "Test"

# 2. Dann: Admin UI nutzen für Preview + Commit
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
