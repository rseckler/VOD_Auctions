import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import AuctionModuleService from "../../../../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../../../../modules/auction"

// POST /admin/auction-blocks/:id/items/bulk-price
// Body option 1: { items: [{ id: string, start_price: number }] }
// Body option 2: { rule: "percentage", value: 20 }  — set all to X% of estimated_value
// Body option 3: { rule: "fixed", value: 5.00 }     — set all to fixed price
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const blockId = req.params.id

  // Load block to validate status
  let block: any
  try {
    block = await auctionService.retrieveAuctionBlock(blockId)
  } catch {
    res.status(404).json({ message: "Auction block not found" })
    return
  }

  const EDITABLE_STATUSES = ["draft", "preview"]
  if (!EDITABLE_STATUSES.includes(block.status)) {
    res.status(409).json({
      message: `Cannot update prices for a block with status "${block.status}". Only draft and preview blocks can be edited.`,
    })
    return
  }

  const { items, rule, value } = req.body as {
    items?: { id: string; start_price: number }[]
    rule?: "percentage" | "fixed"
    value?: number
  }

  // --- Option 1: explicit items array ---
  if (items && Array.isArray(items)) {
    if (items.length === 0) {
      res.status(400).json({ message: "Items array must not be empty" })
      return
    }

    // Validate all start_price values
    for (const item of items) {
      if (!item.id || typeof item.id !== "string") {
        res.status(400).json({ message: "Each item must have a valid id" })
        return
      }
      if (typeof item.start_price !== "number" || item.start_price <= 0) {
        res.status(400).json({
          message: `Invalid start_price for item ${item.id}: must be > 0`,
        })
        return
      }
    }

    // Verify all items belong to this block
    const blockItemIds = items.map((i) => i.id)
    const existingItems = await pgConnection("block_item")
      .select("id")
      .where("auction_block_id", blockId)
      .whereIn("id", blockItemIds)

    const existingIds = new Set(existingItems.map((i: any) => i.id))
    const invalidItems = blockItemIds.filter((id) => !existingIds.has(id))
    if (invalidItems.length > 0) {
      res.status(400).json({
        message: `Items not found in this block: ${invalidItems.join(", ")}`,
      })
      return
    }

    // Bulk update in a transaction
    await pgConnection.transaction(async (trx) => {
      for (const item of items) {
        await trx("block_item")
          .where("id", item.id)
          .where("auction_block_id", blockId)
          .update({ start_price: item.start_price })
      }
    })

    res.json({ updated: items.length, skipped: 0 })
    return
  }

  // --- Option 2 / 3: rule-based ---
  if (rule) {
    if (typeof value !== "number" || value <= 0) {
      res.status(400).json({ message: "value must be a positive number" })
      return
    }

    if (rule === "fixed") {
      // Set all items in the block to the fixed price
      const updatedCount = await pgConnection("block_item")
        .where("auction_block_id", blockId)
        .update({ start_price: value })

      res.json({ updated: updatedCount, skipped: 0 })
      return
    }

    if (rule === "percentage") {
      // Fetch all items with estimated_value
      const allItems = await pgConnection("block_item")
        .select("id", "estimated_value")
        .where("auction_block_id", blockId)

      const withValue = allItems.filter(
        (i: any) => i.estimated_value != null && Number(i.estimated_value) > 0
      )
      const skipped = allItems.length - withValue.length

      if (withValue.length === 0) {
        res.json({ updated: 0, skipped: allItems.length })
        return
      }

      // Update each item with a computed price
      await pgConnection.transaction(async (trx) => {
        for (const item of withValue) {
          const computedPrice = Math.round(Number(item.estimated_value) * value / 100 * 100) / 100
          const finalPrice = Math.max(computedPrice, 0.01)
          await trx("block_item")
            .where("id", item.id)
            .where("auction_block_id", blockId)
            .update({ start_price: finalPrice })
        }
      })

      res.json({ updated: withValue.length, skipped })
      return
    }

    res.status(400).json({ message: `Unknown rule: "${rule}". Use "percentage" or "fixed".` })
    return
  }

  res.status(400).json({
    message: 'Provide either "items" array or "rule" + "value".',
  })
}
