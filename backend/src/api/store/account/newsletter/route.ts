import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  getContact,
  upsertContact,
  updateContactAttributes,
  isBrevoConfigured,
  BREVO_LIST_VOD_AUCTIONS,
} from "../../../../lib/brevo"

// GET /store/account/newsletter — Get newsletter opt-in status
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  if (!isBrevoConfigured()) {
    res.json({ newsletter_optin: false, confirmed: false })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const customer = await pgConnection("customer")
    .select("email")
    .where("id", customerId)
    .whereNull("deleted_at")
    .first()

  if (!customer) {
    res.status(404).json({ message: "Customer not found" })
    return
  }

  try {
    const contact = await getContact(customer.email)
    const optin = contact?.attributes?.NEWSLETTER_OPTIN === true
    res.json({ newsletter_optin: optin })
  } catch {
    res.json({ newsletter_optin: false })
  }
}

// POST /store/account/newsletter — Update newsletter opt-in preference
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const { newsletter_optin } = req.body as { newsletter_optin: boolean }
  if (typeof newsletter_optin !== "boolean") {
    res.status(400).json({ message: "newsletter_optin must be a boolean" })
    return
  }

  if (!isBrevoConfigured()) {
    res.json({ success: false, message: "Newsletter service not configured" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const customer = await pgConnection("customer")
    .select("email", "first_name", "last_name")
    .where("id", customerId)
    .whereNull("deleted_at")
    .first()

  if (!customer) {
    res.status(404).json({ message: "Customer not found" })
    return
  }

  try {
    if (newsletter_optin) {
      // Opt-in: upsert contact with NEWSLETTER_OPTIN=true + DOI_PENDING
      // Brevo Double Opt-in is handled via Brevo's built-in DOI flow
      const listIds = BREVO_LIST_VOD_AUCTIONS
        ? [BREVO_LIST_VOD_AUCTIONS]
        : undefined

      await upsertContact(
        customer.email,
        {
          FIRSTNAME: customer.first_name || "",
          LASTNAME: customer.last_name || "",
          NEWSLETTER_OPTIN: true,
          MEDUSA_CUSTOMER_ID: customerId,
          PLATFORM_ORIGIN: "vod-auctions",
        },
        listIds
      )
    } else {
      // Opt-out: set NEWSLETTER_OPTIN to false
      await updateContactAttributes(customer.email, {
        NEWSLETTER_OPTIN: false,
      })
    }

    console.log(
      `[newsletter] ${newsletter_optin ? "Opt-in" : "Opt-out"}: ${customer.email}`
    )
    res.json({ success: true, newsletter_optin })
  } catch (err: any) {
    console.error("[newsletter] Error:", err.message)
    res.status(500).json({ message: "Newsletter update failed" })
  }
}
