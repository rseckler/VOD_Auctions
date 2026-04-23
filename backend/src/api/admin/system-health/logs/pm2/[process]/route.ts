/**
 * GET /admin/system-health/logs/pm2/:process?tail=100&follow=true
 *
 * SSE-Log-Stream für einen PM2-Prozess (Observability Plan v2 §P4-C).
 *
 * Security:
 *   - Admin-auth implicit via /admin/* route-prefix
 *   - PM2-Prozess-Key muss in hart-kodierter Allowlist sein (isValidPm2Key)
 *   - Regex-Scrubbing von known-secrets (Sekundärschutz)
 *   - Rate-Limit: max 3 concurrent Streams pro actor
 *   - Max 10min Lifetime
 *   - Tail-lines hart auf 500 gecapt
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getFeatureFlag } from "../../../../../lib/feature-flags"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { isValidPm2Key, PM2_ALLOWLIST } from "../../../../../lib/log-sources"
import { streamPm2Combined } from "../../../../../lib/log-streaming"

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const flagOn = await getFeatureFlag(pg, "SYSTEM_HEALTH_LOG_VIEWER")
  if (!flagOn) {
    res.status(404).json({ error: "not found" })
    return
  }

  const procKey = (req.params?.process as string | undefined)?.trim()
  if (!procKey || !isValidPm2Key(procKey)) {
    res.status(404).json({ error: "pm2 process not in allowlist", allowlist: Object.keys(PM2_ALLOWLIST) })
    return
  }

  const tailLines = Math.min(500, Math.max(10, Number(req.query?.tail) || 100))
  const follow = String(req.query?.follow || "true") !== "false"

  const auth = (req as any).auth_context || (req as any).auth || {}
  const actorId = String(auth?.actor_id || auth?.user_id || "anonymous_admin")

  const source = PM2_ALLOWLIST[procKey]
  await streamPm2Combined(res, {
    outPath: source.out,
    errorPath: source.error,
    actorId,
    tailLines,
    follow,
  })
}
