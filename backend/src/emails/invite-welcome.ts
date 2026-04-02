import { emailLayout, emailButton, emailItemPreview } from "./layout"

const STOREFRONT_URL = process.env.STOREFRONT_URL || "https://vod-auctions.com"

export function inviteWelcomeEmail(opts: {
  firstName: string
  tokenDisplay: string
  inviteUrl: string
  expiresAt: Date
  customerId?: string
}): { subject: string; html: string } {
  const expiryStr = opts.expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return {
    subject: `${opts.firstName}, your access to VOD Auctions is ready`,
    html: emailLayout(`
      <p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#e8e0d4;line-height:1.5;font-family:'DM Serif Display','DM Sans',-apple-system,sans-serif;">
        Your early access is ready, ${opts.firstName}.
      </p>

      <p style="margin:0 0 24px;font-size:15px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        You&rsquo;re one of the first collectors to get access. 41,500 rare industrial releases
        are waiting &mdash; no fees, no commissions.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:20px;text-align:center;">
          <p style="margin:0 0 6px;font-size:11px;color:#6b6560;text-transform:uppercase;letter-spacing:0.1em;font-family:'DM Sans',-apple-system,sans-serif;">Your personal invite code</p>
          <p style="margin:0;font-size:22px;font-weight:700;color:#d4a54a;letter-spacing:0.08em;font-family:'DM Sans',-apple-system,monospace;">${opts.tokenDisplay}</p>
        </td></tr>
      </table>

      ${emailButton("Claim Your Access", opts.inviteUrl)}

      <p style="margin:20px 0 0;font-size:12px;color:#4a4540;text-align:center;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">
        This link is personal and can only be used once.<br>
        Valid until ${expiryStr}.
      </p>
    `, {
      preheader: "Your personal invite link — valid for 21 days",
      customerId: opts.customerId,
    }),
  }
}
