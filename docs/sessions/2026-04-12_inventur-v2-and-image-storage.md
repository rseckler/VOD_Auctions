# Session Log: Inventur v2 + Image Storage Refactor

**Datum:** 2026-04-12
**Autor:** Robin Seckler (mit Claude)
**Thema:** Kompletter Inventur-Workflow-Umbau (Search-First + Exemplar-Modell) + iPhone-Upload + Discogs-Bilder zu R2 migrieren
**Release:** `v1.0.0-rc28` (Inventur v2) + `v1.0.0-rc29` (Image Storage)

---

## Ausgangssituation

Am Vormittag war geplant: Frank brieft, startet die Inventur. Beim ersten Blick auf den Session-Screen (`/app/erp/inventory/session`) wurde klar dass der bisherige Queue-Driven Workflow nicht funktioniert: Das System zeigt ein Item, Frank soll es im Lager suchen. Aber Franks Lager ist **unsortiert** (mehrere Orte, keine Systematik) — für jedes angezeigte Item müsste er durch das gesamte Lager suchen.

**Robin's Aussage dazu:** "das wird so nicht klappen. Neuer Workflow muss konzipiert werden. Frank fängt an und nimmt Tonträger oder Artikel in die Hand und sucht diese im System."

## Konzept-Phase

### 1. Erster Konzept-Wurf (v1.0)

Search-First Ansatz: Frank nimmt Artikel → sucht im System → bewertet → bestätigt → Label druckt. Geschrieben nach `docs/optimizing/INVENTUR_WORKFLOW_V2_KONZEPT.md`.

### 2. Franks Antworten zu 4 offenen Fragen (W1-W4)

| # | Frage | Franks Antwort | Auswirkung |
|---|-------|----------------|------------|
| W1 | Lager-Sortierung? | "Gar nicht in der Regel oder völlig unterschiedlich. Mehrere Orte, mehrere Stellen" | Queue-Workflow endgültig verworfen |
| W2 | Zustand bewerten? | "Für alle Artikel. Bei mehreren Exemplaren für jedes einzelne. Jedes Exemplar muss einen eigenen Code und ein eigenes Label bekommen. Eineindeutigkeit." | **Exemplar-Modell** statt Quantity-Zähler |
| W3 | Menge > 1? | "Ja, aber jedes Exemplar muss eindeutig identifizierbar sein, da der Zustand sich unterscheiden kann" | `copy_number` + UNIQUE(release_id, copy_number) |
| W4 | Discogs per Klick? | "Soll mit ein-Klick übernommen werden können" | "Median übernehmen" Button |

### 3. Konzept v2.0 mit Exemplar-Modell

Fundamentale Datenmodell-Änderung: Statt 1 Row pro Release mit `quantity`-Zähler → **1 Row pro physisches Exemplar** mit eigenem Barcode, Zustand, Preis.

### 4. Kritische Impact-Analyse

Vor Implementierung: **33 Dateien geprüft** die `erp_inventory_item` referenzieren.

| Kategorie | Anzahl | Dateien |
|-----------|--------|---------|
| **Sicher** (kein Code-Change) | 10 | Storefront komplett, POS Receipt, Stats, Filter-Options, lib/inventory, Label-Druck |
| **Kritisch C1-C4** (brechen bei N Exemplaren) | 4 | admin/media/route, admin/media/[id], media-UI, export |
| **Hoch H1-H3** (Semantik-Dokumentation) | 3 | Sync price_locked, bulk-adjust, POS auction-check |

Ergebnis: Phase 0 als abwärtskompatible Regression-Fixes **VOR** Schema-Migration.

## Implementierung (4 Phasen)

### Phase 0: Regression-Fixes (~5h, abwärtskompatibel)

1. **`admin/media/route.ts`:** LEFT JOIN auf `erp_inventory_item` → Aggregat-Subquery mit `COUNT(*) FILTER (...)` → 1 Row pro Release garantiert, Pagination korrekt, Exemplar-Count als Feld
2. **`admin/media/[id]/route.ts`:** Inventory als separate Query (Array), statt `.first()` nach LEFT JOIN. Movements für alle Exemplare.
3. **`admin/routes/media/[id]/page.tsx`:** Neuer Type `InventoryItem`, Multi-Exemplar-Tabelle wenn `inventoryItems.length > 1`. Backward-compat: erstes Exemplar wird weiterhin flach auf `release` gelegt.
4. **`admin/erp/inventory/export/route.ts`:** Barcode-Spalte + stabile Sortierung.
5. H1-H3 Kommentare in `legacy_sync_v2.py`, `bulk-price-adjust`, `pos/items`.

**Commit:** `02f4081` — "Inventur v2 Phase 0: Multi-Exemplar Regression-Fixes + Workflow-Konzept"

### Phase 1: Schema + Kern-Workflow (~10h)

**Migration** `2026-04-12_erp_exemplar_model.sql`:
```sql
ALTER TABLE erp_inventory_item
  ADD COLUMN condition_media TEXT CHECK (... 'M','NM','VG+','VG','G+','G','F','P' ...),
  ADD COLUMN condition_sleeve TEXT CHECK (...),
  ADD COLUMN copy_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN exemplar_price NUMERIC(10,2);
ALTER TABLE erp_inventory_item
  ADD CONSTRAINT uq_release_copy UNIQUE (release_id, copy_number);
```

Angewandt auf Production: **13.107 bestehende Rows** alle `copy_number=1` (Default), keine Breaking Change.

**3 neue APIs:**
- `GET /admin/erp/inventory/search?q=...` — Barcode-Exact-Match (Scanner) + ILIKE Text-Suche. Sucht in **ALLEN** Releases (LEFT JOIN auf erp_inventory_item — wichtig!)
- `GET /admin/erp/inventory/release/:id/copies` — Release + alle Exemplare
- `POST /admin/erp/inventory/items/add-copy` — Neues Exemplar anlegen mit next copy_number, Barcode, Movement

**Verify-API erweitert:** Nimmt `condition_media`, `condition_sleeve`, `exemplar_price`. Movement audit-trail.

**Session-Screen komplett neu** (`backend/src/admin/routes/erp/inventory/session/page.tsx`):
- Suchfeld oben (250ms Debounce, Barcode-Auto-Open)
- Treffer-Liste mit Cover, Exemplar-Count, Verified-Badge
- Release-Detail mit Exemplar-Liste + Bewertungsformular
- Goldmine Grade-Selector (M/NM/VG+/VG/G+/G/F/P)
- Discogs "Median übernehmen" Button (D)
- Legacy-Condition Pre-Fill Mapping (m-/m- → NM/NM)
- Keyboard: / F ↑↓ Enter V A D L Esc

**Commit:** `c63f030`

### Phase 2: Dashboard (~5h)

- `GET /admin/erp/inventory/browse` — Tabs (Alle/Verifiziert/Ausstehend/Mehrere Ex.), Suche, Pagination
- Stats erweitert: `total_releases`, `additional_copies`, `avg_verified_price`, `today.*`, `format_breakdown`
- Hub-Page komplett neu: Stats-Grid, Progress-Bar, Today-Card, Format-Fortschritt (Vinyl/Tape/Print/Other), Browse-Tabelle

**Commit:** `8047b19`

### Phase 3: Fehlbestands-Check (~4h)

- `GET /admin/erp/inventory/missing-candidates` — Unverifizierte Items
- `POST /admin/erp/inventory/mark-missing-bulk` — Bulk mit Confirmation "MARK ALL MISSING" (setzt `legacy_price=0` + `price_locked=true`)
- Hub-Page: Fehlbestands-Check Card + Modal

**Commit:** `8047b19`

## Scope-Erweiterung: Alle 50.958 Releases

**Robin's Feedback:** "im moment sieht es aus, dass nur 13107 Artikel bewertet werden können. was ist mit allen anderen in der DB >50000?"

Analyse:
- Total Releases: 50.958
- Mit Bild: 42.217
- Mit Preis > 0: 13.568
- Cohort A: 13.107 (die initial ein `erp_inventory_item` bekommen haben)

**Fix:** `JOIN erp_inventory_item` → `LEFT JOIN` in Such-API. Add-Copy-API verliert Guard "existing inventory item required". Session-Screen: "NEU" Badge wenn `exemplar_count=0`, bei Klick öffnet sich direkt das Bewertungsformular. Auto-Create von Exemplar #1 bei Verify.

**Commit:** `02d2abf`

## Image Storage Refactor

### iPhone-Foto-Upload im Stocktake

**Motivation:** Robin: "Wir müssen gleich noch die Möglichkeit einbauen, Bilder direkt vom iPhone hochladen zu können. Die Bilder müssen dann aber sofort mit einem Optimierer optimiert werden."

**Lösung:**
- `POST /admin/erp/inventory/upload-image` — base64 JSON body (einfacher als Multipart für Mobile)
- `sharp`: Resize max 1200px + WebP 80%
- `@aws-sdk/client-s3` → R2 Upload (Prefix `tape-mag/uploads/`)
- Update `Image` + `Release.coverImage`
- UI: Camera-Button `📷` am Cover, bei fehlendem Bild großer Klick-Bereich. `capture="environment"` öffnet iPhone-Kamera direkt.

**Commit:** `4cb1316`

### Discogs-Hotlinks Problem

**Robin's kritische Frage:** "wie kommen denn die bilder von discogs zu r2? wieviele Bilder haben wir schon geholt über den Import Prozess?"

Analyse: **35.737 Bilder sind nicht zu R2 kopiert** — sie liegen als Hotlinks auf `i.discogs.com`. Das ist ein ToS-Risiko und CDN-Abhängigkeit.

### Migration-Script

`scripts/migrate_discogs_images_to_r2.py`:
- Download von `i.discogs.com` → Pillow Resize + WebP 80%
- R2 Upload (Prefix `tape-mag/discogs/`)
- Update `Image.url` + `Release.coverImage`
- Idempotent (WHERE url LIKE '%i.discogs.com%')
- Rate-limited 5/s (respektvolles Crawling)
- Resume-fähig via Progress-File

**Ausführung auf VPS:**
- Start: 14:00 UTC
- Ende: ~17:00 UTC (3h)
- **Migriert: 43.025 Bilder** (mehr als ursprünglich geschätzt — während der Migration kamen durch parallelen Discogs-Import ~7.300 neue Bilder dazu)
- Fehler: 0
- Skipped: 563 (HTTP 404 = auf Discogs gelöscht)
- Durchschnittliche Kompression: ~65%

### Kritisches Problem entdeckt: Bewegliches Ziel

**Robin's kritischer Blick:** "es scheint ein Problem zu geben. betrachte das mal kurz kritischer"

Analyse: Während die Migration lief, fügte der parallele Discogs-Import-Commit **neue Hotlinks** ein. Die Gesamtzahl wuchs statt zu schrumpfen. Das Script jagte ein bewegliches Ziel.

**Fix am Import-Commit** (`backend/src/api/admin/discogs-import/commit/route.ts`):
```typescript
// Vorher:
await trx.raw(`INSERT INTO "Image" (url, ...) VALUES (?, ...)`, [img.uri, ...])

// Nachher:
const useR2 = isR2Configured()
let imageUrl = img.uri
if (useR2) {
  const r2Url = await downloadOptimizeUpload(img.uri, releaseId, imageId)
  if (r2Url) imageUrl = r2Url
}
await trx.raw(`INSERT INTO "Image" (url, ...) VALUES (?, ...)`, [imageUrl, ...])
```

**Shared Library** `backend/src/lib/image-upload.ts` — `optimizeImage()`, `uploadToR2()`, `downloadOptimizeUpload()`, `isR2Configured()` (graceful fallback).

**Commit:** `31595c8`

## Finaler Status

### Deployed auf admin.vod-auctions.com

- **`/app/erp/inventory`** — Hub mit Stats (50.958 Katalog / 13.107 im Inventar), Progress-Bar, Today-Card, Format-Fortschritt, Browse-Tabelle (4 Tabs), Bulk +15% Status, Fehlbestands-Check
- **`/app/erp/inventory/session`** — Search-First Workflow mit iPhone-Upload

### Neue APIs (8)

- `GET /admin/erp/inventory/search?q=...`
- `GET /admin/erp/inventory/release/:id/copies`
- `POST /admin/erp/inventory/items/add-copy`
- `GET /admin/erp/inventory/browse?tab=...`
- `GET /admin/erp/inventory/missing-candidates`
- `POST /admin/erp/inventory/mark-missing-bulk`
- `POST /admin/erp/inventory/upload-image`
- Erweitert: `verify`, `stats`, `reset`

### Image Storage (R2)

- **43.025 Bilder zu R2 migriert** (Prefix `tape-mag/discogs/`)
- **Discogs-Import speichert direkt R2-URLs** (kein Hotlink-Zustrom mehr)
- **iPhone-Upload-Feature** im Session-Screen
- 4 tote Hotlinks verbleiben (auf Discogs 404 = gelöscht)

### Dokumentation

- `docs/optimizing/INVENTUR_WORKFLOW_V2_KONZEPT.md` v2.0 (Source of Truth)
- `docs/optimizing/INVENTUR_COHORT_A_KONZEPT.md` v3.0 (Sync-Schutz + Bulk +15% weiterhin gültig)
- `docs/architecture/CHANGELOG.md` (rc28 + rc29)
- `CLAUDE.md` (Current Focus + ERP Module Status + neue Image Storage Sektion)
- `docs/TODO.md` (Workstream 1 komplett, Meilensteine)

## Nächste Schritte

1. **Frank briefen** — Session-URL zeigen, Workflow erklären (Suche statt Queue), Goldmine-Grading, iPhone-Upload
2. **Test-Durchlauf** — 5-10 Artikel verifizieren, 1-2 als Missing markieren, neues Exemplar anlegen, Foto hochladen
3. **V5 Sync-Check nach Frank-Test** — verifizierte Preise dürfen nicht vom stündlichen Legacy-Sync überschrieben werden
4. **4-6 Wochen Inventur-Phase** — Frank arbeitet alle Artikel durch
5. **Danach: Fehlbestands-Check** — unverifizierte Items markieren

## Gelernte Lektionen

- **Fragen VOR Implementierung:** W1 (Lager-Sortierung) hätte den Queue-Workflow gar nicht erst entstehen lassen wenn vorher gefragt.
- **Impact-Analyse vor Schema-Änderung:** 33 Dateien geprüft hat 4 kritische Bugs verhindert die erst in Production sichtbar geworden wären.
- **Abwärtskompatibilität als Strategie:** Phase 0 konnte deployed werden BEVOR die Migration lief. Null Downtime, kein Risiko.
- **Bewegliche Ziele prüfen:** Die Migration-Summe (~35k) stieg auf ~43k während der Runs → paralleler Import war aktiv. Kritisches Hinterfragen vom User hat das aufgedeckt.
- **Shared Libraries:** `image-upload.ts` wurde in zwei Endpoints genutzt (Upload + Discogs-Commit). DRY spart Bugs.
