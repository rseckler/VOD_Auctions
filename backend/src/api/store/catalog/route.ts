import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /store/catalog — Public: browse releases (paginated, searchable)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const {
    page = "1",
    limit = "24",
    search,
    format,
    sort = "title",
    order = "asc",
  } = req.query as Record<string, string>

  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit)
  const pageSize = Math.min(100, parseInt(limit))

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
      "Release.legacy_condition",
      "Release.legacy_price",
      "Release.legacy_format_detail",
      "Artist.name as artist_name",
      "Label.name as label_name"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")

  let countQuery = pgConnection("Release")

  // Search filter
  if (search && typeof search === "string" && search.trim()) {
    const term = `%${search.trim()}%`
    query = query.where(function () {
      this.whereILike("Release.title", term)
        .orWhereILike("Release.catalogNumber", term)
        .orWhereILike("Artist.name", term)
        .orWhereILike("Label.name", term)
    })
    countQuery = countQuery
      .leftJoin("Artist", "Release.artistId", "Artist.id")
      .leftJoin("Label", "Release.labelId", "Label.id")
      .where(function () {
        this.whereILike("Release.title", term)
          .orWhereILike("Release.catalogNumber", term)
          .orWhereILike("Artist.name", term)
          .orWhereILike("Label.name", term)
      })
  }

  // Format filter
  if (format && typeof format === "string") {
    query = query.where("Release.format", format)
    countQuery = countQuery.where("Release.format", format)
  }

  // Count total
  const [{ count: total }] = await countQuery.count("Release.id as count")

  // Sort
  const sortField =
    sort === "price" ? `"Release"."legacy_price"`
    : sort === "year" ? `"Release"."year"`
    : sort === "artist" ? `"Artist"."name"`
    : `"Release"."title"`
  const sortOrder = order === "desc" ? "desc" : "asc"

  query = query
    .orderByRaw(`${sortField} ${sortOrder} NULLS LAST`)
    .offset(offset)
    .limit(pageSize)

  const releases = await query

  res.json({
    releases,
    total: parseInt(String(total)),
    page: parseInt(page),
    limit: pageSize,
    pages: Math.ceil(parseInt(String(total)) / pageSize),
  })
}
