import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../../lib/inventory"

/**
 * POST /admin/pos/sessions/:id/items
 *
 * Scan a barcode and look up the inventory item. Returns full item data
 * for the POS cart display. Validates that the item is sellable:
 * - Must exist in erp_inventory_item
 * - Must not be 'sold'
 * - Must not be in an active auction block
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "POS_WALK_IN")

  const { barcode } = req.body as { barcode?: string }

  if (!barcode || !barcode.startsWith("VOD-")) {
    res.status(400).json({ message: "Invalid barcode format. Expected VOD-XXXXXX." })
    return
  }

  // Look up inventory item with release + artist + label data
  const result = await pg.raw(`
    SELECT
      ii.id AS inventory_item_id,
      ii.barcode,
      ii.status AS inventory_status,
      ii.price_locked,
      ii.notes AS inventory_notes,
      r.id AS release_id,
      r.title,
      r.slug,
      r.format,
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
      a.name AS artist_name,
      l.name AS label_name
    FROM erp_inventory_item ii
    JOIN "Release" r ON r.id = ii.release_id
    LEFT JOIN "Artist" a ON a.id = r."artistId"
    LEFT JOIN "Label" l ON l.id = r."labelId"
    WHERE ii.barcode = ?
    LIMIT 1
  `, [barcode])

  if (!result.rows.length) {
    res.status(404).json({ message: `No item found for barcode ${barcode}` })
    return
  }

  const row = result.rows[0]

  // Check if already sold
  if (row.inventory_status === "sold") {
    // Find when it was sold for better error message
    const soldTx = await pg.raw(`
      SELECT t.created_at, t.order_number
      FROM erp_inventory_movement m
      JOIN transaction t ON t.id = m.transaction_id
      WHERE m.inventory_item_id = ? AND m.type IN ('sale', 'outbound')
      ORDER BY m.created_at DESC LIMIT 1
    `, [row.inventory_item_id])

    const soldInfo = soldTx.rows[0]
    res.status(409).json({
      message: "Item already sold",
      error_code: "ALREADY_SOLD",
      sold_at: soldInfo?.created_at || null,
      order_number: soldInfo?.order_number || null,
      item: formatItem(row),
    })
    return
  }

  // Check if in active auction
  const auctionCheck = await pg.raw(`
    SELECT bi.id, ab.title AS block_title, ab.slug AS block_slug
    FROM block_item bi
    JOIN auction_block ab ON ab.id = bi.auction_block_id
    WHERE bi.release_id = ?
      AND ab.status IN ('active', 'preview', 'scheduled')
    LIMIT 1
  `, [row.release_id])

  if (auctionCheck.rows.length) {
    const auction = auctionCheck.rows[0]
    res.status(409).json({
      message: `Item is in active auction block "${auction.block_title}"`,
      error_code: "IN_AUCTION",
      block_title: auction.block_title,
      block_slug: auction.block_slug,
      item: formatItem(row),
    })
    return
  }

  res.json({ item: formatItem(row) })
}

function formatItem(row: any) {
  return {
    inventory_item_id: row.inventory_item_id,
    barcode: row.barcode,
    release_id: row.release_id,
    title: row.title,
    slug: row.slug,
    artist_name: row.artist_name,
    label_name: row.label_name,
    format: row.format,
    coverImage: row.coverImage,
    catalogNumber: row.catalogNumber,
    legacy_price: row.legacy_price != null ? Number(row.legacy_price) : null,
    legacy_condition: row.legacy_condition,
    legacy_format_detail: row.legacy_format_detail,
    year: row.year,
    country: row.country,
    product_category: row.product_category,
    discogs_id: row.discogs_id,
    discogs_lowest_price: row.discogs_lowest_price != null ? Number(row.discogs_lowest_price) : null,
    discogs_median_price: row.discogs_median_price != null ? Number(row.discogs_median_price) : null,
    discogs_highest_price: row.discogs_highest_price != null ? Number(row.discogs_highest_price) : null,
    discogs_url: row.discogs_id ? `https://www.discogs.com/release/${row.discogs_id}` : null,
    inventory_notes: row.inventory_notes,
    price_locked: row.price_locked,
  }
}
