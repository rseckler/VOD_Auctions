import { MedusaService } from "@medusajs/framework/utils"
import AuctionBlock from "./models/auction-block"
import BlockItem from "./models/block-item"
import Bid from "./models/bid"
import Transaction from "./models/transaction"

class AuctionModuleService extends MedusaService({
  AuctionBlock,
  BlockItem,
  Bid,
  Transaction,
}) {
  // MedusaService auto-generates CRUD methods for all 4 models
}

export default AuctionModuleService
