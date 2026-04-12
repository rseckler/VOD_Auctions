import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../lib/inventory"

/**
 * GET /admin/erp/inventory/missing-candidates
 *
 * Returns unverified inventory items — candidates for "missing" marking
 * after the stocktake period is over. These are items that exist in the
 * system but were never physically found by Frank.
 *
 * Query: ?limit=50&offset=0&format=LP
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const limit = Math.min(parseInt((req.query.limit as string) || "50"), 200)
  const offset = parseInt((req.query.offset as string) || "0")
  const format = (req.query.format as string) || ""

  let formatWhere = ""
  if (format) {
    formatWhere = ` AND r.format = '${format.replace(/'/g, "''")}'`
  }

  const [dataResult, countResult] = await Promise.all([
    pg.raw(`
      SELECT
        ii.id as inventory_item_id, ii.barcode, ii.copy_number,
        r.id as release_id, r.title, r."coverImage" as cover_image,
        r.format, r."catalogNumber" as catalog_number, r.legacy_price,
        a.name as artist_name
      FROM erp_inventory_item ii
      JOIN "Release" r ON r.id = ii.release_id
      LEFT JOIN "Artist" a ON a.id = r."artistId"
      WHERE ii.source = 'frank_collection'
        AND ii.last_stocktake_at IS NULL
        ${formatWhere}
      ORDER BY a.name ASC NULLS LAST, r.title ASC, ii.copy_number ASC
      LIMIT ${limit} OFFSET ${offset}
    `),
    pg.raw(`
      SELECT COUNT(*)::int as total
      FROM erp_inventory_item ii
      JOIN "Release" r ON r.id = ii.release_id
      WHERE ii.source = 'frank_collection'
        AND ii.last_stocktake_at IS NULL
        ${formatWhere}
    `),
  ])

  res.json({
    items: dataResult.rows.map((r: any) => ({
      inventory_item_id: r.inventory_item_id,
      barcode: r.barcode,
      copy_number: r.copy_number,
      release_id: r.release_id,
      title: r.title,
      cover_image: r.cover_image,
      format: r.format,
      catalog_number: r.catalog_number,
      legacy_price: r.legacy_price != null ? Number(r.legacy_price) : null,
      artist_name: r.artist_name,
    })),
    total: Number(countResult.rows[0]?.total || 0),
    limit,
    offset,
  })
}
