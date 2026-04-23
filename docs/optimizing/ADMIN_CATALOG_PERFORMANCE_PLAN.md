# Admin Catalog Performance Plan — Phase 2 Meilisearch für Admin

**Datum:** 2026-04-23 (v2 — nach Review-Feedback am selben Tag)
**Status:** **Umgesetzt in rc48-rc49.1 (2026-04-23).** Alle 3 Pre-Conditions erfüllt: (0.1) Konsistenz-Klassen via `pushReleaseNow()`-Hooks in 4 Mutations, (0.2) Paritätsmatrix 28/28 grün, (0.3) Count-Semantik dokumentiert + `/admin/media/count`-Endpoint deployed. Phase-2-Scope komplett: `/admin/media` (rc48.1), `/admin/erp/inventory/browse` + `/admin/erp/inventory/search` (rc49.1). Frontend-Polish (Tag 3) noch ausstehend.
**Releases:** rc48 (Code-Rollout Flag OFF), rc48.1 (Flag ON nach Parität), rc49 (Disk-IO-Fix), rc49.1 (Inventory-Routen auf Meili).
**Companion:** [`CATALOG_PERFORMANCE_BENCHMARK.md`](CATALOG_PERFORMANCE_BENCHMARK.md) — State-of-the-Art-Recherche, auf der dieser Plan aufsetzt.

---

## 0. Pre-Conditions für Go (aus Review v2)

Drei Punkte müssen **vor** Flag-ON auf Prod adressiert sein. Nicht als spätere Kür — Teil des Minimal-Scopes.

**0.1 Konsistenz-Klassen definiert.** Jede Admin-Mutation ist explizit einer von zwei Klassen zugeordnet: (a) Browse/Search-Only, eventual consistent bis zu 5 min ok; (b) Write-triggered-Read, muss sofort sichtbar sein. Für (b) wird der konkrete Mechanismus (on-demand-Reindex + optimistic UI) pro Mutation festgelegt. Siehe §3.8.

**0.2 Filter-Paritätsmatrix liegt als Acceptance-Gate vor.** Automatisierter oder scripted Vergleich Postgres vs. Meili für jede Filter-Kombination, die das UI erzeugt. Nicht stichprobenartig. Siehe §4.A.

**0.3 Count-Semantik bewusst entschieden.** Pro UI-Element festgehalten ob `estimatedTotalHits` (Meili-Default, schneller, aber ≠ exakt) oder exakter SQL-Count nötig ist. Siehe §3.4.

Diese drei müssen vor Flag-ON grün sein. Frontend-Polish (Skeleton, React-Query, Prefetch) bleibt explizit **nachgelagert** — siehe §4.

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
    res.json({
      releases: result.hits.map(toAdminShape),
      count: result.estimatedTotalHits,            // für Pagination (ca-Angabe reicht)
      count_exact_available: "/admin/media/count", // Secondary-Endpoint on-demand
    })
  } catch (err) {
    return adminMediaGetPostgres(req, res)  // fallback
  }
}
```

Die existing Postgres-Implementation wandert nach `route-postgres-fallback.ts` (Rename), bleibt unverändert als Fallback.

**Count-Semantik — Pre-Condition 0.3:**

Meili's `estimatedTotalHits` ist **approximativ** — kann mit dem exakten SQL-Count abweichen (bei Meili 1.20 typisch ± wenige Prozent; die Zahl ist pessimistisch/konservativ obergrenzt). Für UI-Pagination ("Seite 3 von 129") völlig ausreichend, semantisch aber ≠ exakt.

Entscheidung pro UI-Element:

| UI-Element | Count-Typ | Warum |
|---|---|---|
| Pagination-Label "Seite X von Y" | `estimatedTotalHits` | User interessiert nicht ob's 1.247 oder 1.251 Treffer sind — inline in Response |
| Filter-Badge "Tapes (21.555)" | `estimatedTotalHits` aus Facet-Distribution | gleiches Argument, inline, kostenlos |
| CSV-Export "N Rows exportieren" | **exakter SQL-Count** via `GET /admin/media/count?...` | User braucht belastbare Zahl bevor 20k-Row-Export angestoßen wird |
| Bulk-Action "X Items betroffen, wirklich ausführen?" | **exakter SQL-Count** via `GET /admin/media/count?...` | gleiches — destruktive Action, muss exakt sein |
| Dashboard-Stats "52.777 releases im Katalog" | exakter SQL-Count, aber aus separater `/admin/media/stats`-Route (existiert schon) | bleibt unverändert, nicht vom Meili-Wrapper abhängig |

**Neuer Endpoint `GET /admin/media/count?...`** spiegelt die Filter-Parameter von `/admin/media` und führt nur den Count-Query aus (kein Listing). Wird von Frontend on-demand beim Öffnen von Export- oder Bulk-Action-Dialogen aufgerufen, nicht bei jedem Listing-Render. Spart den teuren Count-Roundtrip im 99%-Pfad, liefert Präzision wo sie gebraucht wird.

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

### 3.8 Konsistenz-Strategie (Pre-Condition 0.1)

Storefront ist tolerant gegenüber 0–5 min Index-Lag — Frank nicht. Wenn er einen Preis ändert, erwartet er den neuen Wert **im Moment der Rückkehr zur Listen-Ansicht**. Ebenso nach Verify/Add-Copy: das Item muss sofort im "Verifiziert"-Tab erscheinen, nicht erst nach dem nächsten Delta-Cron.

Deshalb klassifizieren wir jede Admin-Mutation in eine von zwei Konsistenz-Klassen:

| Klasse | Latenz-Budget | Mechanismus | Mutations-Beispiele |
|---|---|---|---|
| **A — Eventual** | ≤ 5 min | Bestehender Delta-Cron via `search_indexed_at = NULL`-Bump | Legacy-Sync (hourly), Discogs-Import (daily), Entity-Content-Saves, Bulk-Price-Adjustments > 1000 Rows |
| **B — Immediate** | ≤ 2 s | On-demand-Reindex **plus** optimistic UI-Update | Verify, Add-Copy, PATCH `/admin/media/:id`, Block-Item-Add/Remove, einzelne Price-Changes |

**Klasse-B-Implementierung — Two-Phase:**

1. **Phase B1: Optimistic UI** (Frontend, React-Query). Unmittelbar nach erfolgreichem Save updated die Client-Query-Cache-Entry für die betroffenen Release-IDs mit dem neuen Wert. User sieht die Änderung ohne Warten. Kommt aus dem React-Query-Pattern `queryClient.setQueryData(...)` nach Mutation-Success.

2. **Phase B2: On-demand-Reindex** (Backend). Ergänzend zum Optimistic-Update wird nach der Mutation ein synchroner Meili-Push für genau diese Release-ID gefeuert. Pattern in `backend/src/lib/meilisearch.ts::pushReleaseNow(releaseId)`:
   - Fetch dieselben Felder wie `meilisearch_sync.py::transform_to_doc` (shared SQL + JS-Transform im Backend)
   - `client.index("releases-commerce").updateDocuments([doc])` und `releases-discovery` analog
   - Fire-and-forget mit `.catch(logError)` — darf die Mutation-Response nicht blockieren
   - Bei Meili-Error: `search_indexed_at = NULL` bleibt gesetzt, Delta-Cron fängt's ab. Kein Daten-Verlust.

**Warum beides:** Optimistic UI allein reicht für die User-Interaktion, aber nicht für Cross-User-Szenarien (z.B. Frank ändert Preis, ein anderer Admin-User sieht auf seiner Catalog-Liste den alten Wert). On-demand-Reindex + normaler React-Query-Refetch bei Mount/Focus fängt diese Cross-User-Drift ab.

**Konkrete Endpoint-Klassifizierung:**

| Endpoint | Klasse | Why |
|---|---|---|
| `POST /admin/erp/inventory/items/:id/verify` | B | Frank klickt "Verifiziert"-Tab direkt nach Verify |
| `POST /admin/erp/inventory/items/add-copy` | B | Neue Copy muss in Multi-Ex.-Tab auftauchen |
| `PATCH /admin/media/:id` | B | Catalog-Detail → zurück zur Liste, Änderung muss da sein |
| `POST /admin/auction-blocks/:id/items` | B | Block-Builder zeigt Preis-Default aus `shop_price` — wenn Frank ihn gerade geändert hat, muss neuer Wert greifen |
| `POST /admin/erp/inventory/bulk-price-adjust` (+15%) | A | Betrifft tausende Rows, niemand watcht die Liste live dabei |
| `POST /admin/erp/inventory/mark-missing-bulk` | A | gleiches |
| `POST /admin/auction-blocks/:id/items/bulk-price` (rc47.3) | B | kleiner Block-Scope, UI erwartet sofortige Sichtbarkeit |
| Discogs-Import-Commit | A | Läuft async, UI pollt ohnehin |
| Legacy-Sync (cron) | A | per Definition eventual |

**Optimistic-UI-Umfang konkret:** nur Release-Felder, die im Mutation-Response enthalten sind. `shop_price`, `legacy_price`, `sale_mode`, `media_condition`, `sleeve_condition`, `exemplar_count`, `verified_count`, `warehouse_code`. Keine abgeleiteten Felder — für die sieht User kurz den Stand von vor der Mutation, bis Meili-Refetch nachzieht.

### 3.9 Rollback-Pfad

Trivial: `SEARCH_MEILI_ADMIN` flag OFF. Admin fällt auf bisherige Postgres-Route zurück. Kein Deploy nötig, kein Daten-Verlust.

---

## 4. Umsetzungs-Schritte (RC48) — Reihenfolge reflektiert Pre-Conditions

**Prinzip:** Backend-Read-Store zuerst, dann Konsistenz-Klasse-B-Mechanismen, dann Paritäts-Gate, DANN erst Flag-ON. Frontend-Polish kommt **am Ende**, nicht parallel.

**Tag 1 — Meili-Schema + Backend-Route:**
1. `scripts/meilisearch_settings.json` erweitern — neue filterableAttributes
2. `scripts/meilisearch_sync.py::transform_to_doc()` erweitern — neue Felder berechnen (inkl. abgeleitete wie `stocktake_state`)
3. `backend/scripts/migrations/<date>_admin_meili_fields.sql` — neuer Trigger auf `import_log`
4. Apply Migration via Supabase MCP
5. `python3 meilisearch_sync.py --apply-settings` + `--full-rebuild`
6. `backend/src/lib/release-search-meili.ts` erweitern — Admin-Filter-Übersetzung inkl. abgeleitete Felder
7. `backend/src/api/admin/media/route-postgres-fallback.ts` (Umbenennung)
8. Neue `backend/src/api/admin/media/route.ts` — 3-Gate-Wrapper, Flag `SEARCH_MEILI_ADMIN` **bleibt OFF**
9. Neuer Endpoint `backend/src/api/admin/media/count/route.ts` — exakter SQL-Count für Export/Bulk-Actions (§3.4)

**Tag 2 — Konsistenz-Klasse-B + Paritäts-Gate:**
10. `backend/src/lib/meilisearch.ts::pushReleaseNow(releaseId)` — Helper für on-demand-Reindex, wie in §3.8 spezifiziert
11. Write-Pfade um `pushReleaseNow()`-Call erweitern (Fire-and-forget) — Endpoints der Klasse B aus §3.8-Tabelle
12. **Paritätsmatrix-Script** ausführen (§4.A) — Acceptance-Gate
13. **Pre-Condition-Gate:** drei Punkte aus §0 verifizieren (Konsistenz-Mechanismen installiert, Paritätsmatrix grün, Count-Semantik dokumentiert)
14. Flag `SEARCH_MEILI_ADMIN` via `/app/config` ON — beobachten

**Tag 3 — Frontend-Polish (nachgelagert):**
15. `backend/src/admin/routes/media/page.tsx` — Skeleton-Rows, React-Query-Migration, Debounce 300→150 ms, Filter-Options-Cache (`staleTime: 5min`)
16. Optimistic-UI-Updates nach Mutationen (§3.8 Klasse B, Phase B1) via `queryClient.setQueryData(...)`
17. Prefetch auf Hover für Detail-Page-Navigation

**Tag 3.5 (optional, wenn Tag 1-2 gut gelaufen):**
18. Same-Pattern für `/admin/erp/inventory/search` — kleiner Scope
19. System-Health-Check `admin_meili_latency` mit p95-Tracking

**Gesamt-Aufwand:** 2–2.5 Arbeitstage (gegenüber v1: 1.5–2). Die Steigerung reflektiert Pre-Conditions (Paritätsmatrix + on-demand-Reindex-Pattern), nicht zusätzliche Features.

---

## 4.A Paritätsmatrix (Pre-Condition 0.2) — Acceptance-Gate vor Flag-ON

**Ziel:** Vor dem ersten Prod-Traffic auf Meili-Route mathematisch sicherstellen dass Postgres-Route und Meili-Route **für jede reale Filter-Kombination identische Ergebnisse liefern**. Kein Spot-Check — systematisch.

### 4.A.1 Was wird verglichen

Für jede Testzeile (= eine Filter-Kombination):
1. **Resultset-Identität** — gleiche `release.id`-Liste (erste N = 25, entspricht Pagination-Default)
2. **Count-Konvergenz** — Postgres-exakt vs. Meili-estimated. Abweichung > 1 % → Flag für manuelle Prüfung (kann legitim sein bei Meili-Approximation, aber > 5 % nie)
3. **Sort-Reihenfolge** — identische Sortierung in den ersten N bei jedem unterstützten Sort-Modus
4. **Edge-Cases** — Items die exakt an der Filter-Grenze liegen (z.B. `stocktake='stale'` → `last_stocktake_at` exakt 90 Tage alt)

### 4.A.2 Test-Matrix-Dimensionen

Kombinatorische Explosion komplett testen ist unmöglich (2^15 Filter-Kombinationen). Stattdessen strukturierte Abdeckung:

| Klasse | Inhalt | Anzahl Testfälle |
|---|---|---|
| **Single-Filter** | Jeder einzelne Filter isoliert, je Werte-Typ | ~20 |
| **Filter + Sort** | Jeder Filter × jeder Sort-Modus | ~15 × 7 = ~100 |
| **Kombinationen aus UI-Shortcuts** | Category-Filter + Format-Filter (reale UI-Kombis), Inventory-State + Stocktake-State, Import-Collection + Import-Action | ~30 |
| **Abgeleitete-Feld-Edge-Cases** | `stocktake_state` Übergänge (done/pending/stale), `inventory_state` mit/ohne Exemplare, `has_image=false` | ~15 |
| **Search + Filter** | FTS-Query + je 3 typische Filter | ~10 |
| **Empty-Result + Large-Result** | Filter-Kombination die 0 Rows liefert, Kombination die 20k+ liefert | ~5 |

Gesamt ca. **180 Testzeilen** — überschaubar, ohne kombinatorischen Overkill.

### 4.A.3 Skript-Pattern

`scripts/admin_meili_parity_check.py`:
- Liest Test-Matrix aus `scripts/data/admin_meili_parity_cases.yaml`
- Pro Fall: fetcht `/admin/media?...&_backend=postgres` (neuer Query-Param forciert Fallback) und `/admin/media?...&_backend=meili`
- Vergleicht: `ids_match`, `count_delta`, `sort_match`
- Output CSV + Summary: `✅ N passed · ⚠️ M warnings (count-delta 1-5%) · ❌ K failed`
- Exit-Code ≠ 0 bei beliebigem Fail → CI-freundlich

**Acceptance-Kriterium für Flag-ON:** 0 failed. Warnings (nur count-delta, Resultset identisch) werden manuell sichtgeprüft und entweder gefixt oder im Doc als "bewusste Toleranz" dokumentiert.

### 4.A.4 Risikozone "berechnete Felder" (Review-Punkt)

`stocktake_state`, `inventory_state`, `has_image` und ähnliche **abgeleitete** Felder sind fachlich heikel. Kleine Logikunterschiede zwischen Postgres-SQL und Python-Index-Transform → falsche Admin-Ansichten.

Extra-Härtung:
- Pro abgeleitetes Feld **dediziertes Test-File** mit ~10 Edge-Cases (nicht nur Happy-Path)
- **Referenz-Implementation** lebt in EINEM Ort (`backend/src/lib/computed-fields.ts`), wird sowohl von Postgres-Fallback-Route (über `pg.raw()` mit identischem SQL) als auch vom Meili-Sync-Python (über gespiegelte Logik + identische Konstanten wie 90-Tage-Schwelle) konsumiert. Single-Source-of-Truth-Dokumentation mit beiden Implementierungen side-by-side — damit man den Drift spätestens beim nächsten Change merkt.
- Cron-Check (täglich): re-run Paritätsmatrix gegen Prod. Alert bei neuen Abweichungen.

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

1. **Rollout-Zeitpunkt** — Frank arbeitet aktiv an der Inventur. Rollout am Wochenende oder in einem ruhigen Fenster. Rollback via Flag ist trivial, aber sichtbare Latenz-Sprünge während Franks Arbeit sind unnötig.
2. **Admin-Specific Ranking-Profile** — aktuell `releases-commerce` + `releases-discovery`. Optional: drittes Profil `releases-admin` mit Ranking nach `updated_at DESC`. Kann auch via `sort=...` parameter gelöst werden ohne eigenes Profil. **Entscheidung:** via Sort-Parameter lösen, kein drittes Profil. Spart Meili-Disk + Reindex-Zeit, identische Query-Latenz.
3. ~~Realtime-Reindex bei kritischen Änderungen~~ — **entschieden in §3.8:** on-demand-Reindex + optimistic UI ist Klasse-B-Standard, Teil des Minimalumfangs (nicht optional).
4. **React-Query-Adoption** — betrifft perspektivisch alle Admin-Pages. **Entscheidung:** in rc48 nur `/app/media` + `/app/erp/inventory/*`. Andere Admin-Pages migrieren wir wenn sich der Bedarf ergibt (nicht als Big-Bang).

**Nicht mehr offen** (Review-Feedback hat diese geklärt):
- Konsistenz-Strategie → §3.8 final
- Paritätsmatrix-Umfang → §4.A final
- Count-Semantik → §3.4 final

---

## 7. Nicht-Ziele

- Detail-Page-Performance (`/app/media/:id`) — anderes Thema, aktuell akzeptabel.
- Storefront-Catalog (bereits state of the art seit rc40).
- Admin-UI-Redesign — reine Perf-Phase, kein UX-Rework.
- Migration zu Algolia — Meili reicht für unsere Scale (siehe Benchmark-Doku §3).

---

## 8. Go/No-Go

**Status:** **Freigegeben + umgesetzt** (siehe Datei-Header). Go mit drei Pre-Conditions aus §0 — alle erfüllt.

Storefront-Phase-1 hat bewiesen dass unsere Meili-Infrastruktur tragfähig ist (rc40 lief ohne Rollback). Die Erweiterung auf Admin ist inkrementell + rollback-trivial. ROI: Frank arbeitet täglich mit `/app/media` und `/app/erp/inventory` — die Stunden die aktuell im Warten verloren gehen summieren sich.

**Review-Feedback-Bewertung (v2):**
- Richtung richtig, Nutzen hoch, Rollback-Risiko niedrig — bestätigt
- Drei Schwächen identifiziert (Konsistenz, Parität, Count-Semantik) — **alle drei jetzt Teil des Minimalumfangs**, siehe §0 Pre-Conditions + §3.4 + §3.8 + §4.A
- Frontend-Polish korrekt deprioritisiert — reflektiert in §4 Reihenfolge (Tag 3 NACH Flag-ON, nicht parallel)

**Freigabe durch User:** ☑ erteilt am 2026-04-23, Implementierung rc48→rc49.1 live.

---

**Author:** Robin Seckler · rseckler@gmail.com
**Review-Status:** Draft zur Diskussion
**Dependent on:** Benchmark-Doku [`CATALOG_PERFORMANCE_BENCHMARK.md`](CATALOG_PERFORMANCE_BENCHMARK.md) (Hintergrund)
