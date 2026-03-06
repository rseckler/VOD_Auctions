import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import AuctionModuleService from "../../../../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../../../../modules/auction"

// GET /store/auction-blocks/:slug/items/:itemId — Public: item detail + release data
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { slug, itemId } = req.params

  // Verify block exists and is public
  const [blocks] = await auctionService.listAndCountAuctionBlocks(
    { slug },
    { limit: 1 }
  )

  if (!blocks.length || !["scheduled", "preview", "active", "ended"].includes(blocks[0].status)) {
    res.status(404).json({ message: "Block not found" })
    return
  }

  const block = blocks[0]

  // Get the item
  const [items] = await auctionService.listAndCountBlockItems(
    { id: itemId, auction_block_id: block.id },
    { limit: 1 }
  )

  if (!items.length) {
    res.status(404).json({ message: "Item not found" })
    return
  }

  const item = items[0]

  // Get release data with images + extended fields
  const release = await pgConnection("Release")
    .select(
      "Release.id",
      "Release.title",
      "Release.slug",
      "Release.format",
      "Release.year",
      "Release.country",
      "Release.coverImage",
      "Release.catalogNumber",
      "Release.article_number",
      "Release.estimated_value",
      "Release.description",
      "Release.media_condition",
      "Release.sleeve_condition",
      "Release.legacy_price",
      "Release.legacy_condition",
      "Release.legacy_format_detail",
      "Release.tracklist",
      "Release.credits",
      "Release.discogs_id",
      "Release.discogs_lowest_price",
      "Release.discogs_median_price",
      "Release.discogs_highest_price",
      "Artist.name as artist_name",
      "Label.name as label_name"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .where("Release.id", item.release_id)
    .first()

  if (!release) {
    res.status(404).json({ message: "Item not found" })
    return
  }

  // Get images for this release
  const images = await pgConnection("Image")
    .select("id", "url", "alt")
    .where("releaseId", item.release_id)
    .limit(50)

  // Get various artists (for compilations)
  const variousArtists = await pgConnection("ReleaseArtist")
    .select("Artist.name as artist_name", "ReleaseArtist.role")
    .leftJoin("Artist", "ReleaseArtist.artistId", "Artist.id")
    .where("ReleaseArtist.releaseId", item.release_id)

  // Get comments
  const comments = await pgConnection("Comment")
    .select("id", "content", "rating", "legacy_date", "createdAt")
    .where("releaseId", item.release_id)
    .andWhere("approved", true)
    .orderBy("legacy_date", "desc")
    .limit(50)

  res.json({
    block_item: {
      id: item.id,
      release_id: item.release_id,
      start_price: item.start_price,
      estimated_value: item.estimated_value,
      current_price: item.current_price,
      bid_count: item.bid_count,
      lot_number: item.lot_number,
      lot_end_time: item.lot_end_time,
      status: item.status,
      release: release
        ? { ...release, images, various_artists: variousArtists, comments }
        : null,
    },
    auction_block: {
      id: block.id,
      title: block.title,
      slug: block.slug,
      status: block.status,
    },
  })
}
