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

  if (status && typeof status === "string") {
    filters.status = status === "all"
      ? ["scheduled", "preview", "active", "ended"]
      : status
  } else {
    // Default: only show published blocks
    filters.status = ["scheduled", "preview", "active"]
  }

  const [blocks, count] = await auctionService.listAndCountAuctionBlocks(
    filters,
    {
      order: { start_time: "ASC" },
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

    return {
      ...block,
      items_count: items.length,
      items: undefined,
      cover_images: coverImages,
    }
  }))

  res.json({ auction_blocks: simplified, count })
}
