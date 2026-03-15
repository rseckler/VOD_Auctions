import { emailLayout, emailButton } from "./layout"

export function passwordResetEmail(opts: {
  firstName: string
  resetUrl: string
}): { subject: string; html: string } {
  return {
    subject: "Reset your password — VOD Auctions",
    html: emailLayout(`
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#18181b;">Reset your password</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;line-height:1.6;">
        Hi ${opts.firstName}, we received a request to reset your password. Click the button below to choose a new one.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:12px;">
            <p style="margin:0;font-size:12px;color:#71717a;">This link expires in 15 minutes.</p>
            <p style="margin:4px 0 0;font-size:14px;font-weight:500;color:#18181b;">If you didn't request this, you can safely ignore this email.</p>
          </td>
        </tr>
      </table>
      ${emailButton("Reset Password", opts.resetUrl)}
      <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${opts.resetUrl}" style="color:#d4a54a;word-break:break-all;">${opts.resetUrl}</a>
      </p>
    `),
  }
}
