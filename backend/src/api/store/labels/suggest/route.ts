import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

/**
 * GET /store/labels/suggest?q=<term>&limit=20
 *
 * Label-browse autocomplete — Phase 1 of the Meilisearch migration
 * (SEARCH_MEILISEARCH_PLAN §3.7).
 *
 * We do NOT expose `label_name` as a Meili facet because 3.077 labels
 * is unusable in a sidebar. Instead the UI calls this endpoint, user
 * picks a label, and `label_slug` is then passed as a filter to
 * /store/catalog (which IS a filterable attribute in Meili).
 *
 * Queries against `idx_label_name_trgm` on `lower(Label.name)` — fast
 * enough on 3k rows without needing a dedicated search index.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION)
  const q = (req.query.q as string || "").trim()
  const limit = Math.min(Number(req.query.limit) || 20, 50)

  if (q.length < 2) {
    res.json({ labels: [] })
    return
  }

  const lowerPattern = `%${q.toLowerCase()}%`
  const prefixLower = `${q.toLowerCase()}%`

  const labels = await pg
    .select("Label.id", "Label.name", "Label.slug")
    .from("Label")
    .whereRaw(`lower("Label".name) LIKE ?`, [lowerPattern])
    .orderByRaw(
      `CASE WHEN lower("Label"."name") LIKE ? THEN 0 ELSE 1 END, "Label"."name" ASC`,
      [prefixLower]
    )
    .limit(limit)

  res.json({ labels })
}
