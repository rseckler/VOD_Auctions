import { emailLayout, emailButton } from "./layout"

// Digest of a member's unread community notifications since the last email.
export function communityNotificationsEmail(opts: {
  firstName: string
  lines: string[]
  communityUrl: string
  settingsUrl: string
  customerId?: string
}): { subject: string; html: string } {
  const n = opts.lines.length
  const rows = opts.lines
    .slice(0, 12)
    .map(
      (l) =>
        `<tr><td style="padding:4px 0;vertical-align:top;width:20px;"><span style="color:#d4a54a;font-size:14px;">&#8250;</span></td>` +
        `<td style="padding:4px 0 4px 8px;font-size:14px;color:#c4bdb5;font-family:'DM Sans',-apple-system,sans-serif;">${l}</td></tr>`
    )
    .join("")
  return {
    subject:
      n === 1
        ? "You have a new notification on VOD Community"
        : `You have ${n} new notifications on VOD Community`,
    html: emailLayout(
      `
      <h2 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#e8e0d4;font-family:'DM Sans',-apple-system,sans-serif;line-height:1.2;">Hi ${opts.firstName},</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        Here is what happened in the community since we last wrote:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 28px;border-collapse:collapse;">
        <tr><td style="padding:16px 20px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${rows}</table></td></tr>
      </table>
      ${emailButton("Open notifications", opts.communityUrl)}
      <p style="margin:24px 0 0;font-size:13px;color:#6b6560;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">
        Don&rsquo;t want these emails? Turn them off under
        <a href="${opts.settingsUrl}" style="color:#d4a54a;text-decoration:none;">community settings</a>.
      </p>
    `,
      { preheader: `${n} new notification${n === 1 ? "" : "s"} in the VOD Community`, customerId: opts.customerId }
    ),
  }
}
