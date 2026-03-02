import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AuctionModuleService from "../../../../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../../../../modules/auction"

// POST /admin/auction-blocks/:id/items/:itemId — Update item (price, lot_number, status)
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)
  const itemId = req.params.itemId

  const item = await auctionService.updateBlockItems({
    id: itemId,
    ...req.body,
  })

  res.json({ block_item: item })
}

// DELETE /admin/auction-blocks/:id/items/:itemId — Remove item from block
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)
  const itemId = req.params.itemId

  await auctionService.deleteBlockItems(itemId)

  res.status(200).json({ id: itemId, deleted: true })
}
