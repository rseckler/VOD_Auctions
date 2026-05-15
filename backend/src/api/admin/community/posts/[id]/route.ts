import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireCommunityEnabled } from "../../../../../lib/community"

const POST_STATUSES = ["draft", "published", "hidden", "removed"]

// PATCH /admin/community/posts/:id — moderate a post (status + pin)
export async function PATCH(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const post = await pg("community_post").where({ id: req.params.id }).first("id")
  if (!post) {
    res.status(404).json({ message: "Post not found" })
    return
  }

  const body = (req.body || {}) as Record<string, any>
  const patch: Record<string, any> = { updated_at: new Date() }
  if (body.status !== undefined) {
    if (!POST_STATUSES.includes(body.status)) {
      res.status(422).json({ message: "Invalid status" })
      return
    }
    patch.status = body.status
  }
  if (body.is_pinned !== undefined) patch.is_pinned = !!body.is_pinned

  const [row] = await pg("community_post")
    .where({ id: post.id })
    .update(patch)
    .returning("*")
  res.json({ post: row })
}
