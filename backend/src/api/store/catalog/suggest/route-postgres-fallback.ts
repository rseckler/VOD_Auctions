import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { buildReleaseSearchSubquery } from "../../../../lib/release-search"

/**
 * Postgres-FTS suggest handler — pre-Meilisearch implementation.
 *
 * Exported so the new Meili-backed route.ts can fall through when the flag
 * is off, the health-probe tripped, or a Meili runtime error is caught.
 */
export async function suggestGetPostgres(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection = req.scope.resolve<Knex>(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const q = (req.query.q as string || "").trim()
  const limit = Math.min(Number(req.query.limit) || 8, 20)

  if (q.length < 2) {
    res.json({ releases: [], artists: [], labels: [] })
    return
  }

  const searchPattern = `%${q}%`
  const lowerPattern = `%${q.toLowerCase()}%`
  const prefixLower = `${q.toLowerCase()}%`

  const releasesSubquery = buildReleaseSearchSubquery(pgConnection, q)

  try {
    const [releases, artists, labels] = await Promise.all([
      releasesSubquery
        ? pgConnection
            .select(
              "Release.id",
              "Release.title",
              "Release.coverImage",
              "Release.format",
      "Release.format_v2",
              "Release.year",
              "Artist.name as artist_name",
              "Artist.slug as artist_slug",
            )
            .from("Release")
            .leftJoin("Artist", "Release.artistId", "Artist.id")
            .whereIn("Release.id", releasesSubquery)
            .andWhereNot("Release.coverImage", null)
            .orderByRaw(
              `CASE WHEN "Release"."title" ILIKE ? THEN 0 WHEN "Artist"."name" ILIKE ? THEN 1 ELSE 2 END`,
              [searchPattern, searchPattern]
            )
            .limit(Math.ceil(limit * 0.6))
        : Promise.resolve([]),

      pgConnection
        .select("Artist.name", "Artist.slug")
        .from("Artist")
        .whereRaw(`lower("Artist".name) LIKE ?`, [lowerPattern])
        .orderByRaw(
          `CASE WHEN lower("Artist"."name") LIKE ? THEN 0 ELSE 1 END`,
          [prefixLower]
        )
        .limit(Math.ceil(limit * 0.2)),

      pgConnection
        .select("Label.name", "Label.slug")
        .from("Label")
        .whereRaw(`lower("Label".name) LIKE ?`, [lowerPattern])
        .orderByRaw(
          `CASE WHEN lower("Label"."name") LIKE ? THEN 0 ELSE 1 END`,
          [prefixLower]
        )
        .limit(Math.ceil(limit * 0.2)),
    ])

    res.json({ releases, artists, labels })
  } catch (error) {
    console.error("[catalog/suggest] Postgres search error:", error)
    res.json({ releases: [], artists: [], labels: [] })
  }
}
