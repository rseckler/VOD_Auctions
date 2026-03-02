import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /store/account/bids — My bids with item/block/release info
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

  const bids = await pgConnection("bid")
    .select(
      "bid.id",
      "bid.amount",
      "bid.max_amount",
      "bid.is_winning",
      "bid.is_outbid",
      "bid.created_at",
      "block_item.id as item_id",
      "block_item.release_id",
      "block_item.current_price",
      "block_item.start_price",
      "block_item.bid_count",
      "block_item.status as item_status",
      "block_item.lot_number",
      "auction_block.id as block_id",
      "auction_block.title as block_title",
      "auction_block.slug as block_slug",
      "auction_block.status as block_status"
    )
    .join("block_item", "bid.block_item_id", "block_item.id")
    .join("auction_block", "block_item.auction_block_id", "auction_block.id")
    .where("bid.user_id", customerId)
    .orderBy("bid.created_at", "desc")
    .limit(100)

  // Enrich with Release data
  const releaseIds = [...new Set(bids.map((b: any) => b.release_id).filter(Boolean))]
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

  const enriched = bids.map((bid: any) => {
    const rel = releaseMap.get(bid.release_id)
    return {
      id: bid.id,
      amount: parseFloat(bid.amount),
      is_winning: bid.is_winning,
      is_outbid: bid.is_outbid,
      created_at: bid.created_at,
      item: {
        id: bid.item_id,
        current_price: parseFloat(bid.current_price || bid.start_price),
        status: bid.item_status,
        lot_number: bid.lot_number,
        release_title: rel?.title || null,
        release_artist: rel?.artist_name || null,
        release_cover: rel?.coverImage || null,
        release_format: rel?.format || null,
      },
      block: {
        id: bid.block_id,
        title: bid.block_title,
        slug: bid.block_slug,
        status: bid.block_status,
      },
    }
  })

  res.json({ bids: enriched, count: enriched.length })
}
