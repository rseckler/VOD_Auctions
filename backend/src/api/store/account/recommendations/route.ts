import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /store/account/recommendations?release_ids=id1,id2&limit=8
// Returns related purchasable releases for cross-sell
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { release_ids, limit = "8" } = req.query as Record<string, string>

  if (!release_ids) {
    res.json({ recommendations: [] })
    return
  }

  const inputIds = release_ids.split(",").map((id) => id.trim()).filter(Boolean)
  if (inputIds.length === 0) {
    res.json({ recommendations: [] })
    return
  }

  const maxResults = Math.min(parseInt(limit) || 8, 20)

  // Purchasable filter used across all queries
  const purchasableFilter = (q: Knex.QueryBuilder) =>
    q.where("Release.legacy_available", true)
      .where("Release.legacy_price", ">", 0)
      .whereNotNull("Release.coverImage")
      .whereNotIn("Release.id", inputIds)

  // Look up artists + labels for the input releases
  const sourceReleases = await pgConnection("Release")
    .select("Release.artistId", "Release.labelId")
    .whereIn("Release.id", inputIds)

  const artistIds = [...new Set(sourceReleases.map((r: any) => r.artistId).filter(Boolean))]
  const labelIds = [...new Set(sourceReleases.map((r: any) => r.labelId).filter(Boolean))]

  type RecommendationRow = {
    id: string
    title: string
    coverImage: string
    artist_name: string | null
    legacy_price: number
    format: string | null
    reason: string
  }

  const results: RecommendationRow[] = []
  const seenIds = new Set<string>()

  // Helper to add results without duplicates
  function addResults(rows: any[], reason: string) {
    for (const row of rows) {
      if (seenIds.has(row.id) || results.length >= maxResults) continue
      seenIds.add(row.id)
      results.push({
        id: row.id,
        title: row.title,
        coverImage: row.coverImage,
        artist_name: row.artist_name || null,
        legacy_price: Number(row.legacy_price),
        format: row.format || null,
        reason,
      })
    }
  }

  // 1. Same Artist
  if (artistIds.length > 0 && results.length < maxResults) {
    const artistReleases = await purchasableFilter(
      pgConnection("Release")
        .select(
          "Release.id",
          "Release.title",
          "Release.coverImage",
          "Release.legacy_price",
          "Release.format",
          "Artist.name as artist_name"
        )
        .leftJoin("Artist", "Release.artistId", "Artist.id")
        .whereIn("Release.artistId", artistIds)
    )
      .orderByRaw("RANDOM()")
      .limit(maxResults)

    addResults(artistReleases, "same_artist")
  }

  // 2. Same Label
  if (labelIds.length > 0 && results.length < maxResults) {
    const labelReleases = await purchasableFilter(
      pgConnection("Release")
        .select(
          "Release.id",
          "Release.title",
          "Release.coverImage",
          "Release.legacy_price",
          "Release.format",
          "Artist.name as artist_name"
        )
        .leftJoin("Artist", "Release.artistId", "Artist.id")
        .whereIn("Release.labelId", labelIds)
    )
      .orderByRaw("RANDOM()")
      .limit(maxResults)

    addResults(labelReleases, "same_label")
  }

  // 3. Popular (most saved_item counts)
  if (results.length < maxResults) {
    const popularReleases = await purchasableFilter(
      pgConnection("Release")
        .select(
          "Release.id",
          "Release.title",
          "Release.coverImage",
          "Release.legacy_price",
          "Release.format",
          "Artist.name as artist_name"
        )
        .leftJoin("Artist", "Release.artistId", "Artist.id")
        .leftJoin(
          pgConnection("saved_item")
            .select("release_id")
            .count("* as save_count")
            .whereNull("deleted_at")
            .groupBy("release_id")
            .as("saves"),
          "saves.release_id",
          "Release.id"
        )
    )
      .orderByRaw("COALESCE(saves.save_count, 0) DESC, RANDOM()")
      .limit(maxResults)

    addResults(popularReleases, "popular")
  }

  res.json({ recommendations: results })
}
