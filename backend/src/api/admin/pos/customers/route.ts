import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../lib/inventory"

/**
 * POST /admin/pos/customers
 *
 * Create a new customer from the POS interface (minimal data).
 * Creates both a Medusa customer record and a customer_stats row.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "POS_WALK_IN")

  const { first_name, last_name, email, phone } = req.body as {
    first_name: string
    last_name: string
    email?: string
    phone?: string
  }

  if (!first_name || !last_name) {
    res.status(400).json({ message: "first_name and last_name are required." })
    return
  }

  // Check for duplicate email if provided
  if (email) {
    const existing = await pg.raw(
      `SELECT id FROM customer WHERE email = ? LIMIT 1`,
      [email.toLowerCase()]
    )
    if (existing.rows.length) {
      res.status(409).json({
        message: `Customer with email ${email} already exists.`,
        existing_customer_id: existing.rows[0].id,
      })
      return
    }
  }

  const trx = await pg.transaction()
  try {
    const customerId = generateEntityId()
    const now = new Date()

    // Insert Medusa customer
    await trx("customer").insert({
      id: customerId,
      first_name,
      last_name,
      email: email ? email.toLowerCase() : null,
      phone: phone || null,
      has_account: false,
      created_at: now,
      updated_at: now,
    })

    // Insert customer_stats row
    await trx("customer_stats").insert({
      id: generateEntityId(),
      customer_id: customerId,
      total_spent: 0,
      total_purchases: 0,
      total_bids: 0,
      total_wins: 0,
      is_vip: false,
      is_dormant: false,
      updated_at: now,
    })

    await trx.commit()

    res.status(201).json({
      customer: {
        id: customerId,
        first_name,
        last_name,
        name: `${first_name} ${last_name}`,
        email: email || null,
        phone: phone || null,
        total_spent: 0,
        total_purchases: 0,
        is_vip: false,
      },
    })
  } catch (err: any) {
    await trx.rollback()
    console.error("[POS Create Customer] Error:", err.message)
    res.status(500).json({ message: err.message || "Failed to create customer" })
  }
}
