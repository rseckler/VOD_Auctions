import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AuctionModuleService from "../../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../../modules/auction"

// GET /admin/auction-blocks/:id — Get block detail
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)

  const block = await auctionService.retrieveAuctionBlock(req.params.id, {
    relations: ["items"],
  })

  res.json({ auction_block: block })
}

// PUT /admin/auction-blocks/:id — Update block
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)

  const block = await auctionService.updateAuctionBlocks({
    id: req.params.id,
    ...req.body,
  })

  res.json({ auction_block: block })
}

// DELETE /admin/auction-blocks/:id — Delete block
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)

  await auctionService.deleteAuctionBlocks(req.params.id)

  res.status(200).json({ id: req.params.id, deleted: true })
}
