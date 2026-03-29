import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { upsertContact, BREVO_LIST_VOD_AUCTIONS } from "../../../../lib/brevo"
import { verifyConfirmToken } from "../route"

const STOREFRONT_URL = process.env.STOREFRONT_URL || "http://localhost:3000"

/**
 * GET /store/newsletter/confirm?token={token}&email={email}
 *
 * Validates daily HMAC token (today and yesterday window),
 * adds the subscriber to Brevo VOD Auctions list,
 * then redirects to /newsletter/confirmed.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const token = req.query.token as string
  const email = req.query.email as string

  if (!token || !email || !email.includes("@")) {
    res.status(400).json({ message: "Missing or invalid parameters" })
    return
  }

  const normalised = email.trim().toLowerCase()

  if (!verifyConfirmToken(normalised, token)) {
    // Redirect to confirmation page with error state — don't leak validity info
    res.redirect(`${STOREFRONT_URL}/newsletter/confirmed?error=invalid`)
    return
  }

  try {
    const listIds = BREVO_LIST_VOD_AUCTIONS ? [BREVO_LIST_VOD_AUCTIONS] : undefined
    await upsertContact(normalised, {
      NEWSLETTER_OPTIN: true,
      NEWSLETTER_CONFIRMED: true,
      PLATFORM_ORIGIN: "vod-auctions",
      NEWSLETTER_SIGNUP_DATE: new Date().toISOString().split("T")[0],
    }, listIds)

    console.log(`[newsletter/confirm] ${normalised} confirmed and added to Brevo list ${BREVO_LIST_VOD_AUCTIONS}`)
  } catch (error: any) {
    console.error("[newsletter/confirm] Brevo upsert failed:", error.message)
    // Redirect anyway — don't block the user on a provider error
  }

  // If this email belongs to a registered customer, tag them in customer_stats
  try {
    const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    const customer = await pgConnection("customer")
      .where("email", normalised)
      .whereNull("deleted_at")
      .select("id")
      .first()

    if (customer) {
      await pgConnection.raw(`
        UPDATE customer_stats
        SET tags = array_append(tags, 'newsletter_subscriber'),
            updated_at = NOW()
        WHERE customer_id = ?
          AND NOT (tags @> ARRAY['newsletter_subscriber'])
      `, [customer.id])
    }
  } catch (e: any) {
    // Non-critical — don't block redirect
    console.warn("[newsletter/confirm] customer_stats tag update failed:", e.message)
  }

  res.redirect(`${STOREFRONT_URL}/newsletter/confirmed`)
}
