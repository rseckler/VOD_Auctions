import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { stripe } from "../../../../lib/stripe"
import { prepareCheckoutOrder, CheckoutError } from "../../../../lib/checkout-helpers"

// Explicit payment method types — PayPal removed (now handled directly via PayPal JS SDK)
// Do NOT use automatic_payment_methods (causes Stripe Link to hijack the Payment Element)
const PAYMENT_METHOD_TYPES = [
  "card",         // Credit/Debit cards + Apple Pay + Google Pay (via wallets)
  "klarna",       // Klarna (Pay Now / Pay Later)
  "bancontact",   // Bancontact (Belgium)
  "eps",          // EPS (Austria)
  // "paypal" removed — now handled via direct PayPal integration
  // "link" intentionally excluded — hijacks Payment Element UI
] as const

// POST /store/account/create-payment-intent — Create Stripe PaymentIntent for embedded checkout
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

  try {
    const body = req.body as any

    // Use shared checkout logic
    const order = await prepareCheckoutOrder(pgConnection, customerId, body)

    // Set payment_provider on all transactions
    await pgConnection("transaction")
      .where("order_group_id", order.orderGroupId)
      .update({
        payment_provider: "stripe",
        updated_at: new Date(),
      })

    // ── Create Stripe PaymentIntent ──
    const description = order.itemDescriptions.length <= 3
      ? order.itemDescriptions.join(", ")
      : `${order.itemDescriptions.slice(0, 2).join(", ")} +${order.itemDescriptions.length - 2} more`

    const shippingAddress = body.shipping_address

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(order.grandTotal * 100),
      currency: "eur",
      payment_method_types: [...PAYMENT_METHOD_TYPES],
      description: `VOD Auctions — ${description}`,
      receipt_email: order.customerEmail || undefined,
      metadata: {
        order_group_id: order.orderGroupId,
        user_id: customerId,
        customer_name: order.customerName || "",
        customer_email: order.customerEmail || "",
        ...(order.promoCodeId ? { promo_code_id: order.promoCodeId, discount_amount: String(order.discountAmount) } : {}),
      },
      ...(shippingAddress ? {
        shipping: {
          name: shippingAddress.name
            || [shippingAddress.first_name, shippingAddress.last_name].filter(Boolean).join(" ")
            || order.customerName || "",
          address: {
            line1: shippingAddress.line1 || "",
            line2: shippingAddress.line2 || "",
            city: shippingAddress.city || "",
            postal_code: shippingAddress.postal_code || "",
            state: shippingAddress.state || "",
            country: order.shippingCountry,
          },
        },
      } : {}),
    }, {
      idempotencyKey: order.orderGroupId, // prevent duplicate charges on retry
    })

    // ── Save PaymentIntent ID on transactions ──
    await pgConnection("transaction")
      .where("order_group_id", order.orderGroupId)
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        updated_at: new Date(),
      })

    res.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      order_group_id: order.orderGroupId,
      amount: order.grandTotal,
      shipping_cost: order.shippingCost,
      discount_amount: order.discountAmount,
    })
  } catch (error: any) {
    if (error instanceof CheckoutError) {
      res.status(error.statusCode).json({ message: error.message })
      return
    }
    console.error("[create-payment-intent] Error:", error)
    res.status(500).json({ message: "Failed to create payment intent" })
  }
}
