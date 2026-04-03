import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const pgConnection = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION)

  try {
    const [formats, countries, decades, genres] = await Promise.all([
      // Format counts
      pgConnection("Release")
        .select("format")
        .count("* as count")
        .whereNotNull("Release.coverImage")
        .whereNotNull("Release.format")
        .groupBy("format")
        .orderBy("count", "desc")
        .limit(30),

      // Country counts (top 20)
      pgConnection("Release")
        .select("country")
        .count("* as count")
        .whereNotNull("Release.coverImage")
        .whereNotNull("Release.country")
        .where("Release.country", "!=", "")
        .groupBy("country")
        .orderBy("count", "desc")
        .limit(20),

      // Decade counts
      pgConnection.raw(`
        SELECT (year / 10 * 10) as decade, COUNT(*) as count
        FROM "Release"
        WHERE "coverImage" IS NOT NULL AND year IS NOT NULL AND year > 0
        GROUP BY (year / 10 * 10)
        ORDER BY decade
      `),

      // Genre counts from entity_content
      pgConnection.raw(`
        SELECT unnest(genre_tags) as genre, COUNT(*) as count
        FROM entity_content
        WHERE entity_type = 'artist' AND is_published = true AND genre_tags IS NOT NULL
        GROUP BY genre
        ORDER BY count DESC
        LIMIT 30
      `),
    ])

    res.json({
      formats: formats.map((r: Record<string, unknown>) => ({ value: r.format, count: Number(r.count) })),
      countries: countries.map((r: Record<string, unknown>) => ({ value: r.country, count: Number(r.count) })),
      decades: (decades.rows || decades).map((r: Record<string, unknown>) => ({ value: Number(r.decade), count: Number(r.count) })),
      genres: (genres.rows || genres).map((r: Record<string, unknown>) => ({ value: r.genre, count: Number(r.count) })),
    })
  } catch (error) {
    console.error("[catalog/facets] Error:", error)
    res.json({ formats: [], countries: [], decades: [], genres: [] })
  }
}
