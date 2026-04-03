import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { createHash } from "crypto"
import AuctionModuleService from "../../../../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../../../../modules/auction"

// Simple IP-based view dedup: Map<itemId, Set<ipHash>>
const recentViews = new Map<string, Set<string>>()
const DEDUP_TTL = 24 * 60 * 60 * 1000 // 24h
let lastCleanup = Date.now()

function shouldCountView(itemId: string, ip: string): boolean {
  // Periodic cleanup every hour
  if (Date.now() - lastCleanup > 60 * 60 * 1000) {
    recentViews.clear()
    lastCleanup = Date.now()
  }
  const ipHash = createHash("sha256").update(ip).digest("hex").substring(0, 12)
  const key = `${itemId}:${ipHash}`
  if (!recentViews.has(itemId)) recentViews.set(itemId, new Set())
  const views = recentViews.get(itemId)!
  if (views.has(key)) return false
  views.add(key)
  return true
}

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

  // Increment view count (deduplicated by IP, fire-and-forget)
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown"
  if (shouldCountView(itemId, clientIp)) {
    pgConnection("block_item")
      .where("id", itemId)
      .increment("view_count", 1)
      .catch(() => {})
  }

  // Get release data with images + extended fields
  const release = await pgConnection("Release")
    .select(
      "Release.id",
      "Release.title",
      "Release.slug",
      "Release.product_category",
      "Release.format",
      "Release.format_id",
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
      "Artist.slug as artist_slug",
      "Label.name as label_name",
      "Label.slug as label_slug",
      "PressOrga.name as press_orga_name",
      "PressOrga.slug as press_orga_slug",
      "Format.name as format_name"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("PressOrga", "Release.pressOrgaId", "PressOrga.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .where("Release.id", item.release_id)
    .first()

  if (!release) {
    res.status(404).json({ message: "Item not found" })
    return
  }

  // Get images for this release
  // Images — ordered by rang (legacy bilder_1 position), then id
  const images = await pgConnection("Image")
    .select("id", "url", "alt", "rang")
    .where("releaseId", item.release_id)
    .orderBy("rang", "asc")
    .orderBy("id", "asc")

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

  const currentPrice = parseFloat(item.current_price ?? item.start_price)
  const reservePrice = item.reserve_price ? parseFloat(item.reserve_price) : null
  const reserveMet: boolean | null = reservePrice !== null
    ? currentPrice >= reservePrice
    : null

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
      reserve_met: reserveMet,
      view_count: item.view_count || 0,
      extension_count: item.extension_count || 0,
      release: release
        ? { ...release, images, various_artists: variousArtists, comments }
        : null,
    },
    auction_block: {
      id: block.id,
      title: block.title,
      slug: block.slug,
      status: block.status,
      start_time: block.start_time,
      end_time: block.end_time,
    },
  })
}
