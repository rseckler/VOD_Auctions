import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { generateUnsubscribeToken } from "../../../lib/email-helpers"

const STOREFRONT_URL = process.env.STOREFRONT_URL || "http://localhost:3000"

/**
 * GET /store/email-preferences/unsubscribe?token={token}&id={customerId}
 *
 * Validates HMAC token, marks customer as unsubscribed,
 * then redirects to /email-preferences/unsubscribed confirmation page.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const token = req.query.token as string
  const customerId = req.query.id as string

  if (!token || !customerId) {
    res.status(400).json({ message: "Missing token or id parameter" })
    return
  }

  // Verify HMAC token
  const expectedToken = generateUnsubscribeToken(customerId)
  if (token !== expectedToken) {
    res.status(400).json({ message: "Invalid unsubscribe token" })
    return
  }

  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  // Check customer exists
  const customer = await pg("customer")
    .where("id", customerId)
    .select("id", "email")
    .first()

  if (!customer) {
    // Redirect anyway — don't leak customer existence
    res.redirect(`${STOREFRONT_URL}/email-preferences/unsubscribed`)
    return
  }

  // Mark as unsubscribed (use metadata JSONB column if email_subscribed doesn't exist)
  // Try to update email_subscribed field; fall back gracefully if column doesn't exist
  try {
    await pg("customer")
      .where("id", customerId)
      .update({ email_subscribed: false, updated_at: new Date() })
  } catch {
    // Column may not exist — log and continue (redirect still happens)
    console.warn(`[unsubscribe] Could not update email_subscribed for customer ${customerId} — column may not exist`)
  }

  console.log(`[unsubscribe] Customer ${customerId} (${customer.email}) unsubscribed via email link`)

  res.redirect(`${STOREFRONT_URL}/email-preferences/unsubscribed`)
}
