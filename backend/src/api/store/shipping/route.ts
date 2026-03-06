import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { calculateShipping, getShippingConfig, getShippingZonesWithRates } from "../../../lib/shipping"

// GET /store/shipping — Get zones and rates for frontend display
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  try {
    const [zones, config] = await Promise.all([
      getShippingZonesWithRates(pg),
      getShippingConfig(pg),
    ])

    res.json({
      zones,
      free_shipping_threshold: config?.free_shipping_threshold
        ? parseFloat(config.free_shipping_threshold)
        : null,
    })
  } catch (error: any) {
    console.error("[store/shipping] Error:", error)
    res.status(500).json({ message: "Failed to fetch shipping info" })
  }
}

// POST /store/shipping — Estimate shipping for specific items
// Body: { release_ids: string[], zone_slug: string }
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { release_ids, zone_slug } = req.body as any

  if (!release_ids || !Array.isArray(release_ids) || !zone_slug) {
    res.status(400).json({ message: "release_ids (array) and zone_slug are required" })
    return
  }

  try {
    const items = release_ids.map((id: string) => ({ release_id: id, quantity: 1 }))
    const estimate = await calculateShipping(pg, items, zone_slug)

    // Check free shipping
    const config = await getShippingConfig(pg)
    res.json({
      estimate: {
        ...estimate,
        free_shipping_threshold: config?.free_shipping_threshold
          ? parseFloat(config.free_shipping_threshold)
          : null,
      },
    })
  } catch (error: any) {
    console.error("[store/shipping] Estimate error:", error)
    res.status(500).json({ message: error.message || "Failed to estimate shipping" })
  }
}
