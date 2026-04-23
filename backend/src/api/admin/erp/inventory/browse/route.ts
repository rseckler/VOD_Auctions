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
 *
 * Performance: die alte Version hat JOIN auf Release VOR GROUP BY gemacht
 * (~5-10s auf 13k inventory-Rows), plus eine zweite identische Aggregation
 * als countQuery. Fix spiegelt den /stats-Fix: per-release Aggregation in
 * einer MATERIALIZED CTE auf erp_inventory_item alleine (13k Rows, Index
 * auf source), dann Join auf Release/Artist/Label erst danach. Count kommt
 * jetzt als COUNT(*) OVER() im selben Query.
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
  const sort = (req.query.sort as string) || "recent_desc"
  const limit = Math.min(parseInt((req.query.limit as string) || "50"), 100)
  const offset = parseInt((req.query.offset as string) || "0")

  // ── CTE filter (applied early on erp_inventory_item) ──
  let cteWhere = `WHERE ii.source = 'frank_collection'`
  if (tab === "verified") {
    cteWhere += ` AND ii.last_stocktake_at IS NOT NULL`
  } else if (tab === "pending") {
    cteWhere += ` AND ii.last_stocktake_at IS NULL`
  } else if (tab === "price_changed") {
    cteWhere += ` AND ii.exemplar_price IS NOT NULL`
  }
  const havingClause = tab === "multi_copy" ? "HAVING COUNT(*) > 1" : ""

  // ── Outer filter (on Release/Artist after JOIN) ──
  const escape = (s: string) => s.replace(/'/g, "''")
  const outerWhereParts: string[] = []
  if (q) {
    const qs = escape(q)
    outerWhereParts.push(
      `(a.name ILIKE '%${qs}%' OR r.title ILIKE '%${qs}%' OR r."catalogNumber" ILIKE '%${qs}%')`
    )
  }
  if (format) {
    outerWhereParts.push(`r.format = '${escape(format)}'`)
  }
  const outerWhere = outerWhereParts.length ? `WHERE ${outerWhereParts.join(" AND ")}` : ""

  // ── Sort mapping ──
  const sortMap: Record<string, string> = {
    recent_desc: "pr.last_updated_at DESC NULLS LAST, r.title ASC",
    artist_asc: `a.name ASC NULLS LAST, r.title ASC`,
    artist_desc: `a.name DESC NULLS LAST, r.title ASC`,
    title_asc: "r.title ASC",
    title_desc: "r.title DESC",
    price_asc: `r.legacy_price ASC NULLS LAST`,
    price_desc: `r.legacy_price DESC NULLS LAST`,
    verified_desc: "pr.last_verified_at DESC NULLS LAST, r.title ASC",
  }
  const orderBy = sortMap[sort] || sortMap.recent_desc

  // Single query: CTE aggregates per release on erp_inventory_item alone,
  // then joins Release/Artist/Label, with COUNT(*) OVER() for pagination total.
  const sql = `
    WITH per_release AS MATERIALIZED (
      SELECT
        ii.release_id,
        COUNT(*)::int AS exemplar_count,
        COUNT(*) FILTER (WHERE ii.last_stocktake_at IS NOT NULL)::int AS verified_count,
        MAX(ii.last_stocktake_at) AS last_verified_at,
        MAX(ii.updated_at) AS last_updated_at
      FROM erp_inventory_item ii
      ${cteWhere}
      GROUP BY ii.release_id
      ${havingClause}
    )
    SELECT
      r.id AS release_id, r.title, r."coverImage" AS cover_image, r.format,
      r."catalogNumber" AS catalog_number, r.legacy_price, r.year, r.country,
      a.name AS artist_name, l.name AS label_name,
      pr.exemplar_count, pr.verified_count, pr.last_verified_at,
      COUNT(*) OVER() AS _total_count
    FROM per_release pr
    JOIN "Release" r ON r.id = pr.release_id
    LEFT JOIN "Artist" a ON a.id = r."artistId"
    LEFT JOIN "Label" l ON l.id = r."labelId"
    ${outerWhere}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `

  const result = await pg.raw(sql)
  const rows = result.rows as any[]
  const total = rows.length > 0 ? Number(rows[0]._total_count) : 0

  res.json({
    items: rows.map((r) => ({
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
    total,
    limit,
    offset,
  })
}
