import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/transactions/:id — Transaction detail
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const transaction = await pgConnection("transaction")
      .select(
        "transaction.*",
        "block_item.release_id",
        "block_item.lot_number",
        "auction_block.title as block_title",
        "auction_block.slug as block_slug"
      )
      .join("block_item", "block_item.id", "transaction.block_item_id")
      .join("auction_block", "auction_block.id", "block_item.auction_block_id")
      .where("transaction.id", id)
      .first()

    if (!transaction) {
      res.status(404).json({ message: "Transaction not found" })
      return
    }

    res.json({ transaction })
  } catch (error: any) {
    console.error("[admin/transactions] Error:", error)
    res.status(500).json({ message: "Failed to fetch transaction" })
  }
}

// POST /admin/transactions/:id — Update shipping status
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const { shipping_status } = req.body as {
    shipping_status: "shipped" | "delivered"
  }

  if (!shipping_status || !["shipped", "delivered"].includes(shipping_status)) {
    res.status(400).json({ message: "shipping_status must be 'shipped' or 'delivered'" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const transaction = await pgConnection("transaction")
      .where("id", id)
      .first()

    if (!transaction) {
      res.status(404).json({ message: "Transaction not found" })
      return
    }

    if (transaction.status !== "paid") {
      res.status(400).json({ message: "Can only update shipping for paid transactions" })
      return
    }

    const updateData: Record<string, any> = {
      shipping_status,
      updated_at: new Date(),
    }

    if (shipping_status === "shipped") updateData.shipped_at = new Date()
    if (shipping_status === "delivered") updateData.delivered_at = new Date()

    await pgConnection("transaction").where("id", id).update(updateData)

    res.json({ success: true, shipping_status })
  } catch (error: any) {
    console.error("[admin/transactions] Error:", error)
    res.status(500).json({ message: "Failed to update transaction" })
  }
}
