import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

/**
 * GET /admin/site-config/audit-log
 * Paginated audit log. Query: ?limit=50&offset=0&key=platform_mode
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Number(req.query.offset) || 0
  const key = req.query.key as string | undefined

  let query = pg("config_audit_log").orderBy("changed_at", "desc")
  let countQuery = pg("config_audit_log")

  if (key) {
    query = query.where("config_key", key)
    countQuery = countQuery.where("config_key", key)
  }

  const [entries, [{ count }]] = await Promise.all([
    query.limit(limit).offset(offset),
    countQuery.count("* as count"),
  ])

  res.json({ entries, count: Number(count), limit, offset })
}
