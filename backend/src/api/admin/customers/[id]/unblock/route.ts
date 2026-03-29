import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// POST /admin/customers/:id/unblock — Restore a blocked customer
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    await pgConnection("customer")
      .where("id", id)
      .update({ deleted_at: null })

    res.json({ success: true, blocked: false })
  } catch (err: any) {
    console.error(`[admin/customers/${id}/unblock] Error:`, err.message)
    res.status(500).json({ message: "Failed to unblock customer" })
  }
}
