import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { rudderTrack } from "../../../../lib/rudderstack"

// GET /store/account/saved — List saved items
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

  const items = await pgConnection("saved_item")
    .select(
      "saved_item.id",
      "saved_item.release_id",
      "saved_item.created_at",
      "Release.title",
      "Release.coverImage",
      "Release.format",
      "Release.sale_mode",
      "Release.direct_price",
      "Release.auction_status",
      "Release.legacy_price",
      "Artist.name as artist_name"
    )
    .join("Release", "Release.id", "saved_item.release_id")
    .leftJoin("Artist", "Artist.id", "Release.artistId")
    .where("saved_item.user_id", customerId)
    .whereNull("saved_item.deleted_at")
    .orderBy("saved_item.created_at", "desc")

  res.json({ items, count: items.length })
}

// POST /store/account/saved — Save item for later
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

  // Verify release exists
  const release = await pgConnection("Release")
    .where("id", release_id)
    .first()

  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  // Check if already saved
  const existing = await pgConnection("saved_item")
    .where({ user_id: customerId, release_id })
    .whereNull("deleted_at")
    .first()

  if (existing) {
    res.status(409).json({ message: "Item is already saved" })
    return
  }

  const [item] = await pgConnection("saved_item")
    .insert({
      id: generateEntityId(),
      user_id: customerId,
      release_id,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning("*")

  rudderTrack(customerId, "Item Saved", { release_id })

  res.status(201).json({ item })
}
