# Admin Catalog Performance Plan — Phase 2 Meilisearch für Admin

**Datum:** 2026-04-23
**Status:** Plan (nicht implementiert)
**Erwarteter RC:** rc48 (Implementierung + Rollout)
**Companion:** [`CATALOG_PERFORMANCE_BENCHMARK.md`](CATALOG_PERFORMANCE_BENCHMARK.md) — State-of-the-Art-Recherche, auf der dieser Plan aufsetzt.

---

## 1. Problem-Statement

Frank (und User-Feedback 2026-04-23): `/app/media` und `/app/erp/inventory/*` im Admin laden mehrere Sekunden bei Erstaufruf. Trotz mehrerer Optimierungs-Runden (btree-Indexes auf Title/Year, No-Filter-Count-Fastpath, CTE-MATERIALIZED-Pattern für Aggregationen) bleibt die Latenz bei 2–10 Sekunden pro Request, je nach Filter-Kombination.

**Messung vom Benchmark-Dokument:**
- State of the Art (Shopify Admin, Discogs, Reverb, Vercel Commerce): **p95 <500 ms**, häufig <100 ms bei cached Responses.
- VOD Storefront (seit rc40): **p95 48–58 ms** via Meilisearch.
- **VOD Admin Catalog: 2–10 s.** Architektur-Gap.

---

## 2. Root-Cause-Analyse

### 2.1 Die teure Query

`GET /admin/media` macht für jede Filter-Kombination:

```sql
SELECT Release.*, Artist.name, Label.name, Format.name,
       inventorySub.aggregated_fields..., warehouse_location.code
FROM "Release"
LEFT JOIN "Artist" ON Release.artistId = Artist.id
LEFT JOIN "Label" ON Release.labelId = Label.id
LEFT JOIN "Format" ON Release.format_id = Format.id
LEFT JOIN (
  SELECT release_id, (array_agg(...))[1] as first_item_X, COUNT(*), ...
  FROM erp_inventory_item GROUP BY release_id
) ii ON Release.id = ii.release_id
LEFT JOIN "warehouse_location" ON ii.warehouse_location_id = warehouse_location.id
WHERE ... 15+ optionale Filter ...
ORDER BY Release.title ASC
LIMIT 25 OFFSET N
```

**Rows involved:** 52.777 Release × 13.115 erp_inventory_item (aggregiert auf ~9k groups) × 12k Artist × 3k Label × 39 Format.

**Bekannte Index-Unterstützung:**
- `idx_release_title_btree` (seit rc43) — deckt ORDER BY ab
- `idx_release_search_fts` (GIN) — deckt FTS-Search ab
- `idx_erp_inventory_item_release` — deckt JOIN ab

**Was trotzdem langsam ist:**
- Die **inventorySub-Aggregation** kann PG nicht vor-berechnen — jede Request rechnet sie neu.
- **Sort + LIMIT** erfordert zuerst den JOIN für alle matching-Rows, dann Sort, dann Truncate. Bei no-filter Search: JOIN über alle 52k Release.
- **Count-Query** ist ein zweites Roundtrip (seit rc43 für den No-Filter-Fall gefast-pathed, aber mit Filtern bleibt's teuer).

### 2.2 Warum weitere Indexes nicht helfen

Indexes helfen bei:
- Filter-Prädikaten (`WHERE x = ...`) — haben wir
- Range-Scans (`ORDER BY x LIMIT N`) — haben wir
- JOINs auf indexed columns — haben wir

Indexes helfen NICHT bei:
- **Subquery-Aggregation** wie `inventorySub` — muss für jede Request laufen
- **Sort-over-JOIN-Result** wenn Sort-Column aus anderer Tabelle kommt (`ORDER BY Artist.name` → muss Release+Artist joinen vor Sort)
- **COUNT über Filtered-Join** — muss den Join materialisieren bevor gezählt werden kann

Das ist das Architektur-Thema. Postgres ist OLTP-first, unsere Admin-Catalog ist eine Read-Heavy-Analytics-Workload. Zwei verschiedene Use-Cases, einer davon falsch platziert.

### 2.3 Was state of the art ist

Siehe [`CATALOG_PERFORMANCE_BENCHMARK.md`](CATALOG_PERFORMANCE_BENCHMARK.md) §2 und §4. Kurzfassung:

- **CQRS:** Reads gehen gegen denormalisierten Read-Store (Search-Engine), Writes gegen OLTP-DB.
- Ein Release-Dokument im Search-Index hat **alle** relevanten Felder (Artist-Name, Label-Name, Format-Name, Inventory-Counts, Warehouse-Code) bereits embedded — keine Runtime-JOINs nötig.
- Search-Engine-Response: **5–50 ms p95** unabhängig von Index-Größe (sub-linear via invertierte Indexes).

---

## 3. Lösungs-Plan — Meilisearch für Admin

Wir haben Meilisearch bereits laufen (rc40). Die gesamte Infrastruktur ist da. Phase 2 nutzt sie auch für Admin.

### 3.1 Scope

**Admin-Endpoints die auf Meili migriert werden:**
- `GET /admin/media` — Haupt-Catalog-Listing
- `GET /admin/erp/inventory/search` — Inventory-Session-Suche
- `GET /admin/erp/inventory/browse` (Inventory-Hub-Tabs) — *optional, aktuell CTE-basiert und schnell genug*

**Admin-Endpoints die auf Postgres bleiben:**
- `POST /admin/media/:id` (Save) — Writes
- `GET /admin/media/:id` (Detail-Page) — O(1), Postgres-Detail-Fetch ist <200 ms akzeptabel
- Alle Mutationen (Bulk-Price, Verify, Add-Copy)

### 3.2 Meili-Index-Erweiterung

Der Index `releases-commerce` hat bereits viele Felder (siehe `scripts/meilisearch_sync.py::transform_to_doc()`). Für Admin fehlen:

| Admin-Filter | Meili-Feld | Bereits im Index? |
|---|---|---|
| Inventory-Status (`in_stock`, `out_of_stock`) | `inventory_status` | Nein (nur `in_stock` boolean) — **erweitern** |
| Price-Locked | `price_locked` | Nein — **hinzufügen** |
| Warehouse-Code | `warehouse_code` | Nein — **hinzufügen** |
| Import-Collection | `import_collections` (array, weil ein Release durch mehrere Imports kommen kann) | Nein — **hinzufügen** |
| Import-Action | `import_actions` (array) | Nein — **hinzufügen** |
| Stocktake-State (`done`, `pending`, `stale`) | `stocktake_state` (computed: MAX(last_stocktake_at) vs NOW()-90d) | Nein — **hinzufügen** |
| Estimated-Value | `estimated_value` | Nein — **hinzufügen** |
| Exemplar-Count | `exemplar_count` | Ja |
| Verified-Count | `verified_count` | Ja |
| Shop-Price / Legacy-Price | `shop_price`, `legacy_price` | Ja |
| Auction-Status | `auction_status` | Ja |

**Aktion:** `meilisearch_settings.json` erweitern um die neuen Felder in `filterableAttributes`. `scripts/meilisearch_sync.py::transform_to_doc()` erweitern um die neuen Felder zu selekten/berechnen. Full-Rebuild → neuer Index mit allen Feldern.

### 3.3 Neue Trigger-Bumps

Aktuell werden `search_indexed_at = NULL` gebumpt bei Changes an Release-Whitelist-Feldern (22 Spalten, Trigger A aus `2026-04-22_meilisearch_sync_tables.sql`). Nach §3.2 brauchen wir zusätzliche Bumps:

- **`erp_inventory_item` UPDATE** bumpt schon (Trigger C aus derselben Migration). ✅
- **`warehouse_location` Rename** — wenn jemand den Code oder Namen einer Location ändert, müssten alle Releases mit Items dort reindex'en. Edge-Case, aktuell akzeptabel ohne Trigger.
- **`import_log` INSERT** — ein neuer Import-Run touched die Items, soll das Admin-Filter "Import-Collection" sofort zeigen. **Neuer Trigger auf `import_log` AFTER INSERT** → bumpe Release.search_indexed_at.

### 3.4 Backend-Route-Umbau

**`backend/src/api/admin/media/route.ts`** wird zu einer Wrapper-Route analog `/store/catalog/route.ts`:

```typescript
export async function GET(req, res) {
  // Gate 1: feature flag
  if (!await getFeatureFlag(pg, "SEARCH_MEILI_ADMIN")) {
    return adminMediaGetPostgres(req, res)  // existing impl
  }
  // Gate 2: health
  if (!isMeiliEffective()) {
    return adminMediaGetPostgres(req, res)
  }
  // Gate 3: try Meili
  try {
    const result = await searchReleases({
      query: q.q,
      ranking: "commerce",  // wiederverwendet, oder "admin" neu
      filters: {
        format: q.format,
        category: q.category,
        has_discogs: q.has_discogs === "true",
        has_image: q.has_image === "true",
        visibility: q.visibility,
        // ADMIN-SPECIFIC:
        inventory_state: q.inventory_state,
        inventory_status: q.inventory_status,
        stocktake: q.stocktake,
        price_locked: q.price_locked,
        warehouse_location: q.warehouse_location,
        import_collection: q.import_collection,
        import_action: q.import_action,
      },
      sort: mapLegacySort(q.sort),
      page, limit,
    })
    res.json({ releases: result.hits.map(toAdminShape), count: result.estimatedTotalHits })
  } catch (err) {
    return adminMediaGetPostgres(req, res)  // fallback
  }
}
```

Die existing Postgres-Implementation wandert nach `route-postgres-fallback.ts` (Rename), bleibt unverändert als Fallback.

### 3.5 Frontend-Anpassungen

**`backend/src/admin/routes/media/page.tsx`:**
1. **Skeleton-Rows** statt "Loading…"-Text (wie `/app/erp/inventory` seit rc43).
2. **React-Query** als Data-Layer statt bare `useState + useEffect + fetch` (bringt SWR + Cache + Prefetch-APIs).
3. **Debounced Search-Input** 150 ms (aktuell 300 ms) — Meili reagiert in 20 ms, 300 ms Debounce ist unnötig konservativ.
4. **Filter-Options-Cache** — `/admin/media/filter-options` lädt bei jedem Page-Mount neu. Mit React-Query: `staleTime: 5min` → nur 1× pro Session.
5. **Prefetch der Detail-Page** — `onMouseEnter` auf Row → `queryClient.prefetchQuery(['release', id], ...)`.

### 3.6 Feature-Flag

**`SEARCH_MEILI_ADMIN`** analog `SEARCH_MEILI_CATALOG`:
- Kategorie: `search`
- Default: `false`
- Requires: `[]`
- Rollout: Deploy mit Flag OFF → Meili-Settings + Reindex → Flag ON via `/app/config` → beobachten → bei Problem Flag OFF, Admin fällt auf Postgres zurück.

### 3.7 Risiken + Mitigation

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| Meili-Rebuild dauert zu lange | niedrig (Full-Rebuild rc40 war 4 min) | niedrig | atomic swap-indexes → Prod bleibt erreichbar während Rebuild |
| Meili-Index-Lag (Admin sieht veralteten Stand) | mittel | niedrig | Delta-Cron alle 5 min, bei kritischen Admin-Changes `POST /admin/system-health/actions/refresh_sampler`-ähnlicher Action-Button "Force Reindex" möglich |
| Meili down → Admin gar nicht mehr nutzbar | niedrig (Health-Probe + Fallback) | hoch | 3-Gate-Fallback wie bei Storefront, Admin fällt auf Postgres zurück (langsam aber funktional) |
| Admin-spezifische Filter wirken nicht korrekt | mittel | mittel | Parallel-Test: Postgres-Route liefert Ground-Truth, Meili-Route muss identische Result-Sets liefern. Integration-Test in Staging vor Flag-ON. |
| Frank sieht gerade verifizierten Item nicht in "Pending"-Tab | mittel | niedrig | Erklärung: Sync läuft alle 5 min. Alternative: on-demand-reindex bei Verify-Save (Add-On in Phase 2.1). |

### 3.8 Rollback-Pfad

Trivial: `SEARCH_MEILI_ADMIN` flag OFF. Admin fällt auf bisherige Postgres-Route zurück. Kein Deploy nötig, kein Daten-Verlust.

---

## 4. Umsetzungs-Schritte (RC48)

**Tag 1:**
1. `scripts/meilisearch_settings.json` erweitern — neue filterableAttributes
2. `scripts/meilisearch_sync.py::transform_to_doc()` erweitern — neue Felder berechnen
3. `backend/scripts/migrations/<date>_admin_meili_fields.sql` — neuer Trigger auf `import_log`, ggf. andere Tabellen
4. Apply Migration via Supabase MCP
5. `python3 meilisearch_sync.py --apply-settings` (settings-only, kein Reindex nötig wenn Felder schon in docs sind)
6. `python3 meilisearch_sync.py --full-rebuild` (wenn neue Felder)

**Tag 2:**
7. `backend/src/lib/release-search-meili.ts` erweitern — `searchReleases.filters` um Admin-Filter
8. `backend/src/api/admin/media/route-postgres-fallback.ts` (Umbenennung der aktuellen `route.ts`)
9. Neue `backend/src/api/admin/media/route.ts` — 3-Gate-Wrapper
10. Feature-Flag `SEARCH_MEILI_ADMIN` registrieren
11. Lokal + VPS testen mit Flag OFF → dann ON
12. Frontend: Skeleton-Rows + React-Query + Debounce-Anpassung in `backend/src/admin/routes/media/page.tsx`

**Tag 2.5 (optional):**
13. Same-Pattern für `/admin/erp/inventory/search` — kleiner, geht schnell
14. System-Health-Check `admin_meili_latency` mit p95-Tracking

**Gesamt-Aufwand:** 1.5–2 Arbeitstage, abhängig von wie viele Admin-Filter man 1:1 in Meili-Filter-Syntax übersetzen muss (einige wie `stocktake='stale'` brauchen Meili-Filter-Ausdrücke wie `last_stocktake_timestamp < <90d-Cutoff-Unix>`).

---

## 5. Erwartete Messwerte nach Umstellung

Basiert auf der Storefront-Erfahrung (rc40):

| Metric | Vorher (Postgres) | Nachher (Meili) | Faktor |
|---|---|---|---|
| `GET /admin/media` no filter | ~1–2 s | ~30–80 ms | 20–30× |
| `GET /admin/media?search=industrial` | ~6 s (Storefront-Pattern vor rc40) | ~50 ms | 100×+ |
| `GET /admin/media` mit 5+ Filtern | ~3–5 s | ~50–100 ms | 30–50× |
| `GET /admin/erp/inventory/search?q=title` | ~200–500 ms (mit FTS) | ~30 ms | 10× |
| Count-Query (wenn Filter aktiv) | ~500 ms–2 s | inline in Meili-Response | — |

Das würde `/app/media` in den **State-of-the-Art-Bereich** bringen: p95 <100 ms End-to-End.

---

## 6. Entscheidungen die noch zu treffen sind

1. **Rollout-Zeitpunkt** — Frank arbeitet aktiv an der Inventur. Rollout am Wochenende oder in einem ruhigen Fenster ist schlauer. Rollback via Flag ist trivial, aber sichtbare Latenz-Sprünge während Franks Arbeit sind unnötig.
2. **Admin-Specific Ranking-Profile** — aktuell haben wir `releases-commerce` und `releases-discovery`. Optional: drittes Profil `releases-admin` mit Ranking nach `updated_at DESC` (Admin will "zuletzt bearbeitet" sehen, nicht "in stock + has cover"). Kann aber auch via `sort=...` parameter gelöst werden, ohne eigenes Profil.
3. **Realtime-Reindex bei kritischen Änderungen** — wenn Frank einen Preis im Admin ändert und sofort im Catalog-Listing sehen will, reicht der 5-min-Delta-Cron nicht. Option: nach PATCH `/admin/media/:id` einen on-demand-Reindex triggern (Async, kleinem In-Memory-Queue). Oder: im Admin-UI optimistic update (UI zeigt neuen Wert sofort, Meili holt nach).
4. **React-Query-Adoption ist größerer Schritt** — betrifft nicht nur `/app/media`, sondern perspektivisch alle Admin-Pages. Entscheidung: entweder "nur für `/app/media`" oder "ganzer Admin migriert langsam".

---

## 7. Nicht-Ziele

- Detail-Page-Performance (`/app/media/:id`) — anderes Thema, aktuell akzeptabel.
- Storefront-Catalog (bereits state of the art seit rc40).
- Admin-UI-Redesign — reine Perf-Phase, kein UX-Rework.
- Migration zu Algolia — Meili reicht für unsere Scale (siehe Benchmark-Doku §3).

---

## 8. Go/No-Go

**Vorgeschlagen:** Go. Storefront-Phase-1 hat bewiesen dass unsere Meili-Infrastruktur tragfähig ist (rc40 lief ohne Rollback). Die Erweiterung auf Admin ist inkrementell + rollback-trivial. ROI: Frank arbeitet täglich mit `/app/media` und `/app/erp/inventory` — die Stunden die aktuell im Warten verloren gehen summieren sich.

**Freigabe durch User:** ☐ offen

---

**Author:** Robin Seckler · rseckler@gmail.com
**Review-Status:** Draft zur Diskussion
**Dependent on:** Benchmark-Doku [`CATALOG_PERFORMANCE_BENCHMARK.md`](CATALOG_PERFORMANCE_BENCHMARK.md) (Hintergrund)
