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

export function blockLiveEmail(opts: {
  blockTitle: string
  blockSlug: string
  endTime: Date
  itemCount: number
  previewItems: NewsletterItem[]   // up to 6 lots
}): { subject: string; html: string } {
  const endStr = formatCET(opts.endTime)
  const subject = `🔴 LIVE NOW: ${opts.blockTitle} — bidding open`

  const previewSection = opts.previewItems.length > 0
    ? `${newsletterDivider()}
       <p style="margin:0 0 14px;font-size:12px;color:#a39d96;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">${opts.itemCount} Lots — Bidding Now Open</p>
       ${newsletterLotGrid(opts.previewItems)}`
    : ""

  const html = newsletterLayout(`
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td style="background-color:#dc2626;color:#ffffff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:0.8px;text-transform:uppercase;">&#9679; Live Now</td>
      </tr>
    </table>
    ${newsletterHeading(opts.blockTitle, "Bidding is now open")}
    ${newsletterParagraph(
      `Bidding is now live for <strong style="color:#f5f0ea;">${opts.itemCount} lots</strong> of rare industrial and electronic music. The auction closes on <strong style="color:#f5f0ea;">${endStr}</strong> — place your bids before time runs out.`
    )}
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#252016;border-radius:10px;margin-bottom:24px;">
      <tr>
        <td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size:13px;color:#a39d96;padding:3px 0;">Status</td>
              <td style="padding:3px 0;text-align:right;">
                <span style="display:inline-block;background-color:#dc2626;color:#ffffff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:0.5px;">LIVE</span>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#a39d96;padding:3px 0;">Total lots</td>
              <td style="font-size:13px;color:#f5f0ea;font-weight:600;text-align:right;padding:3px 0;">${opts.itemCount}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#a39d96;padding:3px 0;">Closes</td>
              <td style="font-size:13px;color:#d4a54a;font-weight:700;text-align:right;padding:3px 0;">${endStr}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${newsletterButton("Bid Now →", `https://vod-auctions.com/auctions/${opts.blockSlug}`)}
    ${previewSection}
    <div style="height:20px;"></div>
  `)

  return { subject, html }
}
