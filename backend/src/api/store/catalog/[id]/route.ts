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
      "Release.artistId",
      "Release.labelId",
      "Release.pressOrgaId",
      "Artist.name as artist_name",
      "Label.name as label_name",
      "Format.name as format_name",
      "Format.format_group",
      "PressOrga.name as pressorga_name"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .leftJoin("PressOrga", "Release.pressOrgaId", "PressOrga.id")
    .where("Release.id", id)
    .first()

  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  // Images
  const images = await pgConnection("Image")
    .select("id", "url", "alt")
    .where("releaseId", id)
    .limit(20)

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
          "Label.name as label_name"
        )
        .leftJoin("Artist", "Release.artistId", "Artist.id")
        .leftJoin("Label", "Release.labelId", "Label.id")
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
          "Label.name as label_name"
        )
        .leftJoin("Artist", "Release.artistId", "Artist.id")
        .leftJoin("Label", "Release.labelId", "Label.id")
        .where("Release.labelId", release.labelId)
        .andWhereNot("Release.id", id)
        .orderBy("Release.year", "desc")
        .limit(50)
    : []

  res.json({
    release: {
      ...release,
      images,
      various_artists,
      comments,
      related_by_artist,
      related_by_label,
    },
  })
}
