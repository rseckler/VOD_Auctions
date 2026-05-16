import { emailLayout, emailButton } from "./layout"

export interface DigestPost {
  title: string
  author: string
  url: string
  reactions: number
  comments: number
}

// Weekly "Community Dispatch" — the week's most-engaged posts.
export function communityDigestEmail(opts: {
  firstName: string
  posts: DigestPost[]
  communityUrl: string
  settingsUrl: string
  customerId?: string
}): { subject: string; html: string } {
  const rows = opts.posts
    .slice(0, 8)
    .map(
      (p) => `
      <tr><td style="padding:12px 0;border-top:1px solid #2a2520;">
        <a href="${p.url}" style="font-size:16px;color:#e8e0d4;text-decoration:none;font-family:'DM Serif Display',Georgia,serif;">${p.title}</a>
        <div style="margin-top:4px;font-size:12px;color:#6b6560;font-family:'DM Sans',-apple-system,sans-serif;">
          by ${p.author} &middot; ${p.reactions} reactions &middot; ${p.comments} comments
        </div>
      </td></tr>`
    )
    .join("")
  return {
    subject: "VOD Community — your weekly dispatch",
    html: emailLayout(
      `
      <h2 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#e8e0d4;font-family:'DM Sans',-apple-system,sans-serif;line-height:1.2;">This week in the community, ${opts.firstName}</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        The posts collectors engaged with most over the past seven days:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;border-collapse:collapse;">
        ${rows}
      </table>
      ${emailButton("Open the community", opts.communityUrl)}
      <p style="margin:24px 0 0;font-size:13px;color:#6b6560;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">
        Manage these emails under
        <a href="${opts.settingsUrl}" style="color:#d4a54a;text-decoration:none;">community settings</a>.
      </p>
    `,
      { preheader: "The week's most-discussed records and dispatches", customerId: opts.customerId }
    ),
  }
}
