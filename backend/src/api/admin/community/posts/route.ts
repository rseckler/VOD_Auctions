import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireCommunityEnabled } from "../../../../lib/community"

// GET /admin/community/posts — moderation list (all statuses)
//
// Query: status (draft|published|hidden|removed), kind, q, limit, offset
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const status = req.query.status as string | undefined
  const kind = req.query.kind as string | undefined
  const q = ((req.query.q as string) || "").trim()
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  let base = pg("community_post as p").join(
    "community_profile as a",
    "a.id",
    "p.author_id"
  )
  if (status) base = base.where("p.status", status)
  if (kind) base = base.where("p.kind", kind)
  if (q) {
    const like = `%${q.toLowerCase()}%`
    base = base.where((b: any) => {
      b.whereRaw("LOWER(COALESCE(p.title,'')) LIKE ?", [like])
        .orWhereRaw("LOWER(COALESCE(p.excerpt,'')) LIKE ?", [like])
        .orWhereRaw("LOWER(a.handle) LIKE ?", [like])
    })
  }

  const countRows = await base.clone().count("p.id as count")
  const rows = await base
    .clone()
    .select(
      "p.id", "p.kind", "p.title", "p.slug", "p.excerpt", "p.status",
      "p.is_pinned", "p.release_id", "p.reaction_count", "p.comment_count",
      "p.created_at",
      "a.handle as author_handle", "a.display_name as author_name"
    )
    .orderBy("p.created_at", "desc")
    .limit(limit)
    .offset(offset)

  res.json({ posts: rows, count: Number(countRows[0]?.count || 0), limit, offset })
}
