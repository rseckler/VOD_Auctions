import {
  newsletterLayout,
  newsletterHeading,
  newsletterParagraph,
  newsletterButton,
  newsletterLotRow,
  newsletterDivider,
  formatCET,
  NewsletterItem,
} from "./newsletter-layout"

export function blockTeaserEmail(opts: {
  blockTitle: string
  blockSubtitle?: string | null
  blockSlug: string
  startTime: Date
  itemCount: number
  previewItems: NewsletterItem[]   // first 3 lots
}): { subject: string; html: string } {
  const startStr = formatCET(opts.startTime)
  const subject = `Coming Soon: ${opts.blockTitle} — ${opts.itemCount} lots of industrial music`
  const preheader = `${opts.itemCount} lots of rare industrial music launch on ${startStr}. Mark your calendar.`

  const previewSection = opts.previewItems.length > 0
    ? `${newsletterDivider()}
       <p style="margin:0 0 12px;font-size:12px;color:#a39d96;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">Preview Lots</p>
       ${opts.previewItems.map((item) => newsletterLotRow(item)).join("")}`
    : ""

  const html = newsletterLayout(`
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td style="background-color:#d4a54a;color:#1c1915;font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:0.8px;text-transform:uppercase;">Coming Soon</td>
      </tr>
    </table>
    ${newsletterHeading(opts.blockTitle, opts.blockSubtitle || undefined)}
    ${newsletterParagraph(
      `A new curated auction block launches on <strong style="color:#f5f0ea;">${startStr}</strong> — featuring ${opts.itemCount} hand-picked lots of rare industrial, post-industrial, and electronic music.`
    )}
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#252016;border-radius:10px;margin-bottom:24px;">
      <tr>
        <td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size:13px;color:#a39d96;padding:3px 0;">Lots</td>
              <td style="font-size:13px;color:#f5f0ea;font-weight:600;text-align:right;padding:3px 0;">${opts.itemCount}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#a39d96;padding:3px 0;">Opens</td>
              <td style="font-size:13px;color:#f5f0ea;font-weight:600;text-align:right;padding:3px 0;">${startStr}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${newsletterButton("Save the Date →", `https://vod-auctions.com/auctions/${opts.blockSlug}`)}
    ${previewSection}
    <div style="height:20px;"></div>
  `, preheader)

  return { subject, html }
}
