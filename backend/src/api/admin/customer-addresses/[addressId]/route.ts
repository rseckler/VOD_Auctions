import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// PATCH /admin/customer-addresses/:addressId — Update address
export async function PATCH(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { addressId } = req.params
  const body = req.body as {
    first_name?: string
    last_name?: string
    address_1?: string
    address_2?: string
    city?: string
    postal_code?: string
    country_code?: string
    phone?: string
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const existing = await pgConnection("customer_address")
      .where("id", addressId)
      .whereNull("deleted_at")
      .first()

    if (!existing) {
      res.status(404).json({ message: "Address not found" })
      return
    }

    const update: Record<string, any> = {}
    if (body.first_name !== undefined) update.first_name = body.first_name
    if (body.last_name !== undefined) update.last_name = body.last_name
    if (body.address_1 !== undefined) update.address_1 = body.address_1
    if (body.address_2 !== undefined) update.address_2 = body.address_2
    if (body.city !== undefined) update.city = body.city
    if (body.postal_code !== undefined) update.postal_code = body.postal_code
    if (body.country_code !== undefined) update.country_code = body.country_code
    if (body.phone !== undefined) update.phone = body.phone

    if (Object.keys(update).length > 0) {
      update.updated_at = pgConnection.fn.now()
      await pgConnection("customer_address")
        .where("id", addressId)
        .update(update)
    }

    const address = await pgConnection("customer_address")
      .where("id", addressId)
      .select(
        "id",
        "customer_id",
        "first_name",
        "last_name",
        "address_1",
        "address_2",
        "city",
        "postal_code",
        "country_code",
        "phone",
        "created_at",
        "updated_at"
      )
      .first()

    res.json({ address })
  } catch (err: any) {
    console.error(`[admin/customer-addresses/${addressId}] PATCH Error:`, err.message)
    res.status(500).json({ message: "Failed to update address" })
  }
}

// DELETE /admin/customer-addresses/:addressId — Soft-delete address
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { addressId } = req.params

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const existing = await pgConnection("customer_address")
      .where("id", addressId)
      .whereNull("deleted_at")
      .first()

    if (!existing) {
      res.status(404).json({ message: "Address not found" })
      return
    }

    await pgConnection("customer_address")
      .where("id", addressId)
      .update({ deleted_at: pgConnection.fn.now() })

    res.json({ success: true })
  } catch (err: any) {
    console.error(`[admin/customer-addresses/${addressId}] DELETE Error:`, err.message)
    res.status(500).json({ message: "Failed to delete address" })
  }
}
