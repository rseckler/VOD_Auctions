import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { getFeatureFlag } from "../../../lib/feature-flags"
import { isMeiliEffective } from "../../../lib/meilisearch"
import {
  mapLegacySort,
  searchReleases,
  toAdminShape,
  type CatalogFilters,
  type CatalogSort,
} from "../../../lib/release-search-meili"
import { adminMediaGetPostgres } from "./route-postgres-fallback"

/**
 * GET /admin/media — Admin-Catalog-Listing (rc48 Phase 2).
 *
 * Drei-Gate-Request-Pfad analog /store/catalog (rc40):
 *   1. Feature-Flag SEARCH_MEILI_ADMIN OFF → postgres
 *   2. Health-Probe tripped                → postgres
 *   3. Query-Param `_backend=postgres`     → postgres (Paritätsmatrix-Bypass)
 *   4. Meili-Runtime-Error                 → postgres (transparenter Fallback)
 *
 * Response-Shape ist zwischen beiden Backends identisch (toAdminShape
 * mapper in lib/release-search-meili.ts). Frontend merkt den Wechsel nicht.
 *
 * Count-Semantik (Plan §3.4): `count` ist Meili's `estimatedTotalHits` —
 * approximativ, reicht für Pagination + Facet-Labels. Für Export- und
 * Bulk-Action-Workflows nutzt Frontend den separaten Endpoint
 * `GET /admin/media/count` der gegen Postgres einen exakten SQL-Count macht.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const q = req.query as Record<string, string>

  // Gate 3: explicit Postgres-Bypass (used by parity-check-tool)
  if (q._backend === "postgres") {
    return adminMediaGetPostgres(req, res)
  }

  // Gate 1: feature flag
  const flagOn = await getFeatureFlag(pg, "SEARCH_MEILI_ADMIN")
  if (!flagOn) {
    return adminMediaGetPostgres(req, res)
  }

  // Gate 2: effective flag (health-probe). If Meili tripped, skip trying.
  if (!isMeiliEffective()) {
    console.log(
      JSON.stringify({
        event: "admin_meili_fallback",
        reason: "health_tripped",
        query: q.q,
      })
    )
    return adminMediaGetPostgres(req, res)
  }

  // Gate 4: try Meili, fall through to postgres on runtime error
  try {
    const page = q.offset || q.limit
      ? Math.floor(parseInt(q.offset || "0", 10) / parseInt(q.limit || "25", 10)) + 1
      : 1
    const limit = Math.min(100, parseInt(q.limit || "25", 10))

    // Admin-Filter in CatalogFilters-Shape übersetzen
    const filters: CatalogFilters = {
      format: q.format,
      category: q.category as any,
      country: q.country,
      year_from: q.year_from ? parseInt(q.year_from) : undefined,
      year_to: q.year_to ? parseInt(q.year_to) : undefined,
      label_slug: undefined, // Admin nutzt Label-Name-ILIKE, nicht slug — siehe weiter unten
      auction_status: q.auction_status,
      has_discogs:
        q.has_discogs === "true" ? true : q.has_discogs === "false" ? false : undefined,
      has_image:
        q.has_image === "true" ? true : q.has_image === "false" ? false : undefined,
      visibility: q.visibility as any,
      import_collection: q.import_collection,
      import_action: q.import_action,
      inventory_status: q.inventory_status,
      price_locked:
        q.price_locked === "true" ? true : q.price_locked === "false" ? false : undefined,
      warehouse_code: q.warehouse_location,
      stocktake_state: q.stocktake as any,
      has_inventory:
        q.inventory_state === "any" ? true :
        q.inventory_state === "none" ? false : undefined,
    }

    // Label-ILIKE: Admin-UI tippt "Mute" → aktuell Postgres `ILIKE %Mute%`.
    // Meili hat kein direktes "contains"-Filter für label_name. Zwei Optionen:
    //   (a) Label-Name zum Search-Query appenden → koppelt Label ans Suchfeld
    //   (b) Postgres-Fallback erzwingen wenn `label` gesetzt
    // Wir nehmen (b) — sauberer, kein Search-Coupling.
    if (q.label && q.label.trim()) {
      return adminMediaGetPostgres(req, res)
    }

    // Sort-Übersetzung — Admin-UI sendet sort="field_dir" oder "field:dir"
    const sortEnum: CatalogSort = mapLegacySort(q.sort, "asc") // mapLegacySort kennt das "_" Format intern
    const parsedSort = (() => {
      if (!q.sort) return sortEnum
      // Format "field_dir" oder "field:dir" splitten
      const normalized = q.sort.replace(":", "_")
      const m = normalized.match(/^([a-z_]+?)_(asc|desc)$/)
      if (m) return mapLegacySort(m[1], m[2])
      return sortEnum
    })()

    const result = await searchReleases({
      query: q.q,
      ranking: "commerce",
      filters,
      sort: parsedSort,
      page,
      limit,
    })

    const total = result.estimatedTotalHits ?? 0
    res.json({
      releases: result.hits.map(toAdminShape),
      count: total,
      // Hinweis für UI dass exakter Count via Secondary-Endpoint verfügbar.
      // Plan §3.4 — Frontend ruft diesen nur bei Export/Bulk-Actions.
      count_is_estimate: true,
      count_exact_endpoint: "/admin/media/count",
      backend: "meili",
    })
  } catch (err: any) {
    console.error(
      JSON.stringify({
        event: "admin_meili_runtime_fallback",
        error: err?.message,
        query: q.q,
      })
    )
    return adminMediaGetPostgres(req, res)
  }
}
