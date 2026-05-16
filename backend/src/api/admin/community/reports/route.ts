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

  // Attach a short excerpt of the reported content.
  for (const r of rows as any[]) {
    const table = r.target_kind === "post" ? "community_post" : "community_comment"
    const content = await pg(table)
      .where({ id: r.target_id })
      .first("body_html", "status")
    r.target_excerpt = content
      ? String(content.body_html || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160)
      : "(deleted)"
    r.target_status = content?.status || "removed"
  }

  res.json({ reports: rows })
}
