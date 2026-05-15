import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  getProfileByCustomerId,
  recomputeCommentCount,
} from "../../../../../lib/community"

// DELETE /store/community/comments/:id — soft-delete own comment (auth required)
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const comment = await pg("community_comment").where({ id: req.params.id }).first()
  if (!comment || comment.status === "removed") {
    res.status(404).json({ message: "Comment not found" })
    return
  }
  const profile = await getProfileByCustomerId(pg, customerId)
  if (!profile || profile.id !== comment.author_id) {
    res.status(403).json({ message: "Not your comment" })
    return
  }

  await pg("community_comment")
    .where({ id: comment.id })
    .update({ status: "removed", updated_at: new Date() })
  await recomputeCommentCount(pg, comment.post_id)

  res.json({ deleted: true })
}
