import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import AuctionModuleService from "../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../modules/auction"

// GET /store/auction-blocks — Public: list active/scheduled blocks
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { status } = req.query
  const filters: Record<string, unknown> = {}
  const isPast = status === "past"

  if (status && typeof status === "string") {
    if (status === "all") {
      filters.status = ["scheduled", "preview", "active", "ended"]
    } else if (status === "past") {
      filters.status = ["ended", "archived"]
    } else {
      filters.status = status
    }
  } else {
    // Default: only show published blocks
    filters.status = ["scheduled", "preview", "active"]
  }

  const [blocks, count] = await auctionService.listAndCountAuctionBlocks(
    filters,
    {
      order: isPast ? { end_time: "DESC" } : { start_time: "ASC" },
      relations: ["items"],
    }
  )

  // For each block, fetch up to 3 cover images from its items
  const simplified = await Promise.all(blocks.map(async (block: any) => {
    const items = block.items || []
    const releaseIds = items
      .map((i: any) => i.release_id)
      .filter(Boolean)
      .slice(0, 6) // fetch a few extras in case some have no image

    let coverImages: string[] = []
    if (releaseIds.length > 0) {
      const releases = await pgConnection("Release")
        .whereIn("id", releaseIds)
        .whereNotNull("coverImage")
        .select("coverImage")
        .limit(3)
      coverImages = releases
        .map((r: any) => r.coverImage)
        .filter(Boolean)
    }

    // For past blocks, enrich with summary stats
    let summary: { total_bids: number; total_revenue: number; sold_count: number } | undefined
    if (isPast && items.length > 0) {
      const itemIds = items.map((i: any) => i.id)

      const bidResult = await pgConnection("bid")
        .whereIn("block_item_id", itemIds)
        .count("id as cnt")
        .first()
      const totalBids = Number(bidResult?.cnt || 0)

      const revenueResult = await pgConnection("block_item")
        .whereIn("id", itemIds)
        .where("status", "sold")
        .sum("current_price as total")
        .count("id as cnt")
        .first()
      const totalRevenue = Number(revenueResult?.total || 0)
      const soldCount = Number(revenueResult?.cnt || 0)

      summary = { total_bids: totalBids, total_revenue: totalRevenue, sold_count: soldCount }
    }

    return {
      ...block,
      items_count: items.length,
      items: undefined,
      cover_images: coverImages,
      ...(summary || {}),
    }
  }))

  res.json({ auction_blocks: simplified, count })
}
