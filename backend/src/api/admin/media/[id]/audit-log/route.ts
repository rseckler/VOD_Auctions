import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { listForRelease } from "../../../../../lib/release-audit"

// GET /admin/media/:id/audit-log — paginated audit history for a release
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params

  const limit = Math.min(Number(req.query.limit) || 50, 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const release = await pg("Release").where("id", id).select("id").first()
  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  const { entries, total } = await listForRelease(pg, id, { limit, offset })

  res.json({ entries, total, limit, offset })
}
