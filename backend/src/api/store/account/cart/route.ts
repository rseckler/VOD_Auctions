import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { isAvailableForDirectPurchase } from "../../../../lib/auction-helpers"
import { rudderTrack } from "../../../../lib/rudderstack"

// GET /store/account/cart — List cart items
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const items = await pgConnection("cart_item")
    .select(
      "cart_item.id",
      "cart_item.release_id",
      "cart_item.price",
      "cart_item.created_at",
      "Release.title",
      "Release.coverImage",
      "Release.format",
      "Release.sale_mode",
      "Release.direct_price",
      "Release.auction_status",
      "Artist.name as artist_name"
    )
    .join("Release", "Release.id", "cart_item.release_id")
    .leftJoin("Artist", "Artist.id", "Release.artistId")
    .where("cart_item.user_id", customerId)
    .whereNull("cart_item.deleted_at")
    .orderBy("cart_item.created_at", "desc")

  res.json({ items, count: items.length })
}

// POST /store/account/cart — Add item to cart
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const { release_id } = req.body as { release_id: string }
  if (!release_id) {
    res.status(400).json({ message: "release_id is required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  // Check if release is available for direct purchase
  const { available, release, reason } = await isAvailableForDirectPurchase(pgConnection, release_id)
  if (!available) {
    res.status(400).json({ message: reason })
    return
  }

  // Check if already in cart
  const existing = await pgConnection("cart_item")
    .where({ user_id: customerId, release_id })
    .whereNull("deleted_at")
    .first()

  if (existing) {
    res.status(409).json({ message: "Item is already in your cart" })
    return
  }

  const [item] = await pgConnection("cart_item")
    .insert({
      id: generateEntityId(),
      user_id: customerId,
      release_id,
      price: Number(release.direct_price),
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning("*")

  rudderTrack(customerId, "Cart Item Added", {
    release_id,
    price: Number(release.direct_price),
  })

  res.status(201).json({ item })
}
