import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createHmac } from "crypto"
import { sendEmail } from "../../../lib/email"
import { newsletterConfirmEmail } from "../../../emails/newsletter-confirm"

const STOREFRONT_URL = process.env.STOREFRONT_URL || "http://localhost:3000"
const BACKEND_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"

/**
 * Generate a daily HMAC token for newsletter double opt-in.
 * Valid for today + yesterday window to handle midnight edge cases.
 */
function generateConfirmToken(email: string): string {
  const secret = process.env.REVALIDATE_SECRET || "fallback-secret"
  const day = Math.floor(Date.now() / 86_400_000)
  return createHmac("sha256", secret)
    .update(`newsletter:${email.toLowerCase()}:${day}`)
    .digest("hex")
    .slice(0, 40)
}

function verifyConfirmToken(email: string, token: string): boolean {
  const secret = process.env.REVALIDATE_SECRET || "fallback-secret"
  const now = Math.floor(Date.now() / 86_400_000)
  for (const day of [now, now - 1]) {
    const expected = createHmac("sha256", secret)
      .update(`newsletter:${email.toLowerCase()}:${day}`)
      .digest("hex")
      .slice(0, 40)
    if (token === expected) return true
  }
  return false
}

export { verifyConfirmToken }

/**
 * POST /store/newsletter
 *
 * Accepts an email address, sends a double opt-in confirmation email.
 * Does NOT add to Brevo list until the confirmation link is clicked.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { email } = req.body as { email?: string }

  if (!email || !email.includes("@")) {
    res.status(400).json({ message: "Valid email address is required" })
    return
  }

  const normalised = email.trim().toLowerCase()
  const token = generateConfirmToken(normalised)
  const confirmUrl = `${BACKEND_URL}/store/newsletter/confirm?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalised)}`

  const { subject, html } = newsletterConfirmEmail({ email: normalised, confirmUrl })

  try {
    await sendEmail({ to: normalised, subject, html })
    res.json({ success: true })
  } catch (error: any) {
    console.error("[newsletter] Failed to send confirmation email:", error.message)
    res.status(500).json({ message: "Failed to send confirmation email. Please try again." })
  }
}
