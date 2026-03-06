import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// POST /store/account/feedback — Submit order feedback
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const { order_group_id, rating, comment } = req.body as {
    order_group_id: string
    rating: number
    comment?: string
  }

  if (!order_group_id || !rating || rating < 1 || rating > 5) {
    res.status(400).json({ message: "order_group_id and rating (1-5) required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    // Verify the order belongs to this customer
    const transaction = await pgConnection("transaction")
      .where("order_group_id", order_group_id)
      .where("user_id", customerId)
      .first()

    if (!transaction) {
      res.status(404).json({ message: "Order not found" })
      return
    }

    // Store feedback on all transactions in the group
    await pgConnection("transaction")
      .where("order_group_id", order_group_id)
      .update({
        feedback_rating: rating,
        feedback_comment: comment || null,
        feedback_at: new Date(),
        updated_at: new Date(),
      })

    console.log(`[feedback] Rating ${rating} for order ${order_group_id} by ${customerId}`)
    res.json({ success: true })
  } catch (error: any) {
    console.error("[feedback] Error:", error)
    res.status(500).json({ message: "Failed to submit feedback" })
  }
}
