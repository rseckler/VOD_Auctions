import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /store/catalog/:id — Public: single release detail
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { id } = req.params

  const release = await pgConnection("Release")
    .select(
      "Release.id",
      "Release.title",
      "Release.slug",
      "Release.format",
      "Release.format_id",
      "Release.product_category",
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
      "Release.discogs_num_for_sale",
      "Release.auction_status",
      "Release.sale_mode",
      "Release.direct_price",
      "Release.inventory",
      "Release.artistId",
      "Release.labelId",
      "Release.pressOrgaId",
      "Artist.name as artist_name",
      "Artist.slug as artist_slug",
      "Label.name as label_name",
      "Label.slug as label_slug",
      "Format.name as format_name",
      "Format.format_group",
      "PressOrga.name as press_orga_name",
      "PressOrga.slug as press_orga_slug"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .leftJoin("PressOrga", "Release.pressOrgaId", "PressOrga.id")
    .where("Release.id", id)
    .whereNotNull("Release.coverImage")
    .first()

  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  // Images — ordered by rang (legacy bilder_1 position), then id
  const images = await pgConnection("Image")
    .select("id", "url", "alt", "rang")
    .where("releaseId", id)
    .orderBy("rang", "asc")
    .orderBy("id", "asc")

  // Various artists
  const various_artists = await pgConnection("ReleaseArtist")
    .select("Artist.name as artist_name", "ReleaseArtist.role")
    .leftJoin("Artist", "ReleaseArtist.artistId", "Artist.id")
    .where("ReleaseArtist.releaseId", id)

  // Comments
  const comments = await pgConnection("Comment")
    .select("id", "content", "rating", "legacy_date", "createdAt")
    .where("releaseId", id)
    .andWhere("approved", true)
    .orderBy("legacy_date", "desc")
    .limit(50)

  // Related releases by same artist
  const related_by_artist = release.artistId
    ? await pgConnection("Release")
        .select(
          "Release.id",
          "Release.title",
          "Release.slug",
          "Release.format",
          "Release.year",
          "Release.country",
          "Release.coverImage",
          "Release.legacy_price",
          "Release.legacy_condition",
          "Artist.name as artist_name",
          "Label.name as label_name",
          "PressOrga.name as press_orga_name",
          "PressOrga.slug as press_orga_slug"
        )
        .leftJoin("Artist", "Release.artistId", "Artist.id")
        .leftJoin("Label", "Release.labelId", "Label.id")
        .leftJoin("PressOrga", "Release.pressOrgaId", "PressOrga.id")
        .where("Release.artistId", release.artistId)
        .andWhereNot("Release.id", id)
        .orderBy("Release.year", "desc")
        .limit(50)
    : []

  // Related releases by same label
  const related_by_label = release.labelId
    ? await pgConnection("Release")
        .select(
          "Release.id",
          "Release.title",
          "Release.slug",
          "Release.format",
          "Release.year",
          "Release.country",
          "Release.coverImage",
          "Release.legacy_price",
          "Release.legacy_condition",
          "Artist.name as artist_name",
          "Label.name as label_name",
          "PressOrga.name as press_orga_name",
          "PressOrga.slug as press_orga_slug"
        )
        .leftJoin("Artist", "Release.artistId", "Artist.id")
        .leftJoin("Label", "Release.labelId", "Label.id")
        .leftJoin("PressOrga", "Release.pressOrgaId", "PressOrga.id")
        .where("Release.labelId", release.labelId)
        .andWhereNot("Release.id", id)
        .orderBy("Release.year", "desc")
        .limit(50)
    : []

  const is_purchasable = release.legacy_price != null && Number(release.legacy_price) > 0

  // Auction lot link — only for publicly visible blocks (preview/active)
  let auction_lot: { block_slug: string; block_item_id: string } | null = null
  if (release.auction_status === "reserved") {
    const lotRow = await pgConnection("block_item")
      .select(
        "block_item.id as block_item_id",
        "auction_block.slug as block_slug"
      )
      .join("auction_block", "auction_block.id", "block_item.auction_block_id")
      .where("block_item.release_id", id)
      .whereIn("auction_block.status", ["preview", "active"])
      .first()
    if (lotRow) {
      auction_lot = { block_slug: lotRow.block_slug, block_item_id: lotRow.block_item_id }
    }
  }

  res.json({
    release: {
      ...release,
      is_purchasable,
      auction_lot,
      images,
      various_artists,
      comments,
      related_by_artist,
      related_by_label,
    },
  })
}
