/**
 * POST /health-sample/cleanup
 *
 * Retention-Policy (§3.4):
 *   - fast/background: 30 Tage
 *   - synthetic:       90 Tage
 *
 * Läuft täglich 03:30 UTC via Cron (scripts/health-sampler.sh cleanup).
 * Auth: X-Sampler-Token (gleicher Secret wie POST /health-sample).
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const expectedToken = process.env.HEALTH_SAMPLER_TOKEN
  if (!expectedToken) {
    res.status(500).json({ error: "HEALTH_SAMPLER_TOKEN not configured" })
    return
  }
  if (req.headers["x-sampler-token"] !== expectedToken) {
    res.status(401).json({ error: "invalid sampler token" })
    return
  }

  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const start = Date.now()

  const fastBg = await pg.raw(
    `DELETE FROM health_check_log
      WHERE check_class IN ('fast', 'background')
        AND checked_at < NOW() - INTERVAL '30 days'`
  )
  const synth = await pg.raw(
    `DELETE FROM health_check_log
      WHERE check_class = 'synthetic'
        AND checked_at < NOW() - INTERVAL '90 days'`
  )

  // P4-A: alert-dispatch-log retention 180 days
  let alertDispatch = { rowCount: 0 as number | null }
  try {
    alertDispatch = await pg.raw(
      `DELETE FROM health_alert_dispatch_log WHERE dispatched_at < NOW() - INTERVAL '180 days'`
    )
  } catch { /* table may not exist pre-migration */ }

  // P4-D: admin-action-log retention 365 days
  let adminAction = { rowCount: 0 as number | null }
  try {
    adminAction = await pg.raw(
      `DELETE FROM admin_action_log WHERE created_at < NOW() - INTERVAL '365 days'`
    )
  } catch { /* table may not exist pre-migration */ }

  // P4-D: cancelled silences older than 90 days can be purged (active ones preserved)
  let silences = { rowCount: 0 as number | null }
  try {
    silences = await pg.raw(
      `DELETE FROM service_silence WHERE cancelled_at IS NOT NULL AND cancelled_at < NOW() - INTERVAL '90 days'`
    )
  } catch { /* table may not exist pre-migration */ }

  const totalRows = await pg("health_check_log").count<{ count: string }[]>("id as count")

  res.json({
    deleted_fast_background: fastBg.rowCount ?? 0,
    deleted_synthetic: synth.rowCount ?? 0,
    deleted_alert_dispatch_log: alertDispatch.rowCount ?? 0,
    deleted_admin_action_log: adminAction.rowCount ?? 0,
    deleted_service_silence: silences.rowCount ?? 0,
    remaining_health_check_rows: Number(totalRows[0]?.count ?? 0),
    duration_ms: Date.now() - start,
  })
}
