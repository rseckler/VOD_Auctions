import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import AuctionModuleService from "../../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../../modules/auction"

// GET /store/auction-blocks/:slug — Public: block detail with items + release data
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const slug = req.params.slug

  // Find block by slug
  const [blocks] = await auctionService.listAndCountAuctionBlocks(
    { slug },
    { relations: ["items"], limit: 1 }
  )

  if (!blocks.length) {
    res.status(404).json({ message: "Block not found" })
    return
  }

  const block = blocks[0]

  // Only show published blocks
  if (!["scheduled", "preview", "active", "ended"].includes(block.status)) {
    res.status(404).json({ message: "Block not found" })
    return
  }

  // Enrich items with release data
  const items = block.items || []
  const releaseIds = items.map((item: any) => item.release_id).filter(Boolean)

  let releasesMap: Record<string, any> = {}
  if (releaseIds.length > 0) {
    const releases = await pgConnection("Release")
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
        "Release.legacy_condition",
        "Release.legacy_price",
        "Artist.name as artist_name",
        "Artist.slug as artist_slug",
        "Label.name as label_name",
        "Label.slug as label_slug"
      )
      .leftJoin("Artist", "Release.artistId", "Artist.id")
      .leftJoin("Label", "Release.labelId", "Label.id")
      .whereIn("Release.id", releaseIds)

    for (const r of releases) {
      releasesMap[r.id] = r
    }
  }

  const enrichedItems = items
    .map((item: any) => ({
      id: item.id,
      release_id: item.release_id,
      start_price: item.start_price,
      estimated_value: item.estimated_value,
      current_price: item.current_price,
      bid_count: item.bid_count,
      lot_number: item.lot_number,
      lot_end_time: item.lot_end_time,
      status: item.status,
      release: releasesMap[item.release_id] || null,
    }))
    .filter((item: any) => {
      const r = item.release
      return r != null
    })
    .sort((a: any, b: any) => (a.lot_number || 999) - (b.lot_number || 999))

  res.json({
    auction_block: {
      ...block,
      items: enrichedItems,
    },
  })
}
