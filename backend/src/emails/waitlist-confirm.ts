import { emailLayout, emailButton } from "./layout"

export function waitlistConfirmEmail(opts: {
  firstName: string
  email: string
  customerId?: string
}): { subject: string; html: string } {
  return {
    subject: "Application received — VOD Auctions",
    html: emailLayout(`
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#1a1608;border:1px solid #4a3a10;border-radius:8px;margin:0 0 24px;border-collapse:collapse;">
        <tr>
          <td style="padding:14px 18px;">
            <p style="margin:0;font-size:15px;font-weight:700;color:#d4a54a;font-family:'DM Sans',-apple-system,sans-serif;">&#10003; Application received</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 20px;font-size:15px;color:#e8e0d4;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        Thanks for applying, ${opts.firstName}.
      </p>

      <p style="margin:0 0 20px;font-size:14px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        We review applications in waves. The first wave opens soon for tape-mag collectors
        who&rsquo;ve been with us the longest.
      </p>

      <p style="margin:0 0 24px;font-size:14px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        We&rsquo;ll email you at <strong style="color:#c4bdb5;">${opts.email}</strong> when your invite is ready.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:16px 20px;text-align:center;">
          <p style="margin:0 0 8px;font-size:12px;color:#6b6560;text-transform:uppercase;letter-spacing:0.06em;font-family:'DM Sans',-apple-system,sans-serif;">While you wait</p>
          <p style="margin:0;font-size:14px;color:#a39d96;font-family:'DM Sans',-apple-system,sans-serif;">
            Follow us for updates and previews from the catalogue.
          </p>
        </td></tr>
      </table>

      ${emailButton("Follow @vodrecords on Instagram", "https://instagram.com/vodrecords")}
    `, {
      preheader: "We're reviewing your application — you'll hear from us soon",
      customerId: opts.customerId,
    }),
  }
}
