/**
 * GET /admin/system-health/silences
 *
 * Aktive Service-Silences (Observability Plan v2 §3.4 + P4-D D6).
 * Admin-auth implicit. Flag-gated by SYSTEM_HEALTH_ACTIONS (gleiche wie Silence-Erstellen).
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

  const rows = await pg("service_silence")
    .whereNull("cancelled_at")
    .where("silenced_until", ">", pg.fn.now())
    .orderBy("silenced_until", "desc")
    .select("id", "service_name", "silenced_until", "reason", "created_by", "created_at")

  res.json({
    active_count: rows.length,
    silences: rows.map((r: any) => {
      const remainingSec = Math.max(0, Math.floor((new Date(r.silenced_until).getTime() - Date.now()) / 1000))
      return {
        id: r.id,
        service_name: r.service_name,
        silenced_until: r.silenced_until,
        reason: r.reason,
        created_by: r.created_by,
        created_at: r.created_at,
        remaining_minutes: Math.ceil(remainingSec / 60),
      }
    }),
  })
}
