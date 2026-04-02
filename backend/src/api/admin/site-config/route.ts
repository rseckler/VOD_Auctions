import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { getSiteConfig, updateSiteConfig, SiteConfig } from "../../../lib/site-config"

/**
 * GET /admin/site-config
 * Returns current config + last 20 audit log entries.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const config = await getSiteConfig(pg)
  const recentAudit = await pg("config_audit_log")
    .orderBy("changed_at", "desc")
    .limit(20)

  res.json({ config, audit_log: recentAudit })
}

/**
 * POST /admin/site-config
 * Body: partial SiteConfig — only allowed keys are applied.
 * Writes audit log + invalidates cache.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const adminEmail = (req as any).auth_context?.actor_id || "admin"
  const body = req.body as Partial<SiteConfig>

  if (!body || Object.keys(body).length === 0) {
    res.status(400).json({ message: "No fields provided" })
    return
  }

  try {
    const config = await updateSiteConfig(pg, body, adminEmail)
    res.json({ config })
  } catch (err: any) {
    res.status(400).json({ message: err.message })
  }
}
