import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireCommunityEnabled } from "../../../../lib/community"

// GET /admin/community/reports — moderation queue.
// Query: status (default 'open'), limit, offset
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const status = (req.query.status as string) || "open"
  const limit = Math.min(Number(req.query.limit) || 100, 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const rows = await pg("community_report as r")
    .join("community_profile as rep", "rep.id", "r.reporter_id")
    .where("r.status", status)
    .orderBy("r.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "r.id", "r.target_kind", "r.target_id", "r.reason", "r.notes",
      "r.status", "r.created_at",
      "rep.handle as reporter_handle"
    )

  // Attach a short excerpt of the reported content + the post slug so the
  // moderator can open it.
  for (const r of rows as any[]) {
    let content: any = null
    let postSlug: string | null = null
    if (r.target_kind === "post") {
      content = await pg("community_post")
        .where({ id: r.target_id })
        .first("body_html", "status", "slug")
      postSlug = content?.slug || null
    } else {
      content = await pg("community_comment as c")
        .leftJoin("community_post as p", "p.id", "c.post_id")
        .where("c.id", r.target_id)
        .first("c.body_html as body_html", "c.status as status", "p.slug as slug")
      postSlug = content?.slug || null
    }
    r.target_excerpt = content
      ? String(content.body_html || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160)
      : "(deleted)"
    r.target_status = content?.status || "removed"
    r.target_slug = postSlug
  }

  res.json({ reports: rows })
}
