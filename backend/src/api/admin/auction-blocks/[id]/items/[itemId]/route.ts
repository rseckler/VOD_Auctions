import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
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
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const itemId = req.params.itemId

  // Load item to get release_id before deleting
  const item = await auctionService.retrieveBlockItem(itemId)
  const releaseId = item?.release_id

  await auctionService.deleteBlockItems(itemId)

  // Reset Release auction_status to 'available'
  if (releaseId) {
    await pgConnection("Release")
      .where("id", releaseId)
      .update({ auction_status: "available", current_block_id: null })
  }

  res.status(200).json({ id: itemId, deleted: true })
}
