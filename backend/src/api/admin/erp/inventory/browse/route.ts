import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../lib/inventory"
import { getFeatureFlag } from "../../../../../lib/feature-flags"
import { isMeiliEffective, getMeiliClient, COMMERCE_INDEX } from "../../../../../lib/meilisearch"
import { type CatalogFilters } from "../../../../../lib/release-search-meili"
import { inventoryBrowseGetPostgres } from "./route-postgres-fallback"

/**
 * GET /admin/erp/inventory/browse — Inventory-Hub-Tab-Listing (rc49+).
 *
 * Drei-Gate-Wrapper analog /admin/media (rc48):
 *   1. Feature-Flag SEARCH_MEILI_ADMIN OFF → postgres
 *   2. Health-Probe tripped                → postgres
 *   3. `?_backend=postgres`-Param          → postgres (Paritäts-Test)
 *   4. Meili-Runtime-Error                 → postgres
 *
 * Der Inventory-Hub hat 4 Tabs (all, verified, pending, multi_copy) plus
 * eine Suche + Format-Filter. Alle davon sind jetzt im Meili-Index mappbar:
 *   - tab='verified'   → stocktake_state = "done"
 *   - tab='pending'    → stocktake_state = "pending"
 *   - tab='multi_copy' → exemplar_count > 1
 *   - tab='all'        → has_inventory = true
 *   - q-Search         → Meili full-text
 *   - format           → format-filter
 *
 * Response-Shape identisch zur Postgres-Variante, damit die Admin-UI
 * nichts anpassen muss (gleicher Mapper wie vorher).
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const q = req.query as Record<string, string>

  // Gate 3: explicit Postgres-Bypass
  if (q._backend === "postgres") {
    return inventoryBrowseGetPostgres(req, res)
  }

  // Gate 1: feature flag
  const flagOn = await getFeatureFlag(pg, "SEARCH_MEILI_ADMIN")
  if (!flagOn) {
    return inventoryBrowseGetPostgres(req, res)
  }

  // Gate 2: health probe
  if (!isMeiliEffective()) {
    return inventoryBrowseGetPostgres(req, res)
  }

  try {
    const tab = q.tab || "all"
    const search = (q.q || "").trim()
    const format = q.format || ""
    const sortParam = q.sort || "recent_desc"
    const limit = Math.min(parseInt(q.limit || "50", 10), 100)
    const offset = parseInt(q.offset || "0", 10)
    const page = Math.floor(offset / limit) + 1

    // Tab-Filter → Meili-Filter
    const filters: CatalogFilters = {}
    if (tab === "verified") filters.stocktake_state = "done"
    else if (tab === "pending") filters.stocktake_state = "pending"
    else if (tab === "multi_copy") {
      // "Mehrere Exemplare" — Meili hat exemplar_count als filterable,
      // aber Filter-Syntax unterstützt `>` für Integer-Fields.
      // Fallback: wenn Meili das nicht sauber macht, auf Postgres zurück.
      // Wir appendieren manuell unten.
    }
    else {
      // tab="all" — aus dem Inventory-Hub heißt "alle mit Inventar"
      filters.has_inventory = true
    }

    // Format-Filter
    if (format) filters.format = format

    // Sort-Mapping — Inventory-Browse hat eigene Sorts (verify_desc, recent_desc)
    // die nicht 1:1 zu CatalogSort passen. Map:
    //   recent_desc  → updated_at_ts:desc
    //   verified_desc → stocktake last_stocktake_at (über Sort nicht filterable in Meili?
    //     prüfen — aktuell mit updated_at_ts approximiert)
    //   artist_asc/desc, title_asc/desc, price_asc/desc → wie CatalogSort
    const sortMeili: string[] = (() => {
      switch (sortParam) {
        case "recent_desc":
          return ["updated_at_ts:desc"]
        case "verified_desc":
          return ["last_stocktake_at:desc"]
        case "artist_asc":
          return ["artist_name:asc"]
        case "artist_desc":
          return ["artist_name:desc"]
        case "title_asc":
          return ["title:asc"]
        case "title_desc":
          return ["title:desc"]
        case "price_asc":
          return ["shop_price:asc"]
        case "price_desc":
          return ["shop_price:desc"]
        default:
          return ["updated_at_ts:desc"]
      }
    })()

    const filterParts: string[] = []
    // Baue Meili-Filter aus den CatalogFilters + zusätzliche Admin-Spezifika
    if (filters.format) filterParts.push(`format = "${filters.format}"`)
    if (filters.stocktake_state) {
      filterParts.push(`stocktake_state = "${filters.stocktake_state}"`)
    }
    if (filters.has_inventory) filterParts.push(`has_inventory = true`)
    if (tab === "multi_copy") filterParts.push(`exemplar_count > 1`)

    const client = getMeiliClient()
    if (!client) {
      return inventoryBrowseGetPostgres(req, res)
    }

    const result = await client.index(COMMERCE_INDEX).search(search || "", {
      limit,
      offset,
      filter: filterParts.length > 0 ? filterParts : undefined,
      sort: sortMeili,
    })

    // Response-Shape matcht den Browse-Response der Postgres-Route
    const items = (result.hits as any[]).map((hit) => ({
      release_id: hit.release_id,
      title: hit.title,
      cover_image: hit.cover_image,
      format: hit.format,
      catalog_number: hit.catalog_number,
      legacy_price: hit.shop_price ?? hit.legacy_price ?? null, // Hub zeigt Preis — nutze shop_price wenn gesetzt
      year: hit.year,
      country: hit.country,
      artist_name: hit.artist_name,
      label_name: hit.label_name,
      exemplar_count: hit.exemplar_count ?? 0,
      verified_count: hit.verified_count ?? 0,
      last_verified_at: hit.last_stocktake_at
        ? new Date(hit.last_stocktake_at * 1000).toISOString()
        : null,
    }))

    res.json({
      items,
      total: result.estimatedTotalHits ?? 0,
      limit,
      offset,
      backend: "meili",
    })
  } catch (err: any) {
    console.error(
      JSON.stringify({
        event: "inventory_browse_meili_fallback",
        error: err?.message,
      })
    )
    return inventoryBrowseGetPostgres(req, res)
  }
}
