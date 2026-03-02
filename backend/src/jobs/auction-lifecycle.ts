import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function auctionLifecycle(container: MedusaContainer) {
  const pgConnection = container.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const now = new Date()

  // 1. Activate scheduled blocks whose start_time has passed
  const blocksToActivate = await pgConnection("auction_block")
    .where("status", "scheduled")
    .where("start_time", "<=", now)
    .whereNull("deleted_at")

  for (const block of blocksToActivate) {
    await pgConnection.transaction(async (trx: any) => {
      await trx("auction_block")
        .where("id", block.id)
        .update({ status: "active", updated_at: now })

      // Get items sorted by lot_number
      const items = await trx("block_item")
        .where("auction_block_id", block.id)
        .whereNull("deleted_at")
        .orderBy("lot_number", "asc")

      for (let i = 0; i < items.length; i++) {
        const staggerOffset = block.staggered_ending
          ? i * (block.stagger_interval_seconds || 120) * 1000
          : 0
        const lotEndTime = new Date(
          new Date(block.end_time).getTime() + staggerOffset
        )

        await trx("block_item")
          .where("id", items[i].id)
          .update({
            status: "active",
            lot_end_time: lotEndTime,
            updated_at: now,
          })
      }

      console.log(
        `[lifecycle] Block "${block.title}" (${block.id}) activated with ${items.length} items`
      )
    })
  }

  // 2. End active blocks where all lots have ended
  const activeBlocks = await pgConnection("auction_block")
    .where("status", "active")
    .whereNull("deleted_at")

  for (const block of activeBlocks) {
    // Check if any items still have time remaining
    const activeItems = await pgConnection("block_item")
      .where("auction_block_id", block.id)
      .where("status", "active")
      .whereNull("deleted_at")

    // Only end if ALL active items have passed their lot_end_time
    const hasActiveItems = activeItems.some(
      (item: any) =>
        !item.lot_end_time || new Date(item.lot_end_time) > now
    )

    if (hasActiveItems) continue

    await pgConnection.transaction(async (trx: any) => {
      const items = await trx("block_item")
        .where("auction_block_id", block.id)
        .whereNull("deleted_at")

      let totalRevenue = 0
      let soldCount = 0
      let totalBids = 0

      for (const item of items) {
        totalBids += item.bid_count || 0

        if (item.bid_count > 0 && item.current_price) {
          // Check reserve price
          const meetsReserve =
            !item.reserve_price ||
            item.current_price >= item.reserve_price

          if (meetsReserve) {
            await trx("block_item")
              .where("id", item.id)
              .update({ status: "sold", updated_at: now })
            totalRevenue += parseFloat(item.current_price)
            soldCount++
          } else {
            await trx("block_item")
              .where("id", item.id)
              .update({ status: "unsold", updated_at: now })
          }
        } else {
          await trx("block_item")
            .where("id", item.id)
            .update({ status: "unsold", updated_at: now })
        }
      }

      await trx("auction_block")
        .where("id", block.id)
        .update({
          status: "ended",
          total_revenue: totalRevenue,
          total_items: items.length,
          sold_items: soldCount,
          total_bids: totalBids,
          updated_at: now,
        })

      console.log(
        `[lifecycle] Block "${block.title}" ended: ${soldCount}/${items.length} sold, €${totalRevenue.toFixed(2)} revenue`
      )
    })
  }
}

export const config = {
  name: "auction-lifecycle",
  schedule: "* * * * *", // Every minute
}
