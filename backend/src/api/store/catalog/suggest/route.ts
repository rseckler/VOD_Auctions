import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { getFeatureFlag } from "../../../../lib/feature-flags"
import { isMeiliEffective } from "../../../../lib/meilisearch"
import { searchReleases } from "../../../../lib/release-search-meili"
import { suggestGetPostgres } from "./route-postgres-fallback"

/**
 * GET /store/catalog/suggest — Autocomplete / "search-as-you-type".
 *
 * Response shape: `{ releases, artists, labels }` — preserved from the
 * rc39 Postgres implementation so the storefront header widget keeps
 * working regardless of which backend answered.
 *
 * When SEARCH_MEILI_CATALOG is on:
 *   - Releases come from Meili (discovery profile, highlight on).
 *   - Artists + Labels come from Postgres trgm-indexed lookups, because
 *     Meili has releases only — artist/label browsing still reads the
 *     `Artist.name` / `Label.name` tables directly.
 *
 * See §5.6 of SEARCH_MEILISEARCH_PLAN.md — Phase 1 keeps artists/labels
 * on Postgres. Phase 2 may add dedicated Meili indexes.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION)
  const q = (req.query.q as string || "").trim()
  const limit = Math.min(Number(req.query.limit) || 8, 20)

  if (q.length < 2) {
    res.json({ releases: [], artists: [], labels: [] })
    return
  }

  // Gate 1: feature flag
  const flagOn = await getFeatureFlag(pg, "SEARCH_MEILI_CATALOG")
  if (!flagOn) {
    return suggestGetPostgres(req, res)
  }

  // Gate 2: effective flag
  if (!isMeiliEffective()) {
    console.log(
      JSON.stringify({
        event: "meili_fallback",
        reason: "health_tripped",
        endpoint: "catalog/suggest",
        query: q,
      })
    )
    return suggestGetPostgres(req, res)
  }

  // Gate 3: Meili releases + Postgres artists/labels
  const lowerPattern = `%${q.toLowerCase()}%`
  const prefixLower = `${q.toLowerCase()}%`
  const releaseLimit = Math.ceil(limit * 0.6)
  const artistLimit = Math.ceil(limit * 0.2)
  const labelLimit = Math.ceil(limit * 0.2)

  try {
    const [meiliResult, artists, labels] = await Promise.all([
      searchReleases({
        query: q,
        ranking: "discovery",
        limit: releaseLimit,
        highlight: true,
        filters: { has_cover: true },
      }),

      pg
        .select("Artist.name", "Artist.slug")
        .from("Artist")
        .whereRaw(`lower("Artist".name) LIKE ?`, [lowerPattern])
        .orderByRaw(
          `CASE WHEN lower("Artist"."name") LIKE ? THEN 0 ELSE 1 END`,
          [prefixLower]
        )
        .limit(artistLimit),

      pg
        .select("Label.name", "Label.slug")
        .from("Label")
        .whereRaw(`lower("Label".name) LIKE ?`, [lowerPattern])
        .orderByRaw(
          `CASE WHEN lower("Label"."name") LIKE ? THEN 0 ELSE 1 END`,
          [prefixLower]
        )
        .limit(labelLimit),
    ])

    // Flatten Meili hit → legacy suggest-shape
    const releases = meiliResult.hits.map((h: any) => ({
      id: h.release_id ?? h.id,
      title: h.title,
      coverImage: h.cover_image,
      format: h.format,
      year: h.year,
      artist_name: h.artist_name,
      artist_slug: h.artist_slug,
      _highlight: h._formatted,
    }))

    res.json({ releases, artists, labels })
  } catch (err: any) {
    console.error(
      JSON.stringify({
        event: "meili_runtime_fallback",
        endpoint: "catalog/suggest",
        error: err?.message,
        query: q,
      })
    )
    return suggestGetPostgres(req, res)
  }
}
