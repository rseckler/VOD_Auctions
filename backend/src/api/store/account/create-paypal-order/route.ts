import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { prepareCheckoutOrder, CheckoutError } from "../../../../lib/checkout-helpers"
import { createPayPalOrder, paypalConfigured } from "../../../../lib/paypal"

// POST /store/account/create-paypal-order — Create PayPal Order for checkout
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  if (!paypalConfigured) {
    res.status(503).json({ message: "PayPal is not configured" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const body = req.body as any

    // Use shared checkout logic (same validation as Stripe)
    const order = await prepareCheckoutOrder(pgConnection, customerId, body)

    // Set payment_provider on all transactions
    await pgConnection("transaction")
      .where("order_group_id", order.orderGroupId)
      .update({
        payment_provider: "paypal",
        updated_at: new Date(),
      })

    // Build description
    const description = order.itemDescriptions.length <= 3
      ? order.itemDescriptions.join(", ")
      : `${order.itemDescriptions.slice(0, 2).join(", ")} +${order.itemDescriptions.length - 2} more`

    // Create PayPal Order via REST API
    const shippingAddress = body.shipping_address
    const paypalOrder = await createPayPalOrder({
      amount: order.grandTotal,
      currency: "eur",
      description: `VOD Auctions — ${description}`,
      orderGroupId: order.orderGroupId,
      userId: customerId,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      ...(shippingAddress
        ? {
            shippingAddress: {
              name: [shippingAddress.first_name, shippingAddress.last_name].filter(Boolean).join(" ") || order.customerName,
              line1: shippingAddress.line1 || "",
              line2: shippingAddress.line2 || undefined,
              city: shippingAddress.city || "",
              postalCode: shippingAddress.postal_code || "",
              country: order.shippingCountry,
            },
          }
        : {}),
    })

    // Save PayPal order ID on transactions
    await pgConnection("transaction")
      .where("order_group_id", order.orderGroupId)
      .update({
        paypal_order_id: paypalOrder.id,
        updated_at: new Date(),
      })

    console.log(`[create-paypal-order] Order ${order.orderGroupId} → PayPal order ${paypalOrder.id}`)

    res.json({
      paypal_order_id: paypalOrder.id,
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
    console.error("[create-paypal-order] Error:", error)
    res.status(500).json({ message: "Failed to create PayPal order" })
  }
}
