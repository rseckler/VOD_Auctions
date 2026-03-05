import { MedusaService } from "@medusajs/framework/utils"
import AuctionBlock from "./models/auction-block"
import BlockItem from "./models/block-item"
import Bid from "./models/bid"
import Transaction from "./models/transaction"
import CartItem from "./models/cart-item"

class AuctionModuleService extends MedusaService({
  AuctionBlock,
  BlockItem,
  Bid,
  Transaction,
  CartItem,
}) {
  // MedusaService auto-generates CRUD methods for all 5 models
}

export default AuctionModuleService
