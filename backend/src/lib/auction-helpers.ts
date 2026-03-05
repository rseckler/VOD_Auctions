import { Knex } from "knex"

/**
 * Check if a customer has won at least one auction (bid.is_winning + block_item.status=sold)
 */
export async function hasWonAuction(
  pgConnection: Knex,
  userId: string
): Promise<boolean> {
  const win = await pgConnection("bid")
    .join("block_item", "bid.block_item_id", "block_item.id")
    .where("bid.user_id", userId)
    .where("bid.is_winning", true)
    .where("block_item.status", "sold")
    .whereNull("bid.deleted_at")
    .whereNull("block_item.deleted_at")
    .first()
  return !!win
}

/**
 * Check if a release is available for direct purchase.
 * Returns { available, release, reason? }
 */
export async function isAvailableForDirectPurchase(
  pgConnection: Knex,
  releaseId: string
): Promise<{ available: boolean; release: any; reason?: string }> {
  const release = await pgConnection("Release")
    .select("id", "sale_mode", "direct_price", "auction_status", "title")
    .where("id", releaseId)
    .first()

  if (!release) {
    return { available: false, release: null, reason: "Release not found" }
  }

  if (release.sale_mode !== "direct_purchase" && release.sale_mode !== "both") {
    return { available: false, release, reason: "Item is not available for direct purchase" }
  }

  if (!release.direct_price || Number(release.direct_price) <= 0) {
    return { available: false, release, reason: "Item does not have a direct price set" }
  }

  if (release.auction_status !== "available") {
    return { available: false, release, reason: "Item is currently reserved or in an auction" }
  }

  // Check if item is in an active/scheduled auction block
  const activeBlockItem = await pgConnection("block_item")
    .join("auction_block", "auction_block.id", "block_item.auction_block_id")
    .where("block_item.release_id", releaseId)
    .whereIn("auction_block.status", ["scheduled", "active", "preview"])
    .whereIn("block_item.status", ["reserved", "active"])
    .whereNull("block_item.deleted_at")
    .first()

  if (activeBlockItem) {
    return { available: false, release, reason: "Item is currently in an active auction" }
  }

  return { available: true, release }
}
