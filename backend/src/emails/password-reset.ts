import { emailLayout, emailButton } from "./layout"

export function passwordResetEmail(opts: {
  firstName: string
  resetUrl: string
}): { subject: string; html: string } {
  return {
    subject: "Reset your password — VOD Auctions",
    html: emailLayout(`
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#e8e0d4;font-family:'DM Sans',-apple-system,sans-serif;">Reset your password</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        Hi ${opts.firstName}, we received a request to reset your password. Click the button below to choose a new one.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:14px 18px;">
          <p style="margin:0 0 4px;font-size:13px;color:#8a847e;font-family:'DM Sans',-apple-system,sans-serif;">&#9201; This link expires in <strong style="color:#c4bdb5;">15 minutes</strong>.</p>
          <p style="margin:0;font-size:13px;color:#4a4540;font-family:'DM Sans',-apple-system,sans-serif;">If you didn&rsquo;t request this, you can safely ignore this email.</p>
        </td></tr>
      </table>

      ${emailButton("Reset Password", opts.resetUrl)}

      <p style="margin:20px 0 0;font-size:13px;color:#4a4540;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">
        If the button doesn&rsquo;t work, copy and paste this link into your browser:<br>
        <a href="${opts.resetUrl}" style="color:#d4a54a;word-break:break-all;text-decoration:none;">${opts.resetUrl}</a>
      </p>
    `, {
      preheader: "Your password reset link — valid for 15 minutes",
      // No customerId — security email, no unsubscribe
    }),
  }
}
