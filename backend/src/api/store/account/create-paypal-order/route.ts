import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { prepareCheckoutOrder, CheckoutError } from "../../../../lib/checkout-helpers"

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

    // PayPal order will be created client-side via JS SDK (avoids sandbox compliance issues)
    // Backend only prepares transactions — JS SDK handles PayPal order creation
    console.log(`[create-paypal-order] Transactions prepared for order ${order.orderGroupId}`)

    res.json({
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
