import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AuctionModuleService from "../../../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../../../modules/auction"

// GET /admin/auction-blocks/:id/items — List items in a block
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)

  const [items, count] = await auctionService.listAndCountBlockItems(
    { auction_block_id: req.params.id },
    { order: { lot_number: "ASC" } }
  )

  res.json({ block_items: items, count })
}

// POST /admin/auction-blocks/:id/items — Add item to block
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)

  const item = await auctionService.createBlockItems({
    auction_block_id: req.params.id,
    ...req.body,
  })

  res.status(201).json({ block_item: item })
}
