import crypto from "crypto"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { sendEmail, APP_URL } from "../../../../lib/email"
import { verifyEmailTemplate } from "../../../../emails/verify-email"

// POST /store/account/verify-email — Generate token and send verification email
export async function POST(
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

  const customer = await pgConnection("customer")
    .where("id", customerId)
    .select("id", "email", "first_name", "email_verified")
    .first()

  if (!customer?.email) {
    res.status(404).json({ message: "Customer not found" })
    return
  }

  if (customer.email_verified) {
    res.json({ success: true, already_verified: true })
    return
  }

  const token = crypto.randomBytes(32).toString("hex")
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours

  await pgConnection("customer_verification").insert({
    id: generateEntityId(),
    customer_id: customerId,
    token,
    sent_at: now,
    expires_at: expiresAt,
    created_at: now,
  })

  const verifyUrl = `${APP_URL}/verify?token=${token}`
  const { subject, html } = verifyEmailTemplate({
    firstName: customer.first_name || "there",
    verifyUrl,
  })

  await sendEmail({ to: customer.email, subject, html })

  res.json({ success: true })
}
