import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AuctionModuleService from "../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../modules/auction"

// GET /store/auction-blocks — Public: list active/scheduled blocks
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)

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

  // Simplify items to count for list view
  const simplified = blocks.map((block: any) => ({
    ...block,
    items_count: block.items?.length || 0,
    items: undefined,
  }))

  res.json({ auction_blocks: simplified, count })
}
