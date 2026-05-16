import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  getOrCreateProfile,
  createNotification,
} from "../../../../lib/community"

// POST /store/community/follow — toggle following a member (auth required)
//
// Body: { handle }
// Returns { following, follower_count } for the target member.
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

  const handle = String((req.body as Record<string, any>)?.handle || "")
    .toLowerCase()
    .trim()
  const target = await pg("community_profile").where({ handle }).first("id")
  if (!target) {
    res.status(404).json({ message: "Member not found" })
    return
  }

  const me = await getOrCreateProfile(pg, customerId)
  if (me.id === target.id) {
    res.status(422).json({ message: "You cannot follow yourself" })
    return
  }
  if (me.is_banned) {
    res.status(403).json({ message: "Account suspended" })
    return
  }

  const existing = await pg("community_follow")
    .where({ follower_id: me.id, followed_id: target.id })
    .first()

  let following: boolean
  if (existing) {
    await pg("community_follow")
      .where({ follower_id: me.id, followed_id: target.id })
      .del()
    following = false
  } else {
    await pg("community_follow").insert({
      follower_id: me.id,
      followed_id: target.id,
      created_at: new Date(),
    })
    following = true
    await createNotification(pg, {
      recipient_id: target.id,
      kind: "follow",
      actor_id: me.id,
      target_kind: "profile",
      target_id: me.id,
      target_slug: me.handle,
    })
  }

  const cnt = await pg("community_follow")
    .where({ followed_id: target.id })
    .count("followed_id as c")

  res.json({ following, follower_count: Number(cnt[0]?.c || 0) })
}
