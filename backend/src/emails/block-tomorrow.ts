import {
  newsletterLayout,
  newsletterHeading,
  newsletterParagraph,
  newsletterButton,
  newsletterLotGrid,
  newsletterDivider,
  formatCET,
  NewsletterItem,
} from "./newsletter-layout"

export function blockTomorrowEmail(opts: {
  blockTitle: string
  blockDescription?: string | null
  blockSlug: string
  startTime: Date
  itemCount: number
  previewItems: NewsletterItem[]   // up to 6 lots
}): { subject: string; html: string } {
  const startStr = formatCET(opts.startTime)
  const subject = `Starts Tomorrow: ${opts.blockTitle} — bidding opens at ${startStr}`

  const previewSection = opts.previewItems.length > 0
    ? `${newsletterDivider()}
       <p style="margin:0 0 14px;font-size:12px;color:#a39d96;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">Preview — ${opts.itemCount} Lots</p>
       ${newsletterLotGrid(opts.previewItems)}`
    : ""

  const html = newsletterLayout(`
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td style="background-color:#2a2520;color:#d4a54a;font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:0.8px;text-transform:uppercase;border:1px solid #d4a54a;">Starts Tomorrow</td>
      </tr>
    </table>
    ${newsletterHeading(opts.blockTitle)}
    ${opts.blockDescription
      ? newsletterParagraph(opts.blockDescription)
      : newsletterParagraph(
          `Bidding opens tomorrow, <strong style="color:#f5f0ea;">${startStr}</strong>. Browse all ${opts.itemCount} lots now and make sure you don&rsquo;t miss the opening.`
        )
    }
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#252016;border-radius:10px;margin-bottom:24px;">
      <tr>
        <td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size:13px;color:#a39d96;padding:3px 0;">Bidding opens</td>
              <td style="font-size:13px;color:#d4a54a;font-weight:700;text-align:right;padding:3px 0;">${startStr}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#a39d96;padding:3px 0;">Total lots</td>
              <td style="font-size:13px;color:#f5f0ea;font-weight:600;text-align:right;padding:3px 0;">${opts.itemCount}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${newsletterButton(`View All ${opts.itemCount} Lots →`, `https://vod-auctions.com/auctions/${opts.blockSlug}`)}
    ${previewSection}
    <div style="height:20px;"></div>
  `)

  return { subject, html }
}
