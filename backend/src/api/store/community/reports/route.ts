import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireCommunityEnabled, getOrCreateProfile } from "../../../../lib/community"

const REASONS = ["spam", "harassment", "off_topic", "illegal", "other"]

// POST /store/community/reports — report a post or comment (auth required)
//
// Body: { target_kind: 'post'|'comment', target_id, reason, notes? }
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
  const targetId = String(body.target_id || "")
  const reason = body.reason

  if (targetKind !== "post" && targetKind !== "comment") {
    res.status(422).json({ message: "Invalid target_kind" })
    return
  }
  if (!targetId) {
    res.status(422).json({ message: "target_id is required" })
    return
  }
  if (!REASONS.includes(reason)) {
    res.status(422).json({ message: "Invalid reason" })
    return
  }

  const table = targetKind === "post" ? "community_post" : "community_comment"
  const target = await pg(table).where({ id: targetId }).first("id")
  if (!target) {
    res.status(404).json({ message: "Target not found" })
    return
  }

  const me = await getOrCreateProfile(pg, customerId)

  // Dedup — one open report per reporter per target.
  const existing = await pg("community_report")
    .where({
      reporter_id: me.id,
      target_kind: targetKind,
      target_id: targetId,
      status: "open",
    })
    .first("id")

  if (!existing) {
    await pg("community_report").insert({
      id: generateEntityId("", "cmrpt"),
      reporter_id: me.id,
      target_kind: targetKind,
      target_id: targetId,
      reason,
      notes: body.notes ? String(body.notes).slice(0, 500) : null,
      status: "open",
      created_at: new Date(),
    })
  }

  res.status(201).json({ reported: true })
}
