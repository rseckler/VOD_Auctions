import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

/**
 * POST /admin/discogs-backfill/reject
 *
 * Body: { release_ids: string[] }
 *
 * Markiert Kandidaten als `rejected` — sie verschwinden aus der Pending-Sicht,
 * es wird nichts an der Release geschrieben. Reine Listen-Hygiene, damit Frank
 * abgehakte Entscheidungen aus dem Weg räumen kann.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const body = (req.body || {}) as { release_ids?: unknown }

  const releaseIds = Array.isArray(body.release_ids)
    ? body.release_ids.filter((x): x is string => typeof x === "string" && x.length > 0)
    : []
  if (releaseIds.length === 0) {
    res.status(400).json({ message: "release_ids must be a non-empty array" })
    return
  }

  const rejected = await pg("discogs_backfill_candidate")
    .whereIn("release_id", releaseIds)
    .where("status", "pending")
    .update({ status: "rejected", updated_at: new Date() })

  res.json({ rejected })
}
