import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../lib/inventory"

/**
 * GET /admin/erp/inventory/search?q=<query>&limit=20
 *
 * Search inventory items by artist, title, catalog number, or barcode.
 * Returns Release-level results with exemplar counts.
 * Barcode exact match is tried first (scanner input).
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const q = ((req.query.q as string) || "").trim()
  const limit = Math.min(parseInt((req.query.limit as string) || "20"), 50)

  if (!q) {
    res.json({ results: [], total: 0 })
    return
  }

  // Step 1: Barcode exact match (scanner input pattern VOD-XXXXXX)
  if (/^VOD-\d{6}$/i.test(q)) {
    const barcodeResult = await pg.raw(`
      SELECT
        r.id as release_id, r.title, r."coverImage", r.legacy_price, r.format,
        r."catalogNumber", r.year, r.country, r.legacy_condition,
        r.discogs_id, r.discogs_lowest_price, r.discogs_median_price,
        r.discogs_highest_price, r.discogs_num_for_sale,
        a.name as artist_name, l.name as label_name,
        ii.id as inventory_item_id, ii.barcode, ii.copy_number,
        ii.condition_media, ii.condition_sleeve, ii.exemplar_price,
        ii.last_stocktake_at, ii.price_locked
      FROM erp_inventory_item ii
      JOIN "Release" r ON r.id = ii.release_id
      LEFT JOIN "Artist" a ON a.id = r."artistId"
      LEFT JOIN "Label" l ON l.id = r."labelId"
      WHERE UPPER(ii.barcode) = UPPER(?)
      LIMIT 1
    `, [q])

    if (barcodeResult.rows.length > 0) {
      const row = barcodeResult.rows[0]
      res.json({
        results: [{
          release_id: row.release_id,
          artist_name: row.artist_name,
          title: row.title,
          format: row.format,
          catalog_number: row.catalogNumber,
          cover_image: row.coverImage,
          legacy_price: row.legacy_price != null ? Number(row.legacy_price) : null,
          exemplar_count: 1,
          verified_count: row.last_stocktake_at ? 1 : 0,
          discogs_median: row.discogs_median_price != null ? Number(row.discogs_median_price) : null,
          // Direct hit: include the specific exemplar
          matched_exemplar: {
            inventory_item_id: row.inventory_item_id,
            barcode: row.barcode,
            copy_number: row.copy_number,
            condition_media: row.condition_media,
            condition_sleeve: row.condition_sleeve,
            exemplar_price: row.exemplar_price != null ? Number(row.exemplar_price) : null,
            is_verified: !!row.last_stocktake_at,
          }
        }],
        total: 1,
        match_type: "barcode"
      })
      return
    }
  }

  // Step 2: Text search — searches ALL releases (not just Cohort A).
  // LEFT JOIN on erp_inventory_item so releases without inventory show up too.
  // exemplar_count=0 means the release has no inventory item yet (will be created on verify).
  const search = `%${q}%`
  const result = await pg.raw(`
    SELECT
      r.id as release_id, r.title, r."coverImage", r.legacy_price, r.format,
      r."catalogNumber", r.year, r.country,
      r.discogs_median_price, r.discogs_id,
      a.name as artist_name, l.name as label_name,
      COUNT(ii.id)::int as exemplar_count,
      COUNT(ii.id) FILTER (WHERE ii.last_stocktake_at IS NOT NULL)::int as verified_count
    FROM "Release" r
    LEFT JOIN erp_inventory_item ii ON ii.release_id = r.id
    LEFT JOIN "Artist" a ON a.id = r."artistId"
    LEFT JOIN "Label" l ON l.id = r."labelId"
    WHERE
      a.name ILIKE ? OR r.title ILIKE ? OR r."catalogNumber" ILIKE ?
    GROUP BY r.id, a.name, l.name
    ORDER BY
      CASE
        WHEN a.name ILIKE ? THEN 0
        WHEN r.title ILIKE ? THEN 1
        WHEN a.name ILIKE ? THEN 2
        WHEN r.title ILIKE ? THEN 3
        ELSE 4
      END,
      a.name ASC NULLS LAST, r.title ASC
    LIMIT ?
  `, [search, search, search, q, q, q + '%', q + '%', limit])

  const results = result.rows.map((r: any) => ({
    release_id: r.release_id,
    artist_name: r.artist_name,
    title: r.title,
    format: r.format,
    catalog_number: r.catalogNumber,
    cover_image: r.coverImage,
    legacy_price: r.legacy_price != null ? Number(r.legacy_price) : null,
    label_name: r.label_name,
    year: r.year,
    country: r.country,
    exemplar_count: r.exemplar_count,
    verified_count: r.verified_count,
    discogs_median: r.discogs_median_price != null ? Number(r.discogs_median_price) : null,
    discogs_id: r.discogs_id,
  }))

  res.json({ results, total: results.length, match_type: "text" })
}
