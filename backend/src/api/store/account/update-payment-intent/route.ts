import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { stripe } from "../../../../lib/stripe"
import { calculateShipping, getShippingConfig, resolveZoneByCountry } from "../../../../lib/shipping"

type ShippingAddress = {
  name: string
  line1: string
  line2?: string
  city: string
  postal_code: string
  state?: string
  country: string
}

// POST /store/account/update-payment-intent — Update PaymentIntent when shipping changes
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  if (!stripe) {
    res.status(503).json({ message: "Payment service is not configured" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const body = req.body as any
  const {
    payment_intent_id,
    order_group_id,
    shipping_address,
    shipping_method_id,
    country_code,
  } = body as {
    payment_intent_id: string
    order_group_id: string
    shipping_address?: ShippingAddress
    shipping_method_id?: string
    country_code?: string
  }

  if (!payment_intent_id || !order_group_id) {
    res.status(400).json({ message: "payment_intent_id and order_group_id are required" })
    return
  }

  // Verify this order belongs to the user
  const txCheck = await pgConnection("transaction")
    .where({ order_group_id, user_id: customerId, status: "pending" })
    .first()
  if (!txCheck) {
    res.status(404).json({ message: "Order not found or already paid" })
    return
  }

  // Resolve shipping zone
  const resolvedCountry = country_code || shipping_address?.country
  if (!resolvedCountry) {
    res.status(400).json({ message: "country_code or shipping_address.country is required" })
    return
  }

  let shipping_zone: string
  let shipping_country: string
  try {
    const resolved = await resolveZoneByCountry(pgConnection, resolvedCountry)
    shipping_zone = resolved.zone.slug
    shipping_country = resolved.country_code
  } catch {
    res.status(400).json({ message: `Invalid country: ${resolvedCountry}` })
    return
  }

  try {
    // Get all pending transactions in this order group
    const transactions = await pgConnection("transaction")
      .where({ order_group_id, user_id: customerId, status: "pending" })

    // Recalculate shipping
    const shippingItems = transactions.map((t: any) => ({
      release_id: t.release_id,
      quantity: 1,
    }))

    let shippingCost: number
    try {
      const estimate = await calculateShipping(pgConnection, shippingItems, shipping_zone)
      shippingCost = estimate.price
    } catch {
      const fallbackRates: Record<string, number> = { de: 4.99, eu: 9.99, world: 14.99 }
      shippingCost = fallbackRates[shipping_zone] || 14.99
    }

    // Free shipping threshold
    const shippingConfig = await getShippingConfig(pgConnection)
    const itemsTotal = transactions.reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0)
    if (shippingConfig?.free_shipping_threshold && itemsTotal >= parseFloat(shippingConfig.free_shipping_threshold)) {
      shippingCost = 0
    }

    // Read existing discount from transactions (preserve promo code discount)
    const discountTotal = transactions.reduce((sum: number, t: any) => sum + parseFloat(t.discount_amount || 0), 0)
    const grandTotal = Math.max(itemsTotal + shippingCost - discountTotal, 0.50)

    // Redistribute shipping cost (and preserve per-item discount share)
    let shippingDistributed = 0
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i]
      const amount = parseFloat(tx.amount)
      const discountShare = parseFloat(tx.discount_amount || 0)
      const share = i === transactions.length - 1
        ? Math.round((shippingCost - shippingDistributed) * 100) / 100
        : Math.round((amount / itemsTotal) * shippingCost * 100) / 100

      const updateData: Record<string, any> = {
        shipping_cost: share,
        total_amount: amount + share - discountShare,
        shipping_country,
        updated_at: new Date(),
      }

      if (shipping_address) {
        updateData.shipping_name = shipping_address.name || null
        updateData.shipping_address_line1 = shipping_address.line1 || null
        updateData.shipping_address_line2 = shipping_address.line2 || null
        updateData.shipping_city = shipping_address.city || null
        updateData.shipping_postal_code = shipping_address.postal_code || null
      }

      if (shipping_method_id) {
        updateData.shipping_method_id = shipping_method_id
      }

      await pgConnection("transaction")
        .where("id", tx.id)
        .update(updateData)

      shippingDistributed += share
    }

    // Update Stripe PaymentIntent amount
    const updateParams: any = {
      amount: Math.round(grandTotal * 100),
    }
    if (shipping_address) {
      updateParams.shipping = {
        name: shipping_address.name || "",
        address: {
          line1: shipping_address.line1 || "",
          line2: shipping_address.line2 || "",
          city: shipping_address.city || "",
          postal_code: shipping_address.postal_code || "",
          state: shipping_address.state || "",
          country: shipping_country,
        },
      }
    }

    await stripe.paymentIntents.update(payment_intent_id, updateParams)

    res.json({
      amount: grandTotal,
      shipping_cost: shippingCost,
    })
  } catch (error: any) {
    console.error("[update-payment-intent] Error:", error)
    res.status(500).json({ message: "Failed to update payment intent" })
  }
}
