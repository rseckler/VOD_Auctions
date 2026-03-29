import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  generateEntityId,
} from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/customers/:id/addresses — List saved addresses
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const addresses = await pgConnection("customer_address")
      .where("customer_id", id)
      .whereNull("deleted_at")
      .orderBy("created_at", "desc")
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

    res.json({ addresses })
  } catch (err: any) {
    console.error(`[admin/customers/${id}/addresses] GET Error:`, err.message)
    res.status(500).json({ message: "Failed to fetch addresses" })
  }
}

// POST /admin/customers/:id/addresses — Create new address
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const body = req.body as {
    first_name?: string
    last_name?: string
    address_1: string
    address_2?: string
    city: string
    postal_code: string
    country_code: string
    phone?: string
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    if (!body.address_1 || !body.city || !body.postal_code || !body.country_code) {
      res.status(400).json({ message: "address_1, city, postal_code, and country_code are required" })
      return
    }

    const newId = generateEntityId("", "addr")
    const now = new Date()

    const address = {
      id: newId,
      customer_id: id,
      first_name: body.first_name || null,
      last_name: body.last_name || null,
      address_1: body.address_1,
      address_2: body.address_2 || null,
      city: body.city,
      postal_code: body.postal_code,
      country_code: body.country_code,
      phone: body.phone || null,
      created_at: now,
      updated_at: now,
    }

    await pgConnection("customer_address").insert(address)

    res.json({ address })
  } catch (err: any) {
    console.error(`[admin/customers/${id}/addresses] POST Error:`, err.message)
    res.status(500).json({ message: "Failed to create address" })
  }
}
