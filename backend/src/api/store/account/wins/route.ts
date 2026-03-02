import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /store/account/wins — My won items
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Anmeldung erforderlich" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const wins = await pgConnection("bid")
    .select(
      "bid.id as bid_id",
      "bid.amount as winning_amount",
      "bid.created_at as bid_date",
      "block_item.id as item_id",
      "block_item.release_id",
      "block_item.current_price",
      "block_item.lot_number",
      "block_item.status as item_status",
      "auction_block.id as block_id",
      "auction_block.title as block_title",
      "auction_block.slug as block_slug"
    )
    .join("block_item", "bid.block_item_id", "block_item.id")
    .join("auction_block", "block_item.auction_block_id", "auction_block.id")
    .where("bid.user_id", customerId)
    .where("bid.is_winning", true)
    .where("block_item.status", "sold")
    .orderBy("bid.created_at", "desc")

  // Enrich with Release data
  const releaseIds = [...new Set(wins.map((w: any) => w.release_id).filter(Boolean))]
  let releaseMap = new Map()
  if (releaseIds.length > 0) {
    const releases = await pgConnection("Release")
      .select(
        "Release.id",
        "Release.title",
        "Release.coverImage",
        "Release.format",
        "Artist.name as artist_name"
      )
      .leftJoin("Artist", "Release.artistId", "Artist.id")
      .whereIn("Release.id", releaseIds)

    releaseMap = new Map(releases.map((r: any) => [r.id, r]))
  }

  const enriched = wins.map((win: any) => {
    const rel = releaseMap.get(win.release_id)
    return {
      bid_id: win.bid_id,
      final_price: parseFloat(win.current_price),
      bid_date: win.bid_date,
      item: {
        id: win.item_id,
        lot_number: win.lot_number,
        status: win.item_status,
        release_title: rel?.title || null,
        release_artist: rel?.artist_name || null,
        release_cover: rel?.coverImage || null,
        release_format: rel?.format || null,
      },
      block: {
        id: win.block_id,
        title: win.block_title,
        slug: win.block_slug,
      },
    }
  })

  res.json({ wins: enriched, count: enriched.length })
}
