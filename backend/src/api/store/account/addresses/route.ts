import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /store/account/addresses — List all addresses for authenticated customer
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const addresses = await pgConnection("customer_address")
    .where({ customer_id: customerId })
    .whereNull("deleted_at")
    .select(
      "id",
      "first_name",
      "last_name",
      "address_1",
      "address_2",
      "city",
      "postal_code",
      "country_code",
      "is_default_shipping",
      "created_at",
      "updated_at"
    )
    .orderBy("is_default_shipping", "desc")
    .orderBy("created_at", "desc")

  res.json({ addresses })
}

// POST /store/account/addresses — Create or update address
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const {
    id,
    first_name,
    last_name,
    address_1,
    address_2,
    city,
    postal_code,
    country_code,
    is_default_shipping,
  } = req.body as {
    id?: string
    first_name: string
    last_name: string
    address_1: string
    address_2?: string
    city: string
    postal_code: string
    country_code: string
    is_default_shipping?: boolean
  }

  // Validate required fields
  if (!first_name?.trim() || !last_name?.trim() || !address_1?.trim() || !city?.trim() || !postal_code?.trim() || !country_code?.trim()) {
    res.status(400).json({ message: "first_name, last_name, address_1, city, postal_code, and country_code are required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const now = new Date()
  const setDefault = is_default_shipping !== false // default to true for new addresses

  // If setting as default, clear default on other addresses
  if (setDefault) {
    await pgConnection("customer_address")
      .where({ customer_id: customerId, is_default_shipping: true })
      .whereNull("deleted_at")
      .update({ is_default_shipping: false, updated_at: now })
  }

  if (id) {
    // UPDATE existing address — verify ownership first
    const existing = await pgConnection("customer_address")
      .where({ id, customer_id: customerId })
      .whereNull("deleted_at")
      .first()

    if (!existing) {
      res.status(404).json({ message: "Address not found" })
      return
    }

    const [address] = await pgConnection("customer_address")
      .where("id", id)
      .update({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        address_1: address_1.trim(),
        address_2: address_2?.trim() || null,
        city: city.trim(),
        postal_code: postal_code.trim(),
        country_code: country_code.trim().toLowerCase(),
        is_default_shipping: setDefault,
        updated_at: now,
      })
      .returning("*")

    res.json({ address })
  } else {
    // INSERT new address
    const [address] = await pgConnection("customer_address")
      .insert({
        id: generateEntityId(),
        customer_id: customerId,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        address_1: address_1.trim(),
        address_2: address_2?.trim() || null,
        city: city.trim(),
        postal_code: postal_code.trim(),
        country_code: country_code.trim().toLowerCase(),
        is_default_shipping: setDefault,
        created_at: now,
        updated_at: now,
      })
      .returning("*")

    res.status(201).json({ address })
  }
}
