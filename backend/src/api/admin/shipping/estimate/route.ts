import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { calculateShipping } from "../../../../lib/shipping"

// POST /admin/shipping/estimate — Test shipping calculation
// Body: { items: [{ item_type_slug, quantity }], zone_slug }
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const body = req.body as any

  const { items, zone_slug } = body

  if (!items || !Array.isArray(items) || items.length === 0 || !zone_slug) {
    res.status(400).json({ message: "items (array) and zone_slug are required" })
    return
  }

  try {
    // For the admin calculator, we don't have real release_ids
    // So we simulate by computing weights directly from item types
    const config = await pg("shipping_config").where("id", "default").first()
    const zone = await pg("shipping_zone").where("slug", zone_slug).first()
    if (!zone) {
      res.status(400).json({ message: `Unknown zone: ${zone_slug}` })
      return
    }

    const rates = await pg("shipping_rate")
      .where("zone_id", zone.id)
      .orderBy("weight_from_grams", "asc")

    let totalWeight = 0
    let hasOversized = false
    const breakdown: any[] = []

    for (const item of items) {
      const itemType = await pg("shipping_item_type")
        .where("slug", item.item_type_slug)
        .first()

      if (!itemType) continue

      const qty = item.quantity || 1
      const weight = itemType.default_weight_grams * qty

      totalWeight += weight
      if (itemType.is_oversized) hasOversized = true

      breakdown.push({
        item_type: itemType.name,
        quantity: qty,
        weight_per_item: itemType.default_weight_grams,
        weight_total: weight,
        is_oversized: itemType.is_oversized,
      })
    }

    const packagingWeight = hasOversized
      ? (config?.packaging_weight_grams || 200)
      : (config?.packaging_weight_small_grams || 50)

    const shippingWeight = totalWeight + packagingWeight

    const rate = rates.find(
      (r: any) => shippingWeight >= r.weight_from_grams && shippingWeight <= r.weight_to_grams
    ) || rates[rates.length - 1]

    const basePrice = hasOversized
      ? parseFloat(rate.price_oversized)
      : parseFloat(rate.price_standard)

    const marginPercent = config?.margin_percent || 0
    const finalPrice = Math.round(basePrice * (1 + marginPercent / 100) * 100) / 100

    res.json({
      estimate: {
        items_weight_grams: totalWeight,
        packaging_weight_grams: packagingWeight,
        shipping_weight_grams: shippingWeight,
        has_oversized: hasOversized,
        zone: zone.name,
        carrier: hasOversized ? rate.carrier_oversized : rate.carrier_standard,
        base_price: basePrice,
        margin_percent: marginPercent,
        final_price: finalPrice,
        weight_tier: `${rate.weight_from_grams}–${rate.weight_to_grams}g`,
        breakdown,
      },
    })
  } catch (error: any) {
    console.error("[admin/shipping/estimate] Error:", error)
    res.status(500).json({ message: "Failed to estimate shipping" })
  }
}
