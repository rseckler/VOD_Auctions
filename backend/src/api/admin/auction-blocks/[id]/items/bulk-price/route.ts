import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import AuctionModuleService from "../../../../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../../../../modules/auction"

// POST /admin/auction-blocks/:id/items/bulk-price
// Body option 1: { items: [{ id: string, start_price: number }] }
// Body option 2: { rule: "percentage", value: 20 }       — X% of estimated_value
// Body option 3: { rule: "fixed", value: 5.00 }          — fixed price
// Body option 4: { rule: "shop_price_percentage", value: 50 } — round(shop_price × value/100)
//                (rc47.2 Preis-Modell: nutzt Release.shop_price als Basis,
//                 skippt Items ohne shop_price. Fallback-Kette wie bei Single-
//                 Item-POST: wenn shop_price=0, fällt auf estimated_value, dann
//                 legacy_price; wenn nichts > 0, wird das Item geskippt.)
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
    rule?: "percentage" | "fixed" | "shop_price_percentage"
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

    if (rule === "shop_price_percentage") {
      // Fetch all items joined to Release.shop_price / estimated_value / legacy_price.
      // Preis-Modell rc47.2: shop_price ist primär, Fallback-Kette für Items
      // die noch nicht verifiziert sind. Items ohne jeden Preis werden geskippt.
      const joined = await pgConnection("block_item as bi")
        .leftJoin("Release as r", "bi.release_id", "r.id")
        .select(
          "bi.id",
          "r.shop_price",
          "r.estimated_value",
          "r.legacy_price"
        )
        .where("bi.auction_block_id", blockId)

      const updates: { id: string; finalPrice: number }[] = []
      let skipped = 0
      for (const row of joined) {
        const shop = row.shop_price != null ? Number(row.shop_price) : 0
        const estimated = row.estimated_value != null ? Number(row.estimated_value) : 0
        const legacy = row.legacy_price != null ? Number(row.legacy_price) : 0
        const base = shop > 0 ? shop : estimated > 0 ? estimated : legacy > 0 ? legacy : 0
        if (base <= 0) {
          skipped++
          continue
        }
        const finalPrice = Math.max(1, Math.round(base * value / 100))
        updates.push({ id: row.id, finalPrice })
      }

      if (updates.length === 0) {
        res.json({ updated: 0, skipped })
        return
      }

      await pgConnection.transaction(async (trx) => {
        for (const u of updates) {
          await trx("block_item")
            .where("id", u.id)
            .where("auction_block_id", blockId)
            .update({ start_price: u.finalPrice })
        }
      })

      res.json({ updated: updates.length, skipped })
      return
    }

    res.status(400).json({
      message: `Unknown rule: "${rule}". Use "percentage", "shop_price_percentage", or "fixed".`,
    })
    return
  }

  res.status(400).json({
    message: 'Provide either "items" array or "rule" + "value".',
  })
}
