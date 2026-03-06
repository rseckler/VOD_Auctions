import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// POST /admin/shipping/config — Update global shipping config
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const allowed = [
    "packaging_weight_grams",
    "packaging_weight_small_grams",
    "free_shipping_threshold",
    "default_carrier",
    "margin_percent",
  ]

  const updates: Record<string, any> = {}
  for (const field of allowed) {
    if ((req.body as any)[field] !== undefined) {
      updates[field] = (req.body as any)[field]
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ message: "No valid fields to update" })
    return
  }

  updates.updated_at = new Date()

  try {
    await pg("shipping_config").where("id", "default").update(updates)
    const config = await pg("shipping_config").where("id", "default").first()
    res.json({ config })
  } catch (error: any) {
    console.error("[admin/shipping/config] Error:", error)
    res.status(500).json({ message: "Failed to update config" })
  }
}
