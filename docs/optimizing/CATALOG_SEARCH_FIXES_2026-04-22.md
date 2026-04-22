# Catalog & Inventur Search/UX Fixes — 2026-04-22

**Status:** In Umsetzung (Session vom 2026-04-22 abend, nach rc38)
**Auslöser:** Frank-Bug-Report (6 Punkte, alle blocking für Stocktake-Workflow)
**Geplanter Release:** rc39 (Backend-Build + Daten-Backfill, kein Storefront-Deploy)

---

## Kontext

Heute Vormittag wurden drei Search-Endpoints (`/admin/erp/inventory/search`, `/store/catalog`, `/store/catalog/suggest`) auf Postgres-FTS migriert (Commit `67f417f`, ~20ms statt 6s). Der vierte produktive Search-Endpoint `/admin/media` wurde übersehen — Frank hat das heute Abend bemerkt, zusammen mit 5 weiteren Bugs/UX-Lücken im Inventur-Workflow.

Diese 6 Punkte werden in einem gemeinsamen Sweep gefixt, weil sie alle denselben Workflow betreffen (Frank scannt → durchsucht → ändert Preis/Conditions → erwartet Sichtbarkeit im Catalog).

---

## Die 6 Punkte

### 1) `/admin/media` Suche extrem langsam
**Symptom:** Suche dauert 5-7s. Wenn Frank Subkategorien während der laufenden Query klickt, queueen die Requests, "irgendwann" kommen Treffer.
**Root Cause:** Multi-Column-OR-ILIKE mit Leading-Wildcard auf `Release.title + Artist.name + catalogNumber + article_number`. Postgres macht Seq Scan über 52.651 Rows — die GIN-trgm-Indizes werden nicht angefasst (Anti-Pattern aus CLAUDE.md Gotchas). Die Inventur-Suche wurde heute Vormittag auf FTS migriert, `/admin/media` wurde dabei übersehen.
**Fix:** ILIKE-Block in `backend/src/api/admin/media/route.ts:115-131` ersetzen durch `buildReleaseSearchSubquery(pg, q)` aus `backend/src/lib/release-search.ts`. Barcode-Lookup (`erp_inventory_item.barcode`) bleibt als zusätzliche `whereIn`-Subquery erhalten.
**Erwartete Latenz:** 6000ms → 30ms

### 2) Sale-Mode-Default = "Direct Purchase"
**Symptom:** Im Catalog-Detail (`/app/media/:id`) ist Sale Mode immer auf "auction_only" wenn ungesetzt. Frank will als Default "direct_purchase" — passt zum Walk-in-First-Workflow.
**Root Cause:** `backend/src/admin/routes/media/[id]/page.tsx:584` hat `useState("auction_only")`, Zeile 640 fällt mit `|| "auction_only"` zurück.
**Fix:** Beide Stellen auf `"direct_purchase"` setzen. **Kein DB-Backfill** — bestehende NULL-Werte bleiben unangetastet, weil Backfill die Storefront-Sichtbarkeit ändern würde (Direct-Purchase macht Releases sofort kaufbar). Wenn Robin später Backfill will, separate Migration.

### 3) "Zuletzt bearbeitet" cap auf 10 wegnehmen
**Symptom:** Frank sieht im Stocktake-Search-Screen nur die letzten 10 bearbeiteten Items. Will mehr Kontext.
**Root Cause:** Drei Caps:
- Frontend Request `?limit=10` (`session/page.tsx:236`)
- Frontend In-Memory Slice `prev.slice(0, 9)` (Zeilen 404, 458)
- Backend `Math.min(50, ...)` (`recent-activity/route.ts:27`)
**Fix:** Backend cap auf 1000 anheben, Frontend `?limit=500` requesten, Slice rauswerfen, Render-Container mit `max-height: 600px` + `overflow-y: auto` damit die Page nicht ewig lang wird. (Echtes "infinite" ohne Virtualization bei 1000+ Rows = React-Render-Lag.)

### 4) Inventur-Daten landen nicht im Catalog
**Symptom:** Frank setzt für VOD-19589 (Notturno) im Stocktake Preis + Conditions, druckt Label. Im Catalog (`/app/media`) zeigt das Release weder Preis noch Conditions noch Inventory-Barcode.
**Root Cause:** Drei Lücken:

**(a)** `add-copy/route.ts` (wenn Release noch kein `erp_inventory_item` hat → Copy #1 wird neu erstellt): schreibt `exemplar_price` + `condition_media/sleeve` nur ins `erp_inventory_item`, **niemals nach `Release.legacy_price`/`media_condition`/`sleeve_condition`**. Catalog liest aber Release-Felder.

**(b)** `verify/route.ts` (wenn `erp_inventory_item` schon existiert): mirror'd `new_price → Release.legacy_price` für Copy #1 ✓, aber **nicht** Conditions auf `Release.media_condition/sleeve_condition`.

**(c)** `/admin/media` Liste: `inventorySub`-Aggregation in `route.ts:45-58` sammelt nicht `barcode`, `exemplar_price`, `condition_media`, `condition_sleeve` — selbst wenn die Daten da wären, würde die Liste sie nicht rendern.

**Fix:**
- `add-copy`: Bei `nextCopyNumber === 1` Mirror analog zu `verify` (innerhalb der bestehenden Transaktion).
- `verify`: Conditions-Mirror für Copy #1 ergänzen.
- `/admin/media` Liste: `inventorySub` um die fehlenden Felder erweitern, COALESCE-Pattern im SELECT (`COALESCE(ii.exemplar_price, Release.legacy_price)`) damit Altlasten ohne Mirror auch korrekt rendern.

**Backfill (einmalig nach Code-Fix):**
```sql
UPDATE "Release" r
SET legacy_price = ii.exemplar_price,
    media_condition = COALESCE(r.media_condition, ii.condition_media),
    sleeve_condition = COALESCE(r.sleeve_condition, ii.condition_sleeve)
FROM erp_inventory_item ii
WHERE ii.release_id = r.id
  AND ii.copy_number = 1
  AND ii.exemplar_price IS NOT NULL
  AND (r.legacy_price IS NULL OR r.legacy_price = 0);
```

**Sync-Schutz:** `price_locked=true` ist in beiden Endpoints schon gesetzt — `legacy_sync_v2.py` respektiert das Flag.

### 5) Stocktake-Suche cappt bei 20
**Symptom:** "Vanity music" findet ~80+ Releases, Frank sieht aber nur 20. Denkt Treffer fehlt.
**Root Cause:**
- Frontend `?limit=20` (`session/page.tsx:266`)
- Backend `Math.min(50, ...)` (`search/route.ts:22`)
**Fix:** Backend cap auf 500, Frontend `?limit=500` (oder weglassen → Default). Render-Container mit Scroll wie in Punkt 3.

### 6) Label-Spalte vor Artist
**Symptom:** Im `/app/media` Listing fehlt Label "vor Artist". Frank arbeitet labelzentriert (Industrial-Subkultur), Label gehört vorne.
**Root Cause:** Spalte existiert seit jeher, aber an Position 9 (nach Country) — visuell außerhalb des sichtbaren Tabellen-Viewports.
**Fix:** `<th>` und `<td>` für Label aus Position 9 herausziehen, vor `<th>Artist</th>` einfügen. Nur Frontend, kein Backend-Change. Sortier-Handler bleibt erhalten.

---

## Reihenfolge & Begründung

| # | Was | Files | Effort | Begründung |
|---|---|---|---|---|
| 5 | Stocktake-Suche unlimited | 2 | 10 min | Frank live im Workflow, blockiert |
| 4 | Inventur → Catalog Mirror + Liste + Backfill | 4+SQL | 30 min | Frank live im Workflow, blockiert |
| 1 | FTS in `/admin/media` | 1 | 15 min | UX-Quälerei, alle Catalog-Suchen betroffen |
| 6 | Label-Spalte vor Artist | 1 | 3 min | Trivial, while-we're-at-it |
| 3 | Recent Items Cap weg | 2 | 10 min | UX-Detail |
| 2 | Sale Mode Default | 1 | 2 min | Trivial |

**Deploy-Strategie:** Ein Backend-Build, ein Backfill-SQL via Supabase MCP. Storefront unverändert (kein Build dort).

---

## Followup nach diesen Fixes

Parallel zu dieser Session entsteht `docs/optimizing/SEARCH_MEILISEARCH_PLAN.md` — Konzept für Stufe 3 Search-Engine (Meilisearch, Self-Hosted Docker, Typo-Tolerance + Facetten + Instant-Search). Dieser Sweep hier ist Stufe-2-Polish; Meilisearch ist der Quality-Sprung für nach dem Pre-Launch.
