import { MedusaService } from "@medusajs/framework/utils"
import AuctionBlock from "./models/auction-block"
import BlockItem from "./models/block-item"
import Bid from "./models/bid"

class AuctionModuleService extends MedusaService({
  AuctionBlock,
  BlockItem,
  Bid,
}) {
  // MedusaService auto-generates CRUD methods:
  // AuctionBlock: createAuctionBlocks, retrieveAuctionBlock, listAuctionBlocks, updateAuctionBlocks, deleteAuctionBlocks
  // BlockItem: createBlockItems, retrieveBlockItem, listBlockItems, updateBlockItems, deleteBlockItems
  // Bid: createBids, retrieveBid, listBids, listAndCountBids, updateBids, deleteBids
}

export default AuctionModuleService
