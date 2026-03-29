import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  generateEntityId,
} from "@medusajs/framework/utils"
import { Knex } from "knex"

// POST /admin/customers/:id/anonymize — DSGVO: anonymize all personal data
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    // 1. Anonymize customer record
    await pgConnection("customer")
      .where("id", id)
      .update({
        email: pgConnection.raw("'deleted-' || id || '@vod-auctions.com'"),
        first_name: "Gelöschter",
        last_name: "Nutzer",
        phone: null,
        deleted_at: pgConnection.fn.now(),
        updated_at: pgConnection.fn.now(),
      })

    // 2. Anonymize addresses
    await pgConnection("customer_address")
      .where("customer_id", id)
      .update({
        address_1: "ANONYMIZED",
        address_2: null,
        city: "ANONYMIZED",
        postal_code: "ANONYMIZED",
        phone: null,
      })

    // 3. Audit log (best-effort — table may not exist yet)
    try {
      const adminEmail =
        (req as any).auth_context?.actor_id || "admin"

      await pgConnection("customer_audit_log").insert({
        id: generateEntityId(),
        customer_id: id,
        action: "anonymized",
        details: JSON.stringify({}),
        admin_email: adminEmail,
        created_at: pgConnection.fn.now(),
      })
    } catch {
      // customer_audit_log table may not exist yet
    }

    res.json({ success: true })
  } catch (err: any) {
    console.error(`[admin/customers/${id}/anonymize] Error:`, err.message)
    res.status(500).json({ message: "Failed to anonymize customer" })
  }
}
