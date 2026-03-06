import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// POST /admin/shipping/rates — Create or update rate
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const body = req.body as any

  const {
    id,
    zone_id,
    weight_from_grams,
    weight_to_grams,
    price_standard,
    price_oversized,
    carrier_standard,
    carrier_oversized,
    sort_order,
  } = body

  if (!zone_id || weight_from_grams === undefined || weight_to_grams === undefined ||
      price_standard === undefined || price_oversized === undefined) {
    res.status(400).json({
      message: "zone_id, weight_from_grams, weight_to_grams, price_standard, and price_oversized are required",
    })
    return
  }

  try {
    if (id) {
      await pg("shipping_rate").where("id", id).update({
        zone_id,
        weight_from_grams,
        weight_to_grams,
        price_standard,
        price_oversized,
        carrier_standard: carrier_standard || "Deutsche Post",
        carrier_oversized: carrier_oversized || "DHL Paket",
        sort_order: sort_order || 0,
        updated_at: new Date(),
      })
    } else {
      const newId = `sr-${zone_id.replace("zone-", "")}-${Date.now()}`
      await pg("shipping_rate").insert({
        id: newId,
        zone_id,
        weight_from_grams,
        weight_to_grams,
        price_standard,
        price_oversized,
        carrier_standard: carrier_standard || "Deutsche Post",
        carrier_oversized: carrier_oversized || "DHL Paket",
        sort_order: sort_order || 0,
      })
    }

    const rates = await pg("shipping_rate").orderBy(["zone_id", "sort_order"])
    res.json({
      rates: rates.map((r: any) => ({
        ...r,
        price_standard: parseFloat(r.price_standard),
        price_oversized: parseFloat(r.price_oversized),
      })),
    })
  } catch (error: any) {
    console.error("[admin/shipping/rates] Error:", error)
    res.status(500).json({ message: "Failed to save rate" })
  }
}

// DELETE /admin/shipping/rates — Delete rate
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.query as { id?: string }

  if (!id) {
    res.status(400).json({ message: "id query param required" })
    return
  }

  try {
    await pg("shipping_rate").where("id", id).delete()
    const rates = await pg("shipping_rate").orderBy(["zone_id", "sort_order"])
    res.json({
      rates: rates.map((r: any) => ({
        ...r,
        price_standard: parseFloat(r.price_standard),
        price_oversized: parseFloat(r.price_oversized),
      })),
    })
  } catch (error: any) {
    res.status(500).json({ message: "Failed to delete rate" })
  }
}
