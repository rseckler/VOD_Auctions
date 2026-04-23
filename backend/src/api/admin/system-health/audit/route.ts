/**
 * GET /admin/system-health/audit
 *
 * Admin-Action-Audit-Log-Viewer (Observability Plan v2 §P4-D D8).
 *
 * Query params:
 *   - action: filter action-name (optional)
 *   - actor: filter actor_user_id or actor_email (partial match, optional)
 *   - risk_class: read_only | low_impact | destructive (optional)
 *   - days: lookback window (default 30, max 365)
 *   - limit: rows (default 100, max 500)
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { getFeatureFlag } from "../../../../lib/feature-flags"

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const flagOn = await getFeatureFlag(pg, "SYSTEM_HEALTH_ACTIONS")
  if (!flagOn) {
    res.status(404).json({ error: "not found" })
    return
  }

  const daysParam = Math.min(365, Math.max(1, Number(req.query?.days) || 30))
  const limitParam = Math.min(500, Math.max(1, Number(req.query?.limit) || 100))
  const actionParam = req.query?.action as string | undefined
  const actorParam = req.query?.actor as string | undefined
  const riskParam = req.query?.risk_class as string | undefined
  const VALID_RISK = ["read_only", "low_impact", "destructive"]

  let q = pg("admin_action_log")
    .select("*")
    .where("created_at", ">", pg.raw(`NOW() - (? || ' days')::interval`, [daysParam]))
    .orderBy("created_at", "desc")
    .limit(limitParam)

  if (actionParam) q = q.where("action", actionParam)
  if (riskParam && VALID_RISK.includes(riskParam)) q = q.where("risk_class", riskParam)
  if (actorParam) {
    q = q.where((builder) =>
      builder.where("actor_user_id", "ilike", `%${actorParam}%`).orWhere("actor_email", "ilike", `%${actorParam}%`)
    )
  }

  const rows = await q

  res.json({
    window_days: daysParam,
    count: rows.length,
    rows: rows.map((r: any) => ({
      id: r.id,
      request_id: r.request_id,
      action: r.action,
      risk_class: r.risk_class,
      target: r.target,
      actor_user_id: r.actor_user_id,
      actor_email: r.actor_email,
      actor_source: r.actor_source,
      stage: r.stage,
      pre_state: r.pre_state,
      post_state: r.post_state,
      payload: r.payload,
      result: r.result,
      error_message: r.error_message,
      created_at: r.created_at,
    })),
  })
}
