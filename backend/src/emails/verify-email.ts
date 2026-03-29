import { emailLayout, emailButton } from "./layout"

export function verifyEmailTemplate(opts: {
  firstName: string
  verifyUrl: string
}): { subject: string; html: string } {
  return {
    subject: "Verify your email — VOD Auctions",
    html: emailLayout(`
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#e8e0d4;font-family:'DM Sans',-apple-system,sans-serif;">Verify your email address</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        Hi ${opts.firstName}, please confirm your email address to complete your registration and start bidding on rare records.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:14px 18px;">
          <p style="margin:0;font-size:13px;color:#8a847e;font-family:'DM Sans',-apple-system,sans-serif;">&#9201; This verification link expires in <strong style="color:#c4bdb5;">24 hours</strong>.</p>
        </td></tr>
      </table>

      ${emailButton("Verify Email Address", opts.verifyUrl)}

      <p style="margin:20px 0 0;font-size:13px;color:#4a4540;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">
        If the button doesn&rsquo;t work, copy and paste this link into your browser:<br>
        <a href="${opts.verifyUrl}" style="color:#d4a54a;word-break:break-all;text-decoration:none;">${opts.verifyUrl}</a>
      </p>
      <p style="margin:12px 0 0;font-size:13px;color:#4a4540;font-family:'DM Sans',-apple-system,sans-serif;">
        Didn&rsquo;t create an account? You can safely ignore this email.
      </p>
    `, {
      preheader: "Just one click to complete your VOD Auctions registration",
      // No customerId — not yet a confirmed customer
    }),
  }
}
