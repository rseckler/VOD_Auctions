import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireCommunityEnabled } from "../../../../lib/community"

// GET /store/community/tags — trending tags (public)
//
// Aggregates the tags[] array across published posts. Query: limit (max 50).
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const limit = Math.min(Number(req.query.limit) || 24, 50)

  const rows = await pg
    .select(pg.raw("lower(tag) as tag"), pg.raw("count(*)::int as count"))
    .from(
      pg.raw(
        "community_post p, unnest(p.tags) as tag"
      ) as unknown as string
    )
    .where("p.status", "published")
    .groupByRaw("lower(tag)")
    .orderByRaw("count(*) desc, lower(tag) asc")
    .limit(limit)

  res.json({
    tags: rows.map((r: any) => ({ tag: r.tag, count: Number(r.count) })),
  })
}
