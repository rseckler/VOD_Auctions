import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AuctionModuleService from "../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../modules/auction"

// GET /admin/auction-blocks — List all blocks
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)

  const { status, block_type } = req.query
  const filters: Record<string, unknown> = {}
  if (status) filters.status = status
  if (block_type) filters.block_type = block_type

  const [blocks, count] = await auctionService.listAndCountAuctionBlocks(
    filters,
    {
      order: { created_at: "DESC" },
      relations: ["items"],
    }
  )

  res.json({ auction_blocks: blocks, count })
}

// POST /admin/auction-blocks — Create a block
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)

  const block = await auctionService.createAuctionBlocks(req.body)

  res.status(201).json({ auction_block: block })
}
