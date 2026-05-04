import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/crm/email-candidates?status=pending
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const status = (req.query.status as string) || "pending"
  try {
    const candidates = await pgConnection("crm_email_candidate as ec")
      .leftJoin("crm_master_contact as mc", "mc.id", "ec.master_id")
      .where("ec.status", status)
      .whereNull("mc.deleted_at")
      .select(
        "ec.*",
        "mc.display_name as master_display_name",
        "mc.first_name as master_first_name",
        "mc.last_name as master_last_name",
        "mc.company as master_company",
        "mc.lifetime_revenue as master_revenue",
        "mc.tier as master_tier",
        "mc.primary_email as master_primary_email"
      )
      .orderBy("ec.confidence", "desc")
      .orderBy("ec.created_at", "asc")
      .limit(500)
    res.json({ candidates })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
