import { MedusaService } from "@medusajs/framework/utils"
import AuctionBlock from "./models/auction-block"
import BlockItem from "./models/block-item"
import Bid from "./models/bid"
import Transaction from "./models/transaction"
import CartItem from "./models/cart-item"
import SavedItem from "./models/saved-item"

class AuctionModuleService extends MedusaService({
  AuctionBlock,
  BlockItem,
  Bid,
  Transaction,
  CartItem,
  SavedItem,
}) {
  // MedusaService auto-generates CRUD methods for all 6 models
}

export default AuctionModuleService
