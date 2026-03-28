import { model } from "@medusajs/framework/utils"
import AuctionBlock from "./auction-block"

const BlockItem = model.define("block_item", {
  id: model.id().primaryKey(),

  // FK to auction_block
  auction_block: model.belongsTo(() => AuctionBlock, { mappedBy: "items" }),

  // FK to Release table (text ID, not Medusa managed)
  release_id: model.text(),

  // Preise
  estimated_value: model.float().nullable(),
  start_price: model.float(),
  reserve_price: model.float().nullable(),
  buy_now_price: model.float().nullable(),

  // Auktionsstatus
  current_price: model.float().nullable(),
  bid_count: model.number().default(0),
  lot_number: model.number().nullable(),
  lot_end_time: model.dateTime().nullable(),

  // Status: reserved | active | sold | unsold
  status: model.text().default("reserved"),

  // View tracking
  view_count: model.number().default(0),

  // Relations
  bids: model.hasMany(() => Bid),
  // Note: transactions use plain block_item_id text FK (nullable), not a Medusa ORM relation
})

export default BlockItem

// Forward references
import Bid from "./bid"
