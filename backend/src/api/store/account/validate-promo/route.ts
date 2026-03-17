import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// POST /store/account/validate-promo — Validate a promo code and calculate discount
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { code, subtotal } = req.body as { code?: string; subtotal?: number }

  if (!code || typeof code !== "string") {
    res.json({ valid: false, message: "Please enter a promo code." })
    return
  }

  if (subtotal === undefined || subtotal === null || subtotal < 0) {
    res.json({ valid: false, message: "Invalid subtotal." })
    return
  }

  try {
    const promo = await pgConnection("promo_code")
      .where("code", code.trim().toUpperCase())
      .where("is_active", true)
      .first()

    if (!promo) {
      res.json({ valid: false, message: "Invalid promo code." })
      return
    }

    const now = new Date()

    if (promo.valid_from && new Date(promo.valid_from) > now) {
      res.json({ valid: false, message: "This promo code is not yet active." })
      return
    }

    if (promo.valid_to && new Date(promo.valid_to) < now) {
      res.json({ valid: false, message: "This promo code has expired." })
      return
    }

    if (promo.max_uses !== null && Number(promo.used_count) >= Number(promo.max_uses)) {
      res.json({ valid: false, message: "This promo code has reached its usage limit." })
      return
    }

    const minOrder = Number(promo.min_order_amount) || 0
    if (subtotal < minOrder) {
      res.json({
        valid: false,
        message: `Minimum order amount of \u20AC${minOrder.toFixed(2)} required for this code.`,
      })
      return
    }

    // Calculate discount
    let discountAmount: number
    if (promo.discount_type === "percentage") {
      discountAmount = subtotal * Number(promo.discount_value) / 100
      if (promo.max_discount_amount !== null) {
        discountAmount = Math.min(discountAmount, Number(promo.max_discount_amount))
      }
    } else {
      // fixed
      discountAmount = Math.min(Number(promo.discount_value), subtotal)
    }

    discountAmount = Math.round(discountAmount * 100) / 100

    res.json({
      valid: true,
      promo_code_id: promo.id,
      code: promo.code,
      discount_type: promo.discount_type,
      discount_value: Number(promo.discount_value),
      discount_amount: discountAmount,
      description: promo.description || null,
    })
  } catch (error: any) {
    console.error("[validate-promo] Error:", error)
    res.status(500).json({ message: "Failed to validate promo code" })
  }
}
