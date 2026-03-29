import { emailLayout, emailButton } from "./layout"

export function newsletterConfirmEmail(opts: {
  email: string
  confirmUrl: string
}): { subject: string; html: string } {
  return {
    subject: "Confirm your VOD Auctions newsletter subscription",
    html: emailLayout(`
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#e8e0d4;font-family:'DM Sans',-apple-system,sans-serif;">One click to confirm</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        Thanks for signing up! Click the button below to confirm your subscription and stay
        updated on new auction blocks, rare finds, and curated industrial music from VOD Records.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:14px 18px;">
          <p style="margin:0 0 4px;font-size:13px;color:#8a847e;font-family:'DM Sans',-apple-system,sans-serif;">Subscribing as</p>
          <p style="margin:0;font-size:14px;color:#d4a54a;font-weight:600;font-family:monospace;">${opts.email}</p>
        </td></tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:14px 18px;">
          <p style="margin:0;font-size:13px;color:#8a847e;font-family:'DM Sans',-apple-system,sans-serif;">&#9201; This confirmation link expires in <strong style="color:#c4bdb5;">24 hours</strong>.</p>
        </td></tr>
      </table>

      ${emailButton("Confirm Subscription", opts.confirmUrl)}

      <p style="margin:24px 0 0;font-size:13px;color:#4a4540;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">
        If you didn&rsquo;t sign up for the VOD Auctions newsletter, you can safely ignore this email &mdash;
        you won&rsquo;t be subscribed unless you click the button above.
      </p>
      <p style="margin:12px 0 0;font-size:13px;color:#4a4540;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">
        If the button doesn&rsquo;t work, copy and paste this link into your browser:<br>
        <a href="${opts.confirmUrl}" style="color:#d4a54a;word-break:break-all;text-decoration:none;">${opts.confirmUrl}</a>
      </p>
    `, {
      preheader: "One click to confirm your VOD Auctions newsletter subscription",
    }),
  }
}
