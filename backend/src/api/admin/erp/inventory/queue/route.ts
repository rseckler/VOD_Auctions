import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../lib/inventory"

/**
 * GET /admin/erp/inventory/queue
 *
 * Returns the next batch of items for the stocktake session.
 * Sorted by format group (Vinyl→Tape→Print→Other), then artist, then title.
 * Only items that haven't been stocktake'd yet (last_stocktake_at IS NULL).
 *
 * Query params:
 *   cursor  — release_id of the last seen item (for pagination)
 *   limit   — batch size (default 50, max 100)
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const cursor = (req.query.cursor as string) || null
  const limit = Math.min(Number(req.query.limit) || 50, 100)

  // Format-group sort order (Frank F5):
  //   1 = Vinyl (LP + all sub-formats mapped to LP)
  //   2 = Tape (CASSETTE, REEL)
  //   3 = Print (MAGAZINE, BOOK, ZINE, POSTER, PHOTO, POSTCARD)
  //   4 = Other (CD, VHS, BOXSET, DIGITAL, MERCHANDISE, OTHER)
  const FORMAT_GROUP_CASE = `
    CASE
      WHEN r.format = 'LP' THEN 1
      WHEN r.format IN ('CASSETTE', 'REEL') THEN 2
      WHEN r.format IN ('MAGAZINE', 'BOOK', 'ZINE', 'POSTER', 'PHOTO', 'POSTCARD') THEN 3
      ELSE 4
    END
  `

  let query = pg.raw(`
    SELECT
      ii.id AS inventory_item_id,
      ii.barcode,
      ii.status,
      ii.price_locked,
      ii.last_stocktake_at,
      ii.notes AS inventory_notes,
      ii.warehouse_location_id,
      r.id AS release_id,
      r.title,
      r.slug,
      r.format,
      r.format_id,
      r."coverImage",
      r."catalogNumber",
      r.legacy_price,
      r.legacy_condition,
      r.legacy_format_detail,
      r.year,
      r.country,
      r.product_category,
      r.discogs_id,
      r.discogs_lowest_price,
      r.discogs_median_price,
      r.discogs_highest_price,
      r.discogs_num_for_sale,
      a.name AS artist_name,
      l.name AS label_name,
      ${FORMAT_GROUP_CASE} AS format_group
    FROM erp_inventory_item ii
    JOIN "Release" r ON r.id = ii.release_id
    LEFT JOIN "Artist" a ON a.id = r."artistId"
    LEFT JOIN "Label" l ON l.id = r."labelId"
    WHERE ii.source = 'frank_collection'
      AND ii.last_stocktake_at IS NULL
    ORDER BY
      ${FORMAT_GROUP_CASE},
      a.name ASC NULLS LAST,
      r.title ASC,
      r.id ASC
    LIMIT ?
  `, [limit])

  const items = (await query).rows

  // Compute discogs_url for each item
  const result = items.map((item: any) => ({
    ...item,
    legacy_price: item.legacy_price != null ? Number(item.legacy_price) : null,
    discogs_lowest_price: item.discogs_lowest_price != null ? Number(item.discogs_lowest_price) : null,
    discogs_median_price: item.discogs_median_price != null ? Number(item.discogs_median_price) : null,
    discogs_highest_price: item.discogs_highest_price != null ? Number(item.discogs_highest_price) : null,
    discogs_url: item.discogs_id
      ? `https://www.discogs.com/release/${item.discogs_id}`
      : null,
    format_group_label:
      item.format_group === 1 ? "Vinyl" :
      item.format_group === 2 ? "Tape" :
      item.format_group === 3 ? "Print" : "Other",
  }))

  // Total remaining count for progress
  const countResult = await pg("erp_inventory_item")
    .where("source", "frank_collection")
    .whereNull("last_stocktake_at")
    .count("* as count")
    .first()

  res.json({
    items: result,
    remaining: Number(countResult?.count ?? 0),
    has_more: items.length === limit,
  })
}
