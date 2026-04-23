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

  const totalRows = await pg("health_check_log").count<{ count: string }[]>("id as count")

  res.json({
    deleted_fast_background: fastBg.rowCount ?? 0,
    deleted_synthetic: synth.rowCount ?? 0,
    remaining_rows: Number(totalRows[0]?.count ?? 0),
    duration_ms: Date.now() - start,
  })
}
