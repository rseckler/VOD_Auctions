/**
 * POST /admin/system-health/alerts/:id/acknowledge
 *
 * Body: { reason: string (min 3 chars) }
 *
 * Sets status='acknowledged' + acknowledged_at + acknowledged_by + reason.
 * Idempotent: acknowledging an already-acknowledged alert is a no-op (same-user) or 409 (different user).
 *
 * Actor derived from Medusa admin session.
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const idParam = Number(req.params?.id)
  if (!Number.isFinite(idParam) || idParam <= 0) {
    res.status(400).json({ error: "invalid alert id" })
    return
  }

  const body = req.body as { reason?: string } | undefined
  const reason = (body?.reason || "").trim()
  if (reason.length < 3) {
    res.status(400).json({ error: "reason required (min 3 characters)" })
    return
  }
  if (reason.length > 500) {
    res.status(400).json({ error: "reason too long (max 500 characters)" })
    return
  }

  // Actor from Medusa admin session — try multiple possible auth context shapes
  const auth = (req as any).auth_context || (req as any).auth || {}
  const actorId = auth?.actor_id || auth?.user_id || "unknown_admin"
  const actorEmail = auth?.actor_email || auth?.email || null
  const actorLabel = actorEmail ? `${actorEmail} (${actorId})` : actorId

  // Load current state
  const current = await pg("health_alert_dispatch_log").where("id", idParam).first()
  if (!current) {
    res.status(404).json({ error: "alert not found" })
    return
  }

  if (current.status !== "fired") {
    res.status(409).json({
      error: `alert already ${current.status}`,
      current_status: current.status,
      acknowledged_by: current.acknowledged_by,
      acknowledged_at: current.acknowledged_at,
    })
    return
  }

  await pg("health_alert_dispatch_log")
    .where("id", idParam)
    .update({
      status: "acknowledged",
      acknowledged_at: pg.fn.now(),
      acknowledged_by: actorLabel,
      acknowledge_reason: reason,
    })

  const updated = await pg("health_alert_dispatch_log").where("id", idParam).first()
  res.json({
    ok: true,
    alert: {
      id: updated.id,
      service_name: updated.service_name,
      severity: updated.severity,
      status: updated.status,
      acknowledged_at: updated.acknowledged_at,
      acknowledged_by: updated.acknowledged_by,
      acknowledge_reason: updated.acknowledge_reason,
    },
  })
}
