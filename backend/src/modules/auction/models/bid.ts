import { model } from "@medusajs/framework/utils"

const Bid = model.define("bid", {
  id: model.id().primaryKey(),

  // FK to block_item
  block_item: model.belongsTo(() => BlockItem, { mappedBy: "bids" }),

  // Medusa customer ID (ULID text)
  user_id: model.text(),

  // Bid amounts
  amount: model.float(),
  max_amount: model.float().nullable(),

  // Status
  is_winning: model.boolean().default(false),
  is_outbid: model.boolean().default(false),
})

export default Bid

// Forward reference
import BlockItem from "./block-item"
