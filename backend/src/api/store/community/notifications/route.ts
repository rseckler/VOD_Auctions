import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireCommunityEnabled, getProfileByCustomerId } from "../../../../lib/community"

// GET /store/community/notifications — own notifications + unread count (auth)
export async function GET(
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
  const me = await getProfileByCustomerId(pg, customerId)
  if (!me) {
    res.json({ notifications: [], unread: 0 })
    return
  }

  const rows = await pg("community_notification as n")
    .leftJoin("community_profile as a", "a.id", "n.actor_id")
    .where("n.recipient_id", me.id)
    .orderBy("n.created_at", "desc")
    .limit(60)
    .select(
      "n.id", "n.kind", "n.target_kind", "n.target_id", "n.target_slug",
      "n.is_read", "n.created_at",
      "a.handle as actor_handle", "a.display_name as actor_name",
      "a.avatar_url as actor_avatar", "a.tier as actor_tier"
    )

  const unreadRows = await pg("community_notification")
    .where({ recipient_id: me.id, is_read: false })
    .count("id as c")

  res.json({
    notifications: rows.map((n: any) => ({
      id: n.id,
      kind: n.kind,
      target_kind: n.target_kind,
      target_id: n.target_id,
      target_slug: n.target_slug,
      is_read: !!n.is_read,
      created_at: n.created_at,
      actor: n.actor_handle
        ? {
            handle: n.actor_handle,
            display_name: n.actor_name,
            avatar_url: n.actor_avatar,
            tier: n.actor_tier,
          }
        : null,
    })),
    unread: Number(unreadRows[0]?.c || 0),
  })
}

// POST /store/community/notifications — mark read (auth)
// Body: { ids?: string[] } — omitted/empty marks all as read.
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
  const me = await getProfileByCustomerId(pg, customerId)
  if (!me) {
    res.json({ ok: true })
    return
  }

  const ids = (req.body as Record<string, any>)?.ids
  let q = pg("community_notification")
    .where("recipient_id", me.id)
    .where("is_read", false)
  if (Array.isArray(ids) && ids.length > 0) {
    q = q.whereIn("id", ids.map((x) => String(x)))
  }
  await q.update({ is_read: true })

  res.json({ ok: true })
}
