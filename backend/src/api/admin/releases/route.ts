import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/releases — Search & browse releases (from tape-mag-mvp Release table)
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
    category,
    year,
    year_from,
    year_to,
    country,
    label,
    auction_status,
    sort = "title_asc",
    limit = "20",
    offset = "0",
  } = req.query

  let query = pgConnection("Release")
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
      "Release.estimated_value",
      "Release.legacy_price",
      "Release.shop_price",
      "Release.auction_status",
      "Artist.name as artist_name",
      "Label.name as label_name",
      "Format.name as format_name",
      "Format.format_group"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("Format", "Release.format_id", "Format.id")

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

  // Exact year or year range
  if (year && typeof year === "string") {
    query = query.where("Release.year", parseInt(year))
  } else {
    if (year_from && typeof year_from === "string") {
      query = query.where("Release.year", ">=", parseInt(year_from))
    }
    if (year_to && typeof year_to === "string") {
      query = query.where("Release.year", "<=", parseInt(year_to))
    }
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

  if (category && typeof category === "string") {
    switch (category) {
      case "tapes":
        query = query.where("Release.product_category", "release").where("Format.kat", 1)
        break
      case "vinyl":
        query = query.where("Release.product_category", "release").where("Format.kat", 2)
        break
      case "band_literature":
        query = query.where("Release.product_category", "band_literature")
        break
      case "label_literature":
        query = query.where("Release.product_category", "label_literature")
        break
      case "press_literature":
        query = query.where("Release.product_category", "press_literature")
        break
    }
  }

  // Count
  const countQuery = query.clone().clearSelect().count("Release.id as count").first()
  const countResult = await countQuery
  const count = Number(countResult?.count || 0)

  // Sorting
  const sortMap: Record<string, [string, string]> = {
    title_asc: ["Release.title", "asc"],
    title_desc: ["Release.title", "desc"],
    year_asc: ["Release.year", "asc"],
    year_desc: ["Release.year", "desc"],
    artist_asc: ["Artist.name", "asc"],
    artist_desc: ["Artist.name", "desc"],
  }
  const [sortCol, sortDir] = sortMap[sort as string] || sortMap.title_asc

  const releases = await query
    .orderBy(sortCol, sortDir)
    .limit(parseInt(limit as string))
    .offset(parseInt(offset as string))

  res.json({ releases, count })
}
