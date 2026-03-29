import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// DELETE /admin/customers/:id/delete — Hard-delete customer and all related data
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    // Fetch customer email before deletion (for Brevo cleanup)
    const customer = await pgConnection("customer")
      .where("id", id)
      .select("email")
      .first()

    if (!customer) {
      res.status(404).json({ message: "Customer not found" })
      return
    }

    const email = customer.email

    // Atomic deletion within a transaction
    await pgConnection.transaction(async (trx) => {
      // 1. Nullify user_id on transactions (keep for accounting)
      await trx("transaction")
        .where("user_id", id)
        .update({ user_id: null })

      // 2. Delete customer_stats
      await trx("customer_stats")
        .where("customer_id", id)
        .delete()

      // 3. Delete customer notes
      await trx("customer_note")
        .where("customer_id", id)
        .delete()

      // 4. Delete customer addresses
      await trx("customer_address")
        .where("customer_id", id)
        .delete()

      // 5. Delete customer
      await trx("customer")
        .where("id", id)
        .delete()
    })

    // Best-effort Brevo contact deletion
    try {
      const { deleteContact } = await import("../../../../../lib/brevo")
      await deleteContact(email)
      console.log(`[admin/customers/${id}/delete] Brevo contact deleted: ${email}`)
    } catch (brevoErr: any) {
      console.warn(`[admin/customers/${id}/delete] Brevo deletion failed (non-critical):`, brevoErr.message)
    }

    console.log(`[admin/customers/${id}/delete] Customer hard-deleted: ${email}`)
    res.json({ success: true })
  } catch (err: any) {
    console.error(`[admin/customers/${id}/delete] Error:`, err.message)
    res.status(500).json({ message: "Failed to delete customer" })
  }
}
