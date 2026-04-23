import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../lib/inventory"
import { generateBatchLabelsPdf, type LabelData } from "../../../../../lib/barcode-label"

/**
 * GET /admin/erp/inventory/batch-labels
 *
 * Generate a multi-page PDF with barcode labels for multiple items.
 * Each page is one 29mm × 90mm label. The printer cuts between pages.
 *
 * Query params:
 *   item_ids — comma-separated erp_inventory_item IDs (max 200)
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const idsParam = req.query.item_ids as string
  if (!idsParam) {
    res.status(400).json({ message: "item_ids query parameter required" })
    return
  }

  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean)
  if (ids.length === 0 || ids.length > 200) {
    res.status(400).json({ message: "Provide 1-200 item IDs" })
    return
  }

  const items = await pg("erp_inventory_item as ii")
    .join("Release as r", "r.id", "ii.release_id")
    .leftJoin("Artist as a", "a.id", "r.artistId")
    .leftJoin("Label as l", "l.id", "r.labelId")
    .whereIn("ii.id", ids)
    .whereNotNull("ii.barcode")
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
      "r.shop_price",
      "a.name as artist_name",
      "l.name as label_name"
    )

  if (items.length === 0) {
    res.status(404).json({ message: "No items with barcodes found for the given IDs" })
    return
  }

  const labels: LabelData[] = items.map((item: any) => {
    // Same fallback as single-label route: exemplar → direct → legacy
    const effectivePrice =
      item.exemplar_price != null ? Number(item.exemplar_price)
      : item.shop_price != null ? Number(item.shop_price)
      : item.legacy_price != null ? Number(item.legacy_price)
      : null
    const effectiveCondition = item.condition_media
      ? (item.condition_sleeve && item.condition_sleeve !== item.condition_media
          ? `${item.condition_media}/${item.condition_sleeve}`
          : item.condition_media)
      : (item.legacy_condition || null)
    return {
      barcode: item.barcode,
      artistName: item.artist_name || "Unknown",
      title: item.title || "Untitled",
      labelName: item.label_name || null,
      format: item.format || "",
      country: item.country || null,
      condition: effectiveCondition,
      year: item.year,
      price: effectivePrice,
    }
  })

  const doc = await generateBatchLabelsPdf(labels)

  // Update barcode_printed_at for all items
  await pg("erp_inventory_item")
    .whereIn("id", items.map((i: any) => i.id))
    .update({ barcode_printed_at: new Date() })

  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `inline; filename="batch-labels-${items.length}.pdf"`)
  doc.pipe(res)
}
