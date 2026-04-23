/**
 * POST /health-sample/digest
 *
 * Sends the daily warning-digest email (cron 08:00 UTC).
 * Auth: X-Sampler-Token.
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { sendDigest } from "../../../lib/health-alerting"
import { getFeatureFlag } from "../../../lib/feature-flags"

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

  const flagOn = await getFeatureFlag(pg, "SYSTEM_HEALTH_ALERTING")
  if (!flagOn) {
    res.json({ skipped: true, reason: "SYSTEM_HEALTH_ALERTING flag is OFF" })
    return
  }

  const result = await sendDigest(pg)
  res.json(result)
}
