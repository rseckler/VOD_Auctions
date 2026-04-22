import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { buildReleaseSearchSubquery } from "../../../../lib/release-search"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const pgConnection = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION)

  const q = (req.query.q as string || "").trim()
  const limit = Math.min(Number(req.query.limit) || 8, 20)

  if (q.length < 2) {
    return res.json({ releases: [], artists: [], labels: [] })
  }

  // lower(col) LIKE lower(?) engages the gin_trgm indexes. whereILike alone
  // would not use them because the indexes are on lower(col), not col. See
  // migration 2026-04-22_search_trigram_indexes.sql and
  // feedback_grep_all_callers.md.
  const searchPattern = `%${q}%`
  const lowerPattern = `%${q.toLowerCase()}%`
  const prefixPattern = `${q}%`
  const prefixLower = `${q.toLowerCase()}%`

  // Releases: FTS-basierte Multi-Word-Suche gegen `Release.search_text`.
  // Ranking via CASE auf erstem Token (feinere Heuristik als FTS ranking).
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

      // Artists: single-column lower() LIKE uses idx_artist_name_trgm.
      pgConnection
        .select("Artist.name", "Artist.slug")
        .from("Artist")
        .whereRaw(`lower("Artist".name) LIKE ?`, [lowerPattern])
        .orderByRaw(
          `CASE WHEN lower("Artist"."name") LIKE ? THEN 0 ELSE 1 END`,
          [prefixLower]
        )
        .limit(Math.ceil(limit * 0.2)),

      // Labels: same pattern with idx_label_name_trgm.
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
    console.error("[catalog/suggest] Search error:", error)
    res.json({ releases: [], artists: [], labels: [] })
  }
}
