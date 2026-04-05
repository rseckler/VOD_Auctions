import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import crypto from "crypto"
import { sendWelcomeEmail } from "../../../../lib/email-helpers"
import { crmSyncRegistration } from "../../../../lib/crm-sync"
import { sendEmailWithLog, APP_URL } from "../../../../lib/email"
import { verifyEmailTemplate } from "../../../../emails/verify-email"

// POST /store/account/send-welcome — Send welcome email after registration
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

  // Send welcome email (async, non-blocking)
  sendWelcomeEmail(pgConnection, customerId).catch((err) => {
    console.error("[send-welcome] Failed:", err)
  })

  // Send verification email (async, non-blocking)
  sendVerificationEmail(pgConnection, customerId).catch((err) => {
    console.error("[send-welcome] Verification email failed:", err)
  })

  // Sync new customer to Brevo CRM (async, non-blocking)
  crmSyncRegistration(pgConnection, customerId).catch((err) => {
    console.error("[send-welcome] CRM sync failed:", err)
  })

  res.json({ success: true })
}

async function sendVerificationEmail(pg: Knex, customerId: string) {
  const customer = await pg("customer")
    .where("id", customerId)
    .select("id", "email", "first_name")
    .first()
  if (!customer?.email) return

  const token = crypto.randomBytes(32).toString("hex")
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  await pg("customer_verification").insert({
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

  await sendEmailWithLog(pg, { to: customer.email, subject, html, template: "verify-email" })
}
