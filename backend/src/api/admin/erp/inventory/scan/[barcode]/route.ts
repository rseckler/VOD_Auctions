import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../../lib/inventory"

/**
 * GET /admin/erp/inventory/scan/:barcode
 *
 * Look up an inventory item by barcode. Used by the scanner integration
 * in the stocktake session UI (onScan.js).
 *
 * Returns the full item data needed to display in the session screen,
 * matching the queue response format for seamless integration.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const barcode = req.params.barcode

  // Accept both barcode formats:
  //   - new (since 2026-04-22): 000001VODe
  //   - legacy: VOD-000001 (old exemplars still carry it)
  const newBarcodePattern = /^\d+VODe$/i
  const oldBarcodePattern = /^VOD-\d+$/i
  if (!barcode || (!newBarcodePattern.test(barcode) && !oldBarcodePattern.test(barcode))) {
    res.status(400).json({ message: "Invalid barcode format. Expected 000001VODe or VOD-XXXXXX." })
    return
  }

  const item = await pg.raw(`
    SELECT
      ii.id AS inventory_item_id,
      ii.barcode,
      ii.status,
      ii.price_locked,
      ii.last_stocktake_at,
      ii.barcode_printed_at,
      ii.notes AS inventory_notes,
      ii.warehouse_location_id,
      r.id AS release_id,
      r.title,
      r.slug,
      r.format,
      r.format_v2,
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
      CASE
        WHEN r.format = 'LP' THEN 1
        WHEN r.format IN ('CASSETTE', 'REEL') THEN 2
        WHEN r.format IN ('MAGAZINE', 'BOOK', 'ZINE', 'POSTER', 'PHOTO', 'POSTCARD') THEN 3
        ELSE 4
      END AS format_group
    FROM erp_inventory_item ii
    JOIN "Release" r ON r.id = ii.release_id
    LEFT JOIN "Artist" a ON a.id = r."artistId"
    LEFT JOIN "Label" l ON l.id = r."labelId"
    WHERE ii.barcode = ?
    LIMIT 1
  `, [barcode])

  if (!item.rows.length) {
    res.status(404).json({ message: `No item found for barcode ${barcode}` })
    return
  }

  const row = item.rows[0]
  res.json({
    ...row,
    legacy_price: row.legacy_price != null ? Number(row.legacy_price) : null,
    discogs_lowest_price: row.discogs_lowest_price != null ? Number(row.discogs_lowest_price) : null,
    discogs_median_price: row.discogs_median_price != null ? Number(row.discogs_median_price) : null,
    discogs_highest_price: row.discogs_highest_price != null ? Number(row.discogs_highest_price) : null,
    discogs_url: row.discogs_id ? `https://www.discogs.com/release/${row.discogs_id}` : null,
    format_group_label:
      row.format_group === 1 ? "Vinyl" :
      row.format_group === 2 ? "Tape" :
      row.format_group === 3 ? "Print" : "Other",
  })
}
