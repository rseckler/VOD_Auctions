import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/media — Enhanced release list with Discogs data
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const {
    q,
    format,
    year_from,
    year_to,
    country,
    label,
    auction_status,
    has_discogs,
    has_price,
    sort = "title_asc",
    limit = "25",
    offset = "0",
  } = req.query

  let query = pgConnection("Release")
    .select(
      "Release.id",
      "Release.title",
      "Release.slug",
      "Release.format",
      "Release.year",
      "Release.country",
      "Release.coverImage",
      "Release.catalogNumber",
      "Release.barcode",
      "Release.estimated_value",
      "Release.auction_status",
      "Release.media_condition",
      "Release.sleeve_condition",
      "Release.discogs_id",
      "Release.discogs_lowest_price",
      "Release.discogs_num_for_sale",
      "Release.discogs_have",
      "Release.discogs_want",
      "Release.discogs_last_synced",
      "Release.legacy_last_synced",
      "Artist.name as artist_name",
      "Label.name as label_name"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")

  // Full-text search on title + artist name + catalog number
  if (q && typeof q === "string" && q.trim()) {
    const search = `%${q.trim()}%`
    query = query.where(function () {
      this.whereILike("Release.title", search)
        .orWhereILike("Artist.name", search)
        .orWhereILike("Release.catalogNumber", search)
    })
  }

  if (format && typeof format === "string") {
    query = query.where("Release.format", format)
  }

  if (year_from && typeof year_from === "string") {
    query = query.where("Release.year", ">=", parseInt(year_from))
  }
  if (year_to && typeof year_to === "string") {
    query = query.where("Release.year", "<=", parseInt(year_to))
  }

  if (country && typeof country === "string") {
    query = query.where("Release.country", country)
  }

  if (label && typeof label === "string" && label.trim()) {
    query = query.whereILike("Label.name", `%${label.trim()}%`)
  }

  if (auction_status && typeof auction_status === "string") {
    query = query.where("Release.auction_status", auction_status)
  }

  // Discogs filters
  if (has_discogs === "true") {
    query = query.whereNotNull("Release.discogs_id")
  }
  if (has_discogs === "false") {
    query = query.whereNull("Release.discogs_id")
  }
  if (has_price === "true") {
    query = query.whereNotNull("Release.discogs_lowest_price")
  }
  if (has_price === "false") {
    query = query.whereNull("Release.discogs_lowest_price")
  }

  // Count before pagination
  const countQuery = query
    .clone()
    .clearSelect()
    .clearOrder()
    .count("Release.id as count")
    .first()

  // Sorting
  const sortMap: Record<string, [string, string]> = {
    title_asc: ["Release.title", "asc"],
    title_desc: ["Release.title", "desc"],
    artist_asc: ["Artist.name", "asc"],
    artist_desc: ["Artist.name", "desc"],
    year_asc: ["Release.year", "asc"],
    year_desc: ["Release.year", "desc"],
    country_asc: ["Release.country", "asc"],
    country_desc: ["Release.country", "desc"],
    label_asc: ["Label.name", "asc"],
    label_desc: ["Label.name", "desc"],
    price_asc: ["Release.discogs_lowest_price", "asc"],
    price_desc: ["Release.discogs_lowest_price", "desc"],
    synced_asc: ["Release.discogs_last_synced", "asc"],
    synced_desc: ["Release.discogs_last_synced", "desc"],
  }
  // Support both "field_dir" and "field:dir" formats
  const sortKey = (sort as string).replace(":", "_")
  const [sortCol, sortDir] = sortMap[sortKey] || sortMap.title_asc

  const [releases, countResult] = await Promise.all([
    query
      .orderBy(sortCol, sortDir)
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string)),
    countQuery,
  ])

  res.json({
    releases,
    count: Number(countResult?.count || 0),
  })
}
