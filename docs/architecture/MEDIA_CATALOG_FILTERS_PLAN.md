# Media Catalog: Import + Inventory Filters

**Status:** In Progress — decisions finalized 2026-04-11

**Finalisierte Entscheidungen:**
1. ✅ Dropdown für Import Collections (nicht Chips)
2. ✅ Always-visible Filter-Zeilen (kein Collapse)
3. ✅ Tabellen-Spalten Import + Inv als Phase 2 Follow-up
4. ✅ Stocktake-Stale-Threshold = **90 Tage**
**Created:** 2026-04-11
**Author:** Robin Seckler
**Scope:** Admin `/app/catalog` Seite um zwei neue Filter-Dimensionen erweitern
**Related:** `DISCOGS_IMPORT_SERVICE.md` v5.3 (import_log Tabelle), `INVENTUR_COHORT_A_KONZEPT.md` (erp_inventory_item Tabelle)

## Motivation

Der Media Catalog `/app/catalog` hat bereits solide Filter (Search, Category, Format, Country, Year-Range, Label, Discogs-Status, Price-Status, Visibility). Aber zwei für Franks aktuelle Workflows wichtige Dimensionen fehlen:

1. **Welcher Import ein Release angefasst hat** — "zeig mir alle Releases die aus der Pargmann-Collection kommen", "welche habe ich gestern aus Frank Inventory importiert", "alle Releases wo der neueste Import der Bremer war"
2. **Inventory-Status eines Releases** — "zeig alle inventarisierte Items", "welche haben noch keinen Stocktake bekommen", "welche haben einen Barcode gedruckt aber liegen noch ohne Location rum"

Beide Daten existieren bereits in der DB (`import_log`, `erp_inventory_item`), sind aber im Catalog-Filter nicht exposed.

## Bestehende Filter (Ist-Zustand)

| Filter | Backend Param | Typ | Implementation |
|---|---|---|---|
| Search | `q` | text | ILIKE auf title/artist/catalogNumber/article_number |
| Category | `category` | dropdown | switch: tapes/vinyl/band_literature/label_literature/press_literature |
| Format | `format` | dropdown | Release.format enum |
| Year range | `year_from`, `year_to` | text | ≥/≤ auf Release.year |
| Country | `country` | text | exact match auf Release.country |
| Label | `label` | text | ILIKE auf Label.name (LEFT JOIN) |
| Auction Status | `auction_status` | dropdown | exact match auf Release.auction_status |
| Has Discogs | `has_discogs` | true/false | IS NULL/NOT NULL auf Release.discogs_id |
| Has Price | `has_price` | true/false | IS NULL/NOT NULL auf Release.discogs_lowest_price |
| Has Image | `has_image` | true/false | coverImage NULL vs !='' |
| Visibility | `visibility` | visible/hidden | coverImage + legacy_price combined |

Backend-Query ist aktuell ein Knex-Chain mit LEFT JOIN auf `Artist`, `Label`, `Format`. Count-Query wird via `.clone()` gebaut.

## Datengrundlage für die neuen Filter

### Import-Daten (`import_log`)
```sql
CREATE TABLE import_log (
  id TEXT PRIMARY KEY,
  import_type TEXT NOT NULL,       -- 'discogs_collection'
  collection_name TEXT,             -- z.B. "Pargmann", "Bremer", "Frank Inventory"
  import_source TEXT NOT NULL,      -- source filename
  run_id TEXT NOT NULL,             -- UUID
  release_id TEXT,                  -- FK auf Release.id
  discogs_id INTEGER,
  action TEXT NOT NULL,             -- inserted/linked/updated/skipped
  data_snapshot JSONB,
  created_at TIMESTAMPTZ
)
```
**Wichtige Observations:**
- Ein Release kann **mehrere** Log-Einträge haben (z.B. inserted → später updated)
- Filter muss entscheiden: "hat jemals" vs "zuletzt"
- `collection_name` ist der human-friendly Identifier, nicht run_id

### Inventory-Daten (`erp_inventory_item`)
```sql
erp_inventory_item:
  id, release_id, barcode, status, quantity, source,
  price_locked, price_locked_at,
  last_stocktake_at, last_stocktake_by, barcode_printed_at,
  warehouse_location_id, notes
```
Joined mit `warehouse_location (id, code, name)`.

**Wichtige Observations:**
- 1:1 Beziehung Release ↔ erp_inventory_item
- Nicht alle Releases haben einen inventory_item row (Cohort A sind 13.107 von 48k)
- `status` Werte vermutlich: active/sold/reserved/etc.

---

## Zielbild

### Filter 1: Import

**Drei neue Query-Parameter:**

| Param | Typ | Beschreibung |
|---|---|---|
| `import_collection` | text (dropdown) | Exact match auf `import_log.collection_name` |
| `import_action` | enum (dropdown) | inserted / linked / updated / skipped — Filter nur Releases die mit DIESER Action in DIESER Collection sind |
| `import_source_type` | enum (dropdown, optional) | `any`/`most_recent`/`first` — wenn ein Release in mehreren Imports ist, welchen betrachten wir? Default `any` (EXISTS-Semantik) |

**Backend-Implementation:**

```typescript
if (import_collection) {
  query = query.whereExists(function() {
    this.select("*")
      .from("import_log")
      .whereRaw('"import_log"."release_id" = "Release"."id"')
      .where("import_log.import_type", "discogs_collection")
      .where("import_log.collection_name", import_collection as string)
    // If import_action also set:
    if (import_action) {
      this.where("import_log.action", import_action as string)
    }
  })
}
```

**Dropdown-Datenquelle:** Neuer Endpoint `GET /admin/media/filter-options` (oder erweiterung von `/admin/media/stats`) liefert:
```json
{
  "import_collections": [
    { "name": "Pargmann", "run_count": 1, "release_count": 5646, "last_import_at": "2026-04-10T12:28:56Z" },
    { "name": "Bremer", "run_count": 1, "release_count": 966, "last_import_at": "2026-04-11T08:30:00Z" },
    { "name": "Frank Inventory", "run_count": 1, "release_count": 3762, "last_import_at": "2026-04-11T12:47:00Z" }
  ]
}
```

Abgefragt via:
```sql
SELECT collection_name,
       COUNT(DISTINCT run_id) as run_count,
       COUNT(DISTINCT release_id) as release_count,
       MAX(created_at) as last_import_at
FROM import_log
WHERE import_type = 'discogs_collection'
  AND collection_name IS NOT NULL
GROUP BY collection_name
ORDER BY MAX(created_at) DESC
```

### Filter 2: Inventory

**Fünf neue Query-Parameter:**

| Param | Typ | Beschreibung |
|---|---|---|
| `inventory_state` | enum | `any` (Release has any inventory row) / `none` (no inventory row) / `in_stock` (quantity > 0) / `out_of_stock` (quantity = 0) |
| `inventory_status` | text (dropdown) | `active`, `sold`, `reserved`, ... — `erp_inventory_item.status` |
| `stocktake` | enum | `done` (last_stocktake_at IS NOT NULL) / `pending` (NULL) / `stale` (last_stocktake_at < NOW() - 90 days) |
| `price_locked` | true/false | `erp_inventory_item.price_locked` flag |
| `warehouse_location` | text (dropdown) | `warehouse_location.code` — exact match |

**Backend-Implementation:**

```typescript
// All inventory filters use LEFT JOIN on erp_inventory_item + warehouse_location
query = query
  .leftJoin("erp_inventory_item", "Release.id", "erp_inventory_item.release_id")
  .leftJoin("warehouse_location", "erp_inventory_item.warehouse_location_id", "warehouse_location.id")

if (inventory_state === "any") {
  query = query.whereNotNull("erp_inventory_item.id")
}
if (inventory_state === "none") {
  query = query.whereNull("erp_inventory_item.id")
}
if (inventory_state === "in_stock") {
  query = query.where("erp_inventory_item.quantity", ">", 0)
}
if (inventory_state === "out_of_stock") {
  query = query.where("erp_inventory_item.quantity", "=", 0)
}

if (inventory_status) {
  query = query.where("erp_inventory_item.status", inventory_status as string)
}

if (stocktake === "done") {
  query = query.whereNotNull("erp_inventory_item.last_stocktake_at")
}
if (stocktake === "pending") {
  query = query.whereNull("erp_inventory_item.last_stocktake_at")
}
if (stocktake === "stale") {
  query = query.where("erp_inventory_item.last_stocktake_at", "<", 
    pgConnection.raw("NOW() - INTERVAL '90 days'"))
}

if (price_locked === "true") {
  query = query.where("erp_inventory_item.price_locked", true)
}
if (price_locked === "false") {
  query = query.where(function() {
    this.where("erp_inventory_item.price_locked", false)
      .orWhereNull("erp_inventory_item.price_locked")
  })
}

if (warehouse_location) {
  query = query.where("warehouse_location.code", warehouse_location as string)
}
```

**Response-Erweiterung:** Die Release-Objekte im JSON-Response kriegen zusätzliche inventory-Felder (falls joined):
```typescript
.select(
  ...
  "erp_inventory_item.quantity as inventory_quantity",
  "erp_inventory_item.status as inventory_status",
  "erp_inventory_item.price_locked",
  "erp_inventory_item.last_stocktake_at",
  "warehouse_location.code as warehouse_code",
)
```

**Dropdown-Datenquelle:** Filter-Options-Endpoint liefert:
```json
{
  "warehouse_locations": [
    { "id": "loc_01", "code": "A-01", "name": "Regal A-01" },
    ...
  ],
  "inventory_statuses": ["active", "sold", "reserved", "damaged"]
}
```

## UI/UX Konzept

### Neue Filter-Zeile(n)

Aktuell: 3 Filter-Zeilen (Categories chips, Formats chips, Dropdowns+Year+Label).

**Vorschlag:** Neue 4. Zeile mit Import + Inventory Dropdowns (eingeklappbar hinter einem "Advanced Filters" Toggle).

```
[Categories chips]
[Formats chips]
[Discogs: All ⌄] [Price: All ⌄] [Status: All ⌄] [Visibility: All ⌄] [Country: ____] 
[Year From __ to __] [Label: _____________]

┌─ Advanced Filters ──────────────────────────────────────────────────────┐
│ Import:    [All Collections ⌄]  [Any action ⌄]                         │
│ Inventory: [Any ⌄]  [Any status ⌄]  [Stocktake: All ⌄]  [Location: ⌄]  │
│            [  ] Price locked only                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

Alternativ: neue Zeile direkt sichtbar (nicht ausgeklappt), 2 Zeilen:
- **Import:** `[All Collections ⌄]` `[Any action ⌄]`
- **Inventory:** `[Any state ⌄]` `[Stocktake: All ⌄]` `[Location: ⌄]` `[☐ Price locked]`

Empfehlung: **direkt sichtbar** (kein Collapse) — die Filter sind zentral für den täglichen Workflow, Collapse würde sie verstecken.

### Chip-basierte Alternative für Import Collections

Für Collections könnte man auch Chips machen wie bei Categories/Formats:
```
Imports: [All Imports] [Pargmann (5.646)] [Bremer (966)] [Frank Inventory (3.762)] ...
```
Mit count pro Collection. Schnellerer Zugriff, aber wird unübersichtlich wenn es viele Collections gibt (>10). 

**Empfehlung:** Chips wenn ≤ 8 Collections, sonst Dropdown. Oder hybrid: Chips für "Recent" (letzte 5), Dropdown für "Alle".

### URL State

Alle Filter-Werte gehen als Query-Params in die URL damit Deep-Links funktionieren (`/app/catalog?import_collection=Pargmann&inventory_state=any`). Die Catalog-Seite nutzt bereits `useSearchParams`, muss nur erweitert werden.

### Result Display

In der Tabelle könnte man optional eine neue Spalte **"Import"** und/oder **"Inv"** einblenden, die zeigt:
- Import: Collection-Badge (z.B. kleine Pill "Pargmann" / "Bremer" / "Frank")
- Inv: Quantity-Badge + Location-Code (z.B. "3 · A-01")

Das würde den Wert des Filters sichtbar machen. Spalten sind aber optional — kann Phase 2 sein.

---

## Backend-Dateien

1. `backend/src/api/admin/media/route.ts` — GET handler erweitern um 8 neue Query-Params, LEFT JOIN auf erp_inventory_item + warehouse_location, Filter-Logik
2. `backend/src/api/admin/media/filter-options/route.ts` (**NEU**) — liefert `import_collections`, `warehouse_locations`, `inventory_statuses` für Dropdowns
3. `backend/src/admin/routes/catalog/page.tsx` — neue Filter-Zeile(n), neue State-Hooks, URL-Param-Sync

Optional Phase 2:
4. `backend/src/admin/routes/catalog/page.tsx` — neue Spalten Import + Inventory in der Release-Tabelle

## Performance-Überlegungen

- **Filter-Options-Endpoint** sollte gecacht sein (Redis o.ä., oder in-memory mit 60s TTL). Die Daten ändern sich nur bei neuen Imports — kein Hot-Path.
- **`whereExists` auf import_log** ist sehr effizient sofern `import_log.release_id` indiziert ist. Current index: `idx_import_log_release` ✅.
- **LEFT JOIN auf erp_inventory_item** hat ~13k Matches bei 48k Releases — kein Problem für Postgres.
- **LEFT JOIN auf warehouse_location** ist klein (<100 Rows), vernachlässigbar.
- **Count-Query** bleibt wie heute (`.clone()`), inkl. aller JOINs und WHERE-Clauses.

## Edge Cases

| Fall | Verhalten |
|---|---|
| Release wurde mehrfach importiert (z.B. insert + update) | `whereExists` matched wenn IRGENDEINE Row die Filter erfüllt → EXISTS-Semantik. Kein Problem. |
| Release hat kein `inventory_item` aber User filtered `inventory_state=any` | LEFT JOIN + `whereNotNull(erp_inventory_item.id)` → Release wird ausgeschlossen. Korrekt. |
| User kombiniert `import_collection=Bremer` + `inventory_state=in_stock` | Beide Filter als AND — Release muss BEIDE erfüllen. Gewünschtes Verhalten. |
| Dropdown-Optionen sind leer (keine Imports, keine Locations) | Dropdown zeigt nur "All" — kein Crash |
| `stocktake=stale` auf Release ohne inventory_item | LEFT JOIN + `< NOW() - 90d` — NULL Vergleiche sind false, Release wird ausgeschlossen. Gewünscht (kein inventory_item → nicht stale im Sinne der Inventur). |
| Collection-Name mit Sonderzeichen (Umlaut, Whitespace) | URL-encoded, Backend decoded. Standardbehandlung. |
| Zwei Collections mit gleichem Namen (z.B. "Pargmann" zweimal importiert) | Backend-Query ist `WHERE collection_name = ?` → matched beide. Für strengere Unterscheidung bräuchte man `run_id`-Filter. Für MVP akzeptabel. |

## Verifikation

1. **Import Filter:**
   - `/app/catalog?import_collection=Pargmann` → 5.646 Releases (Pargmann-Size)
   - `/app/catalog?import_collection=Pargmann&import_action=linked` → nur linkable subset (~1.398)
   - Dropdown zeigt alle 3+ Collections mit Counts

2. **Inventory Filter:**
   - `/app/catalog?inventory_state=any` → ~13.107 Releases (Cohort A Size)
   - `/app/catalog?inventory_state=none` → ~35k Releases (48k - 13k)
   - `/app/catalog?stocktake=pending` → alle Cohort A Items ohne last_stocktake_at
   - `/app/catalog?warehouse_location=A-01` → nur Releases in Location A-01
   - `/app/catalog?price_locked=true` → nur locked items

3. **Kombinationen:**
   - `?import_collection=Pargmann&stocktake=done` → Pargmann-Releases die schon inventarisiert sind
   - `?inventory_state=any&import_collection=Bremer` → beide Bedingungen AND

4. **Count-Query Konsistenz:**
   - Anzahl in der Stat-Card oben muss mit der gefilterten Tabellen-Anzahl unten übereinstimmen

5. **URL-State:**
   - Filter setzen → URL enthält Params → Browser-Refresh → Filter bleibt aktiv
   - Browser Back/Forward funktioniert

## Implementierung in Schritten

| # | Was | Prereq | Est. LoC |
|---|---|---|---|
| 1 | Backend: `GET /admin/media/filter-options` (neu) | — | ~60 |
| 2 | Backend: `/admin/media` um `import_*` Filter erweitern | — | ~40 |
| 3 | Backend: `/admin/media` um `inventory_*`/`stocktake`/`price_locked`/`warehouse_location` erweitern + LEFT JOIN + neue SELECT-Felder | — | ~80 |
| 4 | Frontend: Filter-Options fetch + state + dropdowns in page.tsx | 1 | ~100 |
| 5 | Frontend: URL-Param-Sync erweitern (neue params in useSearchParams) | 4 | ~20 |
| 6 | Frontend (optional Phase 2): Neue Tabellen-Spalten Import + Inv | 3,4 | ~60 |
| 7 | Verifikation + Deploy + Docs-Update | alle | — |

**Total:** ~300-360 LoC für Phase 1 (ohne Tabellen-Spalten). Eine saubere Session.

**Commit-Strategie:**
- Commit A: Backend (Schritte 1-3, keine UI-Änderung, non-breaking)
- Commit B: Frontend (Schritte 4-5)
- Commit C (optional): Tabellen-Spalten

## Out of Scope (separate Tickets)

- **Bulk-Operations auf gefilterten Ergebnissen** (z.B. "alle gefilterten als Draft setzen", "Bulk-Price-Update für alle Pargmann-Items")
- **Saved Filter Presets** ("Meine Filter" wie in Linear)
- **Filter-Kombinationen als URL-Shortcuts** ("/app/catalog/pending-stocktake" → vordefinierter Filter)
- **Export der gefilterten Ergebnisse als CSV** — die existierende `/admin/media/export` Route würde die Filter mitnehmen, aber das ist ein separates Ticket
- **Server-Side Caching von Filter-Options** — Redis-Integration ist Phase 2
- **Advanced Filter Builder** (AND/OR Logic, Nested Groups) — Over-engineered für jetzt

## Definition of Done

- [ ] Schritt 1: `/admin/media/filter-options` liefert `import_collections` + `warehouse_locations` + `inventory_statuses`
- [ ] Schritt 2: `/admin/media?import_collection=X` filtert korrekt
- [ ] Schritt 3: `/admin/media?inventory_state=X` + Kombinationen filtern korrekt
- [ ] Schritt 4: Filter-Dropdowns im Catalog sichtbar + funktional
- [ ] Schritt 5: URL-State behält Filter über Refresh
- [ ] Verifikations-Cases 1-5 grün
- [ ] CHANGELOG + dieses Dokument als "Implemented" markiert
- [ ] GitHub Release Notes (optional, je nach Deploy-Bündelung)

---

## Offene Entscheidungen (brauche User-Input)

1. **Chips vs Dropdown für Import Collections?** Empfehlung: Dropdown wenn >8 Collections, Chips sonst. Frank-Feedback welche UX er bevorzugt.
2. **Collapse vs Always-Visible für die neuen Filter?** Empfehlung: Always-Visible (zentral für Workflow). Wenn UI zu crowded wird, dann Collapse unter "Advanced Filters" Toggle.
3. **Tabellen-Spalten Import + Inv als Phase 1 oder Phase 2?** Empfehlung: Phase 2 — Filter funktionieren auch ohne neue Spalten, der User sieht das Filter-Ergebnis in der bestehenden Tabelle. Neue Spalten können nachgeschoben werden.
4. **Stocktake "stale" Threshold?** 90 Tage als Default — könnte aber auch 30/60/180 sein je nach Inventur-Rhythmus. Config in `site_config`?
