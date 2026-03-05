import { model } from "@medusajs/framework/utils"

const CartItem = model.define("cart_item", {
  id: model.id().primaryKey(),

  // Medusa customer ID
  user_id: model.text(),

  // FK to Release table (legacy, not Medusa ORM)
  release_id: model.text(),

  // Snapshot of direct_price at time of adding to cart
  price: model.float(),
})

export default CartItem
