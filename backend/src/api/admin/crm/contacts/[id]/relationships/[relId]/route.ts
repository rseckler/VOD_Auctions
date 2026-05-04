import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

const ADMIN = "admin@vod-auctions.com"

export async function DELETE(
  req: MedusaRequest<unknown, { id?: string; relId?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const params = req.params as { id?: string; relId?: string }
  const masterId = params?.id
  const relId = params?.relId
  if (!masterId || !relId) { res.status(400).json({ ok: false, error: "id + relId required" }); return }
  try {
    const rel = await pgConnection("crm_master_relationship").where({ id: relId }).first()
    if (!rel) { res.status(404).json({ ok: false, error: "Not found" }); return }
    await pgConnection("crm_master_relationship").where({ id: relId }).delete()
    await pgConnection("crm_master_audit_log").insert({
      master_id: masterId,
      action: "relationship_removed",
      details: { rel_id: relId },
      source: "admin_ui",
      admin_email: ADMIN,
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
