// Newsletter double-opt-in trigger.
//
// Extracted from /store/newsletter POST so it can be reused by
// /store/customer/register when the user ticks the newsletter checkbox at
// signup. Same daily HMAC token contract as /store/newsletter, so the
// existing /store/newsletter/confirm endpoint can finalise either flow.

import { createHmac } from "crypto"
import type { Knex } from "knex"
import { sendEmailWithLog } from "./email"
import { newsletterConfirmEmail } from "../emails/newsletter-confirm"

const STOREFRONT_URL = process.env.STOREFRONT_URL || "http://localhost:3000"

function generateConfirmToken(email: string): string {
  const secret = process.env.REVALIDATE_SECRET || "fallback-secret"
  const day = Math.floor(Date.now() / 86_400_000)
  return createHmac("sha256", secret)
    .update(`newsletter:${email.toLowerCase()}:${day}`)
    .digest("hex")
    .slice(0, 40)
}

export async function triggerNewsletterDoi(pg: Knex, email: string): Promise<void> {
  const normalised = email.trim().toLowerCase()
  const token = generateConfirmToken(normalised)
  const confirmUrl = `${STOREFRONT_URL}/newsletter/confirm?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalised)}`
  const { subject, html } = newsletterConfirmEmail({ email: normalised, confirmUrl })
  await sendEmailWithLog(pg, {
    to: normalised,
    subject,
    html,
    template: "newsletter-confirm",
  })
}
