import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../lib/inventory"

/**
 * GET /admin/erp/inventory/browse
 *
 * Paginated browse of inventory items at Release level.
 * Tabs: all | verified | pending | multi_copy | price_changed
 * Filters: q (search), format, sort
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const tab = (req.query.tab as string) || "all"
  const q = ((req.query.q as string) || "").trim()
  const format = (req.query.format as string) || ""
  const sort = (req.query.sort as string) || "artist_asc"
  const limit = Math.min(parseInt((req.query.limit as string) || "50"), 100)
  const offset = parseInt((req.query.offset as string) || "0")

  // Base query: aggregate inventory items per release
  let baseWhere = `WHERE ii.source = 'frank_collection'`

  // Tab filters
  if (tab === "verified") {
    baseWhere += ` AND ii.last_stocktake_at IS NOT NULL`
  } else if (tab === "pending") {
    baseWhere += ` AND ii.last_stocktake_at IS NULL`
  } else if (tab === "multi_copy") {
    // Handled in HAVING clause
  } else if (tab === "price_changed") {
    baseWhere += ` AND ii.exemplar_price IS NOT NULL`
  }

  // Search filter
  let searchJoin = ""
  let searchWhere = ""
  if (q) {
    searchJoin = `LEFT JOIN "Artist" a2 ON a2.id = r."artistId"`
    searchWhere = ` AND (a2.name ILIKE '%${q.replace(/'/g, "''")}%' OR r.title ILIKE '%${q.replace(/'/g, "''")}%' OR r."catalogNumber" ILIKE '%${q.replace(/'/g, "''")}%')`
  }

  // Format filter
  let formatWhere = ""
  if (format) {
    formatWhere = ` AND r.format = '${format.replace(/'/g, "''")}'`
  }

  const havingClause = tab === "multi_copy" ? "HAVING COUNT(ii.id) > 1" : ""

  // Sort mapping
  const sortMap: Record<string, string> = {
    artist_asc: "a.name ASC NULLS LAST, r.title ASC",
    artist_desc: "a.name DESC NULLS LAST, r.title ASC",
    title_asc: "r.title ASC",
    title_desc: "r.title DESC",
    price_asc: "r.legacy_price ASC NULLS LAST",
    price_desc: "r.legacy_price DESC NULLS LAST",
    verified_desc: "MAX(ii.last_stocktake_at) DESC NULLS LAST",
  }
  const orderBy = sortMap[sort] || sortMap.artist_asc

  const dataQuery = `
    SELECT
      r.id as release_id, r.title, r."coverImage" as cover_image, r.format,
      r."catalogNumber" as catalog_number, r.legacy_price, r.year, r.country,
      a.name as artist_name, l.name as label_name,
      COUNT(ii.id)::int as exemplar_count,
      COUNT(ii.id) FILTER (WHERE ii.last_stocktake_at IS NOT NULL)::int as verified_count,
      MAX(ii.last_stocktake_at) as last_verified_at
    FROM erp_inventory_item ii
    JOIN "Release" r ON r.id = ii.release_id
    LEFT JOIN "Artist" a ON a.id = r."artistId"
    LEFT JOIN "Label" l ON l.id = r."labelId"
    ${searchJoin}
    ${baseWhere}${searchWhere}${formatWhere}
    GROUP BY r.id, a.name, l.name
    ${havingClause}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `

  const countQuery = `
    SELECT COUNT(*) as total FROM (
      SELECT r.id
      FROM erp_inventory_item ii
      JOIN "Release" r ON r.id = ii.release_id
      LEFT JOIN "Artist" a ON a.id = r."artistId"
      LEFT JOIN "Label" l ON l.id = r."labelId"
      ${searchJoin}
      ${baseWhere}${searchWhere}${formatWhere}
      GROUP BY r.id, a.name, l.name
      ${havingClause}
    ) sub
  `

  const [dataResult, countResult] = await Promise.all([
    pg.raw(dataQuery),
    pg.raw(countQuery),
  ])

  res.json({
    items: dataResult.rows.map((r: any) => ({
      release_id: r.release_id,
      title: r.title,
      cover_image: r.cover_image,
      format: r.format,
      catalog_number: r.catalog_number,
      legacy_price: r.legacy_price != null ? Number(r.legacy_price) : null,
      year: r.year,
      country: r.country,
      artist_name: r.artist_name,
      label_name: r.label_name,
      exemplar_count: r.exemplar_count,
      verified_count: r.verified_count,
      last_verified_at: r.last_verified_at,
    })),
    total: Number(countResult.rows[0]?.total || 0),
    limit,
    offset,
  })
}
