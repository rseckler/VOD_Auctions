import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const pgConnection = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION)

  const q = (req.query.q as string || "").trim()
  const limit = Math.min(Number(req.query.limit) || 8, 20)

  if (q.length < 2) {
    return res.json({ releases: [], artists: [], labels: [] })
  }

  const searchPattern = `%${q}%`

  try {
    const [releases, artists, labels] = await Promise.all([
      // Releases: title, artist match
      pgConnection
        .select(
          "Release.id",
          "Release.title",
          "Release.coverImage",
          "Release.format",
          "Release.year",
          "Artist.name as artist_name",
          "Artist.slug as artist_slug",
        )
        .from("Release")
        .leftJoin("Artist", "Release.artistId", "Artist.id")
        .where(function () {
          this.whereILike("Release.title", searchPattern)
            .orWhereILike("Release.catalogNumber", searchPattern)
            .orWhereILike("Artist.name", searchPattern)
        })
        .andWhereNot("Release.coverImage", null)
        .orderByRaw(
          `CASE WHEN "Release"."title" ILIKE ? THEN 0 WHEN "Artist"."name" ILIKE ? THEN 1 ELSE 2 END`,
          [searchPattern, searchPattern]
        )
        .limit(Math.ceil(limit * 0.6)),

      // Artists: distinct matches
      pgConnection
        .select("Artist.name", "Artist.slug")
        .from("Artist")
        .whereILike("Artist.name", searchPattern)
        .orderByRaw(
          `CASE WHEN "Artist"."name" ILIKE ? THEN 0 ELSE 1 END`,
          [`${q}%`]
        )
        .limit(Math.ceil(limit * 0.2)),

      // Labels: distinct matches
      pgConnection
        .select("Label.name", "Label.slug")
        .from("Label")
        .whereILike("Label.name", searchPattern)
        .orderByRaw(
          `CASE WHEN "Label"."name" ILIKE ? THEN 0 ELSE 1 END`,
          [`${q}%`]
        )
        .limit(Math.ceil(limit * 0.2)),
    ])

    res.json({ releases, artists, labels })
  } catch (error) {
    console.error("[catalog/suggest] Search error:", error)
    res.json({ releases: [], artists: [], labels: [] })
  }
}
