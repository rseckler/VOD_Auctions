/**
 * GET /admin/system-health/alerts/history
 *
 * Query params:
 *   - status: fired | acknowledged | auto_resolved | resolved | suppressed_by_silence | all (default: all)
 *   - service: filter by service_name (optional)
 *   - severity: warning | error | critical (optional)
 *   - days: lookback (default 7, max 180)
 *   - limit: max rows (default 50, max 500)
 *
 * Admin-only (Medusa /admin/* auth by default).
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const statusParam = (req.query?.status as string | undefined) || "all"
  const serviceParam = req.query?.service as string | undefined
  const severityParam = req.query?.severity as string | undefined
  const daysParam = Math.min(180, Math.max(1, Number(req.query?.days) || 7))
  const limitParam = Math.min(500, Math.max(1, Number(req.query?.limit) || 50))

  const VALID_STATUS = ["fired", "acknowledged", "auto_resolved", "resolved", "suppressed_by_silence"]
  const VALID_SEV = ["warning", "error", "critical"]

  let q = pg("health_alert_dispatch_log")
    .select("*")
    .where("dispatched_at", ">", pg.raw(`NOW() - (? || ' days')::interval`, [daysParam]))
    .orderBy("dispatched_at", "desc")
    .limit(limitParam)

  if (statusParam !== "all") {
    if (!VALID_STATUS.includes(statusParam)) {
      res.status(400).json({ error: `invalid status, must be: ${VALID_STATUS.join(", ")} | all` })
      return
    }
    q = q.where("status", statusParam)
  }
  if (serviceParam) q = q.where("service_name", serviceParam)
  if (severityParam) {
    if (!VALID_SEV.includes(severityParam)) {
      res.status(400).json({ error: `invalid severity, must be: ${VALID_SEV.join(", ")}` })
      return
    }
    q = q.where("severity", severityParam)
  }

  const rows = await q

  // Summary counts (independent of limit, same time-window and filters except status)
  const summary = await pg("health_alert_dispatch_log")
    .select("status")
    .count("id as count")
    .where("dispatched_at", ">", pg.raw(`NOW() - (? || ' days')::interval`, [daysParam]))
    .modify((qb) => {
      if (serviceParam) qb.where("service_name", serviceParam)
      if (severityParam) qb.where("severity", severityParam)
    })
    .groupBy("status")

  const counts: Record<string, number> = { fired: 0, acknowledged: 0, auto_resolved: 0, resolved: 0, suppressed_by_silence: 0 }
  for (const r of summary as any[]) {
    counts[r.status] = Number(r.count)
  }

  res.json({
    window_days: daysParam,
    total_in_window: Object.values(counts).reduce((s, n) => s + n, 0),
    counts,
    rows: rows.map((r: any) => ({
      id: r.id,
      dispatched_at: r.dispatched_at,
      service_name: r.service_name,
      severity: r.severity,
      message: r.message,
      metadata: r.metadata,
      channels_attempted: r.channels_attempted,
      status: r.status,
      acknowledged_at: r.acknowledged_at,
      acknowledged_by: r.acknowledged_by,
      acknowledge_reason: r.acknowledge_reason,
      resolved_at: r.resolved_at,
    })),
  })
}
