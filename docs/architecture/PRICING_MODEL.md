# Pricing Model — Single Source of Truth

**Status:** Live seit rc47.2 (2026-04-23), Phase 2 Auction-Start-Preis live seit rc47.3 (2026-04-23)
**Scope:** Gesamtsystem (Storefront, Admin, Auction-Flow, Label-Pipeline, Meili-Index)

## Begriffe

| Begriff | Bedeutung |
|---|---|
| **Shop Price** | Der Preis, zu dem ein Item im Shop (Direct-Sale) angeboten wird. Setzt Frank im Inventory Process (Verify/Add-Copy). **Die einzige kanonische Preisangabe.** |
| **Legacy Price** | Rein historischer Preis aus der tape-mag MySQL-Datenbank. Wird über `legacy_sync_v2.py` stündlich gespiegelt. **Kein Shop-Preis — nur Info.** |
| **Discogs Lowest / Median / Highest** | Marktpreisindikation aus Discogs. **Kein Shop-Preis — nur Referenz.** |
| **Exemplar Price** | Der pro-Exemplar-Preis. Wichtig bei Multi-Copy (Frank besitzt zwei Stücke mit unterschiedlichem Zustand / unterschiedlichem Preis). Der Druck von Barcode-Labels liest diesen Wert zuerst. |

## Wahrheits-Hierarchie der Preise

```
Storefront anzeigen/verkaufen:
    effective_price = shop_price
                      ──────────
                      NIE mehr Fallback auf legacy_price

Label-Druck (Barcode):
    COALESCE(exemplar_price, shop_price, legacy_price)
             ──────────────              ────────────
             Authoritative für           Letzter Notfall-
             Multi-Copy                  Fallback wenn
                                         weder Shop- noch
                                         Exemplar-Preis
                                         je gesetzt waren
                                         (historisch)

Auction-Start-Preis (rc47.3):
    block_item.start_price = round(base × default_start_price_percent / 100)
    wobei base = shop_price > 0 ? shop_price
                 : estimated_value > 0 ? estimated_value
                 : legacy_price > 0 ? legacy_price
                 : 400 Fehler
```

## DB-Spalten

| Spalte | Schreibt | Liest |
|---|---|---|
| `Release.shop_price` | `POST /admin/erp/inventory/items/:id/verify`<br>`POST /admin/erp/inventory/items/add-copy` (Copy #1)<br>`PATCH /admin/media/:id` | Storefront, Admin-Detail, `enrichWithShopPrice()`, Meili |
| `Release.legacy_price` | `legacy_sync_v2.py` cron (wenn `price_locked=false`)<br>Verify/Add-Copy (defensiver Mirror, damit Legacy-Leser nicht brechen) | Admin-Detail als Info, Label-Pipeline als letzter Fallback |
| `Release.discogs_lowest_price` etc. | `discogs_daily_sync.py` cron | Admin-Detail als Info |
| `erp_inventory_item.exemplar_price` | Verify, Add-Copy, Bulk-Price-Adjust | Label-Pipeline (primär), Admin-Listing (`effective_price` COALESCE) |

**Invariante:** nach einem erfolgreichen Verify gilt:
```
Release.shop_price == Release.legacy_price == erp_inventory_item.exemplar_price
```
(für Copy #1. Multi-Copy hat eigene `exemplar_price` pro Stück.)

## Sale Mode

Spalte `Release.sale_mode ∈ {'auction_only', 'direct_purchase', 'both'}`.

| Default | Wann gesetzt |
|---|---|
| `NULL` oder `auction_only` | Discogs-Import-Commit (historisch) |
| `both` | **Nach erstem Verify** (automatisch) — wenn vorher NULL oder `auction_only`. Das bedeutet: "verkaufbar direkt + darf in Auction" |
| `direct_purchase` / `both` | Bleibt unverändert, wenn Frank explizit gewählt hat (Verify überschreibt nie) |

Validierung in `PATCH /admin/media/:id`: Wenn `sale_mode ≠ 'auction_only'`, muss `shop_price > 0` sein.

## Shop-Visibility-Gate

Gesteuert durch **`site_config.catalog_visibility`** (Admin-Toggle unter **Catalog → Storefront Catalog Visibility**):

| Wert | Verhalten |
|---|---|
| `'visible'` (Default) | Shop zeigt **nur Items mit shop_price > 0 UND mindestens einem verifizierten Exemplar** (`erp_inventory_item.last_stocktake_at IS NOT NULL AND price_locked=true`). Diese erscheinen mit Preis-Tag + Add-to-Cart. |
| `'all'` | Zusätzlich: Items ohne shop_price / ohne verifiziertes Exemplar werden angezeigt — **ohne Preis-Tag, ohne Add-to-Cart**. Auction-Bid-Button bleibt aktiv (Auction-Status davon unabhängig). |

**Wichtig:** Der URL-Param `for_sale=true` forciert die `'visible'`-Semantik unabhängig vom Toggle (für "zum Verkauf"-Deep-Links).

Implementierung:
- **Storefront Main (Meilisearch-Pfad, `/store/catalog`):** Filter `is_purchasable = true` im Meili-Query. Der Filter ist in `meilisearch_sync.py::transform_to_doc()` gesetzt als `has_shop_price AND has_verified_inventory AND legacy_available`.
- **Storefront Fallback (Postgres, `route-postgres-fallback.ts`):** SQL-Klausel `shop_price > 0 AND EXISTS(verified erp_inventory_item)`.
- **Detail (`/store/catalog/[id]`):** Extra-Query auf `erp_inventory_item`, setzt `is_verified + is_purchasable + effective_price` in der API-Response.
- **Category-Pages (`/store/{band,label,press}/[slug]`):** via `enrichWithShopPrice(pg, rows)` Helper aus `backend/src/lib/shop-price.ts`.

## Verify-Endpoint: was passiert genau

`POST /admin/erp/inventory/items/:id/verify` — Body `{ new_price, condition_media, condition_sleeve, exemplar_price?, notes }`:

**Copy #1:**
1. `Release.shop_price = new_price` (kanonisch)
2. `Release.legacy_price = new_price` (defensiver Mirror, damit Legacy-Sync-Konflikt-Detection + Legacy-Leser nicht brechen)
3. `Release.sale_mode = 'both'` **wenn bisher NULL oder `auction_only`** (explizite `direct_purchase` oder bereits `both` bleiben unangetastet)
4. `Release.media_condition` / `sleeve_condition` = Eingabe
5. `erp_inventory_item.exemplar_price = new_price` (Label-Pipeline-Primärquelle)
6. `erp_inventory_item.price_locked = true`, `last_stocktake_at = NOW()`
7. `erp_inventory_item.warehouse_location_id = ALPENSTRASSE` **wenn bisher NULL** (sonst nie überschreiben)
8. Barcode assignen wenn noch nicht gesetzt

**Copy #2+:**
- Nur `erp_inventory_item.exemplar_price`, kein Release-Mirror (pro-Exemplar-Preis)
- Warehouse-Default greift ebenfalls
- `Release.legacy_price` wird aus Backwards-Compat gespiegelt, `Release.shop_price` NICHT (wäre ambig bei Multi-Copy — welcher Preis gewinnt?)

## Add-Copy-Endpoint

`POST /admin/erp/inventory/items/add-copy` — Body `{ release_id, condition_media, condition_sleeve, exemplar_price?, notes }`:

Verhält sich wie Verify für eine neue Copy:
- Neue `erp_inventory_item`-Row mit `copy_number = next`, `price_locked=true`, `warehouse_location_id = ALPENSTRASSE` (Default)
- Wenn Copy #1: `Release.shop_price/legacy_price/sale_mode` wie oben
- Barcode assigned

## Missing-Badge-Logik (Admin-Catalog-Detail)

Ein Item gilt als "als missing markiert (Preis 0 €)" **nur wenn ALLE folgenden Bedingungen zutreffen**:
- `price_locked = true` (explizit bestätigt)
- `shop_price` IS NULL oder = 0
- `legacy_price` IS NULL oder = 0

Das schließt den Fall aus, in dem nach dem Verify `shop_price` gesetzt ist aber `legacy_price = 0` (oder umgekehrt).

## Meilisearch-Integration

Der Meili-Index `releases-commerce` / `releases-discovery` enthält folgende Preis-Felder:

```json
{
  "shop_price": 27.0,         // nur gesetzt wenn shop_price > 0
  "legacy_price": 27.0,       // Info — NICHT für Visibility-Filter nutzen
  "effective_price": 27.0,    // shop_price wenn verified + > 0, sonst null
  "has_price": true,          // shorthand für effective_price != null
  "is_purchasable": true,     // has_price + legacy_available
  "verified_count": 1         // Anzahl verifizierter Exemplare
}
```

`filterableAttributes` enthält `has_price` + `is_purchasable`. Shop nutzt `filter=is_purchasable=true`.

**Reindex-Trigger:** `trigger_release_indexed_at_self()` feuert wenn `shop_price` / `legacy_price` / `sale_mode` / etc. ändern → `search_indexed_at = NULL` → nächster Delta-Cron-Run (alle 5 min) pusht in Meili.

## Backfill (einmalig, 2026-04-23)

Beim Rollout der Umbenennung auf Prod:
- 23 verifizierte Releases hatten `direct_price = NULL/0` aber `legacy_price > 0` → `shop_price = legacy_price`
- 22 davon hatten `sale_mode = 'auction_only'` → `sale_mode = 'both'` (11 hatten schon `direct_purchase`, unangetastet)
- 32 `erp_inventory_item`-Rows ohne `warehouse_location_id` → gesetzt auf ALPENSTRASSE

SQL-Quelle: `backend/scripts/migrations/2026-04-23_rename_direct_price_to_shop_price.sql` (idempotent).

## Verify-Checkliste bei Code-Änderungen

Wer in diesem Bereich arbeitet, MUSS folgende Spalten konsistent behandeln:

- [ ] Neue Write-Pfade auf `Release` setzen `shop_price` — nie `legacy_price` als Shop-Preis
- [ ] Neue Read-Pfade für Shop/Storefront nutzen `effective_price` (aus API) oder `enrichWithShopPrice()` — nie direkt `legacy_price`
- [ ] Meili-Felder die Preis-Semantik haben: Namen reflektieren (`shop_price`, nicht `direct_price`/`legacy_price`)
- [ ] Validierungen für `sale_mode ≠ 'auction_only'` prüfen auf `shop_price`, nicht auf `legacy_price`
- [ ] Cronjobs die Preise ändern: prüfen `price_locked=true`, respektieren die Kanon-Spalte (`shop_price` bleibt unangetastet, `legacy_price` darf bei `price_locked=false` überschrieben werden)

## Phase 2 — live seit rc47.3 (2026-04-23)

**Auction-Start-Preis-Ableitung.** Beim Aufnehmen eines Releases in einen `auction_block` wird `block_item.start_price` automatisch aus `round(shop_price × default_start_price_percent / 100)` berechnet.

- **Block-Level-Prozent:** `auction_block.default_start_price_percent` (Default 50, konfigurierbar im Block-Form) — bei 50 ergibt die Formel `round(shop_price × 0.5)` wie vom User gewünscht.
- **Fallback-Kette:** wenn `shop_price` 0/NULL ist, wird `estimated_value`, dann `legacy_price` herangezogen. Wenn alle drei 0/NULL sind, rejected der Endpoint mit 400 — ein Item ohne sinnvollen Preis in eine Auction zu packen macht keinen Sinn. Fehlermeldung gibt zwei Auswege vor: entweder "Inventory Verify first" oder "pass explicit start_price".
- **Server-vs-Client:** der Admin-UI-Block-Builder berechnet den Default bereits Client-seitig und sendet ihn. Der Server-Default greift, wenn ein Caller `start_price` weglässt — neu optional im `CreateBlockItemSchema`. Beide Pfade verwenden dieselbe Formel.

**Bulk-Rule:** `POST /admin/auction-blocks/:id/items/bulk-price` unterstützt `rule='shop_price_percentage'`, der `round(shop_price × value / 100)` für alle Items im Block setzt (mit derselben Fallback-Kette). Items ohne jeden Preis werden im `skipped`-Counter zurückgegeben. Frank kann damit z.B. eine komplette neue Block-Population nachträglich auf 40 % oder 60 % setzen, ohne durch die Items zu klicken.

**Manueller Override:** Frank kann pro Item im Block-Builder den `start_price` direkt editieren — die Default-Berechnung greift nur beim initialen Add, danach ist der Wert "festgenagelt".

Betroffene Code-Stellen:
- `backend/src/lib/validation.ts` (`CreateBlockItemSchema.start_price` → optional)
- `backend/src/api/admin/auction-blocks/[id]/items/route.ts` (POST-Handler, Server-Default)
- `backend/src/api/admin/auction-blocks/[id]/items/bulk-price/route.ts` (neue Rule)
- `backend/src/admin/routes/auction-blocks/[id]/page.tsx` (Client-Default + Release-Typ)
- `backend/src/api/admin/releases/route.ts` (SELECT shop_price für Release-Picker)

## Historische Anmerkungen

- **Vor rc47.2** hieß die Spalte `Release.direct_price`. Umbenannt 2026-04-23 via `ALTER TABLE "Release" RENAME COLUMN direct_price TO shop_price` + alle 21 Code-Call-Sites (Backend + Storefront + Meili-Sync-Python-Script) auf `shop_price` migriert. Die Umbenennung ist rein semantisch — der Wert ist derselbe, aber der Name spiegelt jetzt das Modell wider.
- Der Meili-Trigger `trigger_release_indexed_at_self` wurde zeitgleich upgedated — sonst hätte Postgres bei jedem `UPDATE` auf der Release-Tabelle mit "field has no column direct_price" gecrasht.
- Die CLAUDE.md-Section "Catalog Visibility" wurde auf das neue Gate umgestellt.
