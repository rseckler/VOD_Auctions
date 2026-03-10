import { model } from "@medusajs/framework/utils"

const SavedItem = model.define("saved_item", {
  id: model.id().primaryKey(),

  // Medusa customer ID
  user_id: model.text(),

  // FK to Release table (legacy, not Medusa ORM)
  release_id: model.text(),
})

export default SavedItem
