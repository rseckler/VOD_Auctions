import { Resend } from "resend"
import { Knex } from "knex"
import { generateEntityId } from "@medusajs/framework/utils"

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const FROM_EMAIL = process.env.EMAIL_FROM || "VOD Auctions <noreply@vod-auctions.com>"
const APP_URL = process.env.STOREFRONT_URL || "http://localhost:3000"

export { APP_URL }

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
}) {
  if (!resend) {
    console.warn("[email] Resend not configured — skipping email:", opts.subject, "→", opts.to)
    return null
  }

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    })
    console.log("[email] Sent:", opts.subject, "→", opts.to)
    return result
  } catch (err: any) {
    console.error("[email] Failed:", opts.subject, "→", opts.to, err.message)
    return null
  }
}

/** Log email send attempt to email_log table (fire-and-forget) */
export async function logEmail(
  pgConnection: Knex,
  opts: { to: string; subject: string; template: string; status: "sent" | "failed"; error?: string }
) {
  try {
    await pgConnection("email_log").insert({
      id: generateEntityId(),
      to_email: opts.to,
      subject: opts.subject,
      template: opts.template,
      status: opts.status,
      error: opts.error || null,
      created_at: new Date(),
    })
  } catch {
    // Don't let logging failures break the flow
  }
}

/** Send email with logging. Returns true if sent. */
export async function sendEmailWithLog(
  pgConnection: Knex,
  opts: { to: string; subject: string; html: string; template: string }
): Promise<boolean> {
  const result = await sendEmail(opts)
  const status = result ? "sent" : "failed"
  logEmail(pgConnection, { to: opts.to, subject: opts.subject, template: opts.template, status }).catch(() => {})
  return !!result
}
