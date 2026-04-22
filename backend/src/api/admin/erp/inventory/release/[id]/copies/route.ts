import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../../../lib/inventory"

/**
 * GET /admin/erp/inventory/release/:id/copies
 *
 * Returns release metadata + all inventory exemplars (copies) for this release.
 * Used by the stocktake session to show all physical copies of a release.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const { id } = req.params

  // Fetch release metadata
  const release = await pg("Release")
    .select(
      "Release.id",
      "Release.title",
      "Release.slug",
      "Release.format",
      "Release.year",
      "Release.country",
      "Release.coverImage",
      "Release.catalogNumber",
      "Release.article_number",
      "Release.legacy_price",
      "Release.legacy_condition",
      "Release.discogs_id",
      "Release.discogs_lowest_price",
      "Release.discogs_median_price",
      "Release.discogs_highest_price",
      "Release.discogs_num_for_sale",
      "Artist.name as artist_name",
      "Label.name as label_name"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .where("Release.id", id)
    .first()

  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  // Fetch all exemplars (copies) for this release
  const copies = await pg("erp_inventory_item")
    .select(
      "id",
      "barcode",
      "copy_number",
      "condition_media",
      "condition_sleeve",
      "exemplar_price",
      "status",
      "quantity",
      "price_locked",
      "price_locked_at",
      "last_stocktake_at",
      "last_stocktake_by",
      "notes",
      "warehouse_location_id",
      "source"
    )
    .where("release_id", id)
    .orderBy("copy_number", "asc")

  // Build discogs URL
  const discogs_url = release.discogs_id
    ? `https://www.discogs.com/release/${release.discogs_id}`
    : null

  res.json({
    release: {
      id: release.id,
      title: release.title,
      artist_name: release.artist_name,
      label_name: release.label_name,
      format: release.format,
      year: release.year,
      country: release.country,
      cover_image: release.coverImage,
      catalog_number: release.catalogNumber,
      article_number: release.article_number,
      legacy_price: release.legacy_price != null ? Number(release.legacy_price) : null,
      legacy_condition: release.legacy_condition,
      discogs_lowest: release.discogs_lowest_price != null ? Number(release.discogs_lowest_price) : null,
      discogs_median: release.discogs_median_price != null ? Number(release.discogs_median_price) : null,
      discogs_highest: release.discogs_highest_price != null ? Number(release.discogs_highest_price) : null,
      discogs_num_for_sale: release.discogs_num_for_sale != null ? Number(release.discogs_num_for_sale) : null,
      discogs_url,
    },
    copies: copies.map((c: any) => ({
      id: c.id,
      barcode: c.barcode,
      copy_number: c.copy_number,
      condition_media: c.condition_media,
      condition_sleeve: c.condition_sleeve,
      exemplar_price: c.exemplar_price != null ? Number(c.exemplar_price) : null,
      effective_price: c.exemplar_price != null
        ? Number(c.exemplar_price)
        : (release.legacy_price != null ? Number(release.legacy_price) : null),
      status: c.status,
      is_verified: !!c.last_stocktake_at,
      verified_at: c.last_stocktake_at,
      verified_by: c.last_stocktake_by,
      price_locked: c.price_locked,
      notes: c.notes,
      source: c.source,
    })),
    can_add_copy: true,
  })
}
