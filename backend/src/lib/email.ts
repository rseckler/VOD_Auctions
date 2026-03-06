import { Resend } from "resend"

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
