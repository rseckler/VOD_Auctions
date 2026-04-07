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
 * Returns a 29mm × 62mm PDF suitable for Brother QL-810W.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const inventoryItemId = req.params.id

  // Get item + release data
  const item = await pg("erp_inventory_item as ii")
    .join("Release as r", "r.id", "ii.release_id")
    .leftJoin("Artist as a", "a.id", "r.artistId")
    .where("ii.id", inventoryItemId)
    .select(
      "ii.id",
      "ii.barcode",
      "r.title",
      "r.format",
      "r.year",
      "a.name as artist_name"
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

  const labelData: LabelData = {
    barcode,
    artistName: item.artist_name || "Unknown",
    title: item.title || "Untitled",
    format: item.format || "",
    year: item.year,
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
