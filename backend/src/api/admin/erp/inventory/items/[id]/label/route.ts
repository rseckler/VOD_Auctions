import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag, assignBarcode } from "../../../../../../../lib/inventory"
import { generateLabelPdf, type LabelData } from "../../../../../../../lib/barcode-label"

/**
 * GET /admin/erp/inventory/items/:id/label
 *
 * Generate a barcode label PDF for an inventory item.
 * If the item doesn't have a barcode yet, one is assigned.
 * Returns a 29mm × 90mm PDF for Brother QL-820NWB + DK-22210.
 *
 * Layout: Barcode + Artist / Title·Label / Format·Country·Condition·Year
 * + right-aligned big Price (€).
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const inventoryItemId = req.params.id

  // Get item + release + artist + label data.
  // Price falls back legacy_price → exemplar_price is preferred when set
  // (Copy #2+ often has its own price, Non-Cohort-A items have no legacy_price).
  // Condition uses erp values when available, Release.legacy_condition as fallback.
  const item = await pg("erp_inventory_item as ii")
    .join("Release as r", "r.id", "ii.release_id")
    .leftJoin("Artist as a", "a.id", "r.artistId")
    .leftJoin("Label as l", "l.id", "r.labelId")
    .where("ii.id", inventoryItemId)
    .select(
      "ii.id",
      "ii.barcode",
      "ii.condition_media",
      "ii.condition_sleeve",
      "ii.exemplar_price",
      "r.title",
      "r.format",
      "r.year",
      "r.country",
      "r.legacy_condition",
      "r.legacy_price",
      "r.direct_price",
      "a.name as artist_name",
      "l.name as label_name"
    )
    .first()

  if (!item) {
    res.status(404).json({ message: "Inventory item not found" })
    return
  }

  // Assign barcode if needed (within transaction)
  let barcode = item.barcode
  if (!barcode) {
    barcode = await pg.transaction(async (trx) => {
      return assignBarcode(trx, inventoryItemId)
    })
  }

  // Fallback chain: exemplar (stocktake override) → direct (shop price for
  // sale_mode=direct_purchase/both) → legacy (MySQL auction start price).
  const effectivePrice =
    item.exemplar_price != null ? Number(item.exemplar_price)
    : item.direct_price != null ? Number(item.direct_price)
    : item.legacy_price != null ? Number(item.legacy_price)
    : null

  const effectiveCondition = item.condition_media
    ? (item.condition_sleeve && item.condition_sleeve !== item.condition_media
        ? `${item.condition_media}/${item.condition_sleeve}`
        : item.condition_media)
    : (item.legacy_condition || null)

  const labelData: LabelData = {
    barcode,
    artistName: item.artist_name || "Unknown",
    title: item.title || "Untitled",
    labelName: item.label_name || null,
    format: item.format || "",
    country: item.country || null,
    condition: effectiveCondition,
    year: item.year,
    price: effectivePrice,
  }

  const doc = await generateLabelPdf(labelData)

  // Update barcode_printed_at
  await pg("erp_inventory_item")
    .where("id", inventoryItemId)
    .update({ barcode_printed_at: new Date() })

  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `inline; filename="label-${barcode}.pdf"`)
  doc.pipe(res)
}
