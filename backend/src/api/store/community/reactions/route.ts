import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  getOrCreateProfile,
  isReactionEmoji,
  recomputeReactionCount,
} from "../../../../lib/community"

// POST /store/community/reactions — toggle a reaction (auth required)
//
// Body: { target_kind: 'post'|'comment', target_id, emoji }
// Toggles: if the same reaction exists it is removed, otherwise added.
// Returns { reacted, count } where count is the fresh total for that target.
export async function POST(
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

  const body = (req.body || {}) as Record<string, any>
  const targetKind = body.target_kind
  const targetId = body.target_id ? String(body.target_id) : ""
  const emoji = body.emoji

  if (targetKind !== "post" && targetKind !== "comment") {
    res.status(422).json({ message: "Invalid target_kind" })
    return
  }
  if (!isReactionEmoji(emoji)) {
    res.status(422).json({ message: "Unsupported emoji" })
    return
  }

  const table = targetKind === "post" ? "community_post" : "community_comment"
  const target = await pg(table).where({ id: targetId }).first("id", "status")
  if (!target || target.status === "removed") {
    res.status(404).json({ message: "Target not found" })
    return
  }

  const profile = await getOrCreateProfile(pg, customerId)
  if (profile.is_banned) {
    res.status(403).json({ message: "Account suspended" })
    return
  }

  const existing = await pg("community_reaction")
    .where({
      profile_id: profile.id,
      target_kind: targetKind,
      target_id: targetId,
      emoji,
    })
    .first("id")

  let reacted: boolean
  if (existing) {
    await pg("community_reaction").where({ id: existing.id }).del()
    reacted = false
  } else {
    await pg("community_reaction").insert({
      id: generateEntityId("", "cmrxn"),
      profile_id: profile.id,
      target_kind: targetKind,
      target_id: targetId,
      emoji,
      created_at: new Date(),
    })
    reacted = true
  }

  const count = await recomputeReactionCount(pg, targetKind, targetId)
  res.json({ reacted, emoji, count })
}
