import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireCommunityEnabled } from "../../../../lib/community"

// GET /admin/community/profiles — member list for the admin hub.
//
// Query: q (handle/display_name), tier, limit, offset
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const q = ((req.query.q as string) || "").trim()
  const tier = req.query.tier as string | undefined
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  let base = pg("community_profile")
  if (tier) base = base.where("tier", tier)
  if (q) {
    const like = `%${q.toLowerCase()}%`
    base = base.where((b: any) => {
      b.whereRaw("LOWER(handle) LIKE ?", [like])
        .orWhereRaw("LOWER(display_name) LIKE ?", [like])
    })
  }

  const countRows = await base.clone().count("id as c")
  const rows = await base
    .clone()
    .select(
      "id", "handle", "display_name", "tier", "is_curator", "is_banned",
      "customer_id", "location", "created_at"
    )
    .orderBy("created_at", "desc")
    .limit(limit)
    .offset(offset)

  res.json({
    profiles: rows,
    count: Number(countRows[0]?.c || 0),
    limit,
    offset,
  })
}
