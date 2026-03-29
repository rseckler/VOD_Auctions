import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { crmSyncRegistration } from "../../../../../lib/crm-sync"

// POST /admin/customers/:id/brevo-sync — Force-sync customer to Brevo CRM
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    await crmSyncRegistration(pgConnection, id)

    res.json({ success: true, synced_at: new Date().toISOString() })
  } catch (err: any) {
    console.error(`[admin/customers/${id}/brevo-sync] Error:`, err.message)
    res.status(500).json({ message: "Failed to sync customer to Brevo" })
  }
}
