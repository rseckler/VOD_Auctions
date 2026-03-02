import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/releases — Search releases (from tape-mag-mvp Release table)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { q, format, year, limit = "20", offset = "0" } = req.query

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
      "Release.estimated_value",
      "Release.auction_status",
      "Artist.name as artist_name",
      "Label.name as label_name"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")

  // Full-text search on title + artist name
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

  if (year && typeof year === "string") {
    query = query.where("Release.year", parseInt(year))
  }

  const countQuery = query.clone().clearSelect().count("Release.id as count").first()
  const countResult = await countQuery
  const count = Number(countResult?.count || 0)

  const releases = await query
    .orderBy("Release.title", "asc")
    .limit(parseInt(limit as string))
    .offset(parseInt(offset as string))

  res.json({ releases, count })
}
