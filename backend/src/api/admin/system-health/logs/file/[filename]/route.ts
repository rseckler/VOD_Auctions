/**
 * GET /admin/system-health/logs/file/:filename?tail=100&follow=true
 *
 * SSE-Log-Stream für einen File-Log (Observability Plan v2 §P4-C).
 *
 * Security-identisch zu PM2-Endpoint. Filename muss in hart-kodierter
 * Allowlist sein — kein User-Input für Pfade.
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getFeatureFlag } from "../../../../../lib/feature-flags"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { isValidFileKey, FILE_ALLOWLIST } from "../../../../../lib/log-sources"
import { streamLogFile } from "../../../../../lib/log-streaming"

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const flagOn = await getFeatureFlag(pg, "SYSTEM_HEALTH_LOG_VIEWER")
  if (!flagOn) {
    res.status(404).json({ error: "not found" })
    return
  }

  const fileKey = (req.params?.filename as string | undefined)?.trim()
  if (!fileKey || !isValidFileKey(fileKey)) {
    res.status(404).json({ error: "file not in allowlist", allowlist: Object.keys(FILE_ALLOWLIST) })
    return
  }

  const tailLines = Math.min(500, Math.max(10, Number(req.query?.tail) || 100))
  const follow = String(req.query?.follow || "true") !== "false"

  const auth = (req as any).auth_context || (req as any).auth || {}
  const actorId = String(auth?.actor_id || auth?.user_id || "anonymous_admin")

  const source = FILE_ALLOWLIST[fileKey]
  await streamLogFile(res, {
    filePath: source.path,
    actorId,
    tailLines,
    follow,
  })
}
