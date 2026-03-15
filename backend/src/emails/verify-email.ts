import { emailLayout, emailButton } from "./layout"

export function verifyEmailTemplate(opts: {
  firstName: string
  verifyUrl: string
}): { subject: string; html: string } {
  return {
    subject: "Verify your email — VOD Auctions",
    html: emailLayout(`
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#18181b;">Verify your email address</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;line-height:1.6;">
        Hi ${opts.firstName}, please click the button below to verify your email address and complete your registration.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:12px;">
            <p style="margin:0;font-size:12px;color:#71717a;">This link expires in 24 hours.</p>
          </td>
        </tr>
      </table>
      ${emailButton("Verify Email", opts.verifyUrl)}
      <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5;">
        If you didn&apos;t create an account on VOD Auctions, you can safely ignore this email.
      </p>
    `),
  }
}
