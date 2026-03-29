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

export function blockEndingEmail(opts: {
  blockTitle: string
  blockSlug: string
  endTime: Date
  topItems: NewsletterItem[]   // top 5 by bid_count DESC
}): { subject: string; html: string } {
  const endStr = formatCET(opts.endTime)
  const subject = `Last chance: ${opts.blockTitle} ends in 6 hours`
  const preheader = `Auction closes at ${endStr}. Place your final bids now before time runs out.`

  const topSection = opts.topItems.length > 0
    ? `${newsletterDivider()}
       <p style="margin:0 0 12px;font-size:12px;color:#a39d96;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">Most Active Lots</p>
       ${opts.topItems.map((item) => newsletterLotRow(item)).join("")}`
    : ""

  const html = newsletterLayout(`
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td style="background-color:#d97706;color:#1c1915;font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:0.8px;text-transform:uppercase;">&#9203; Last Chance</td>
      </tr>
    </table>
    ${newsletterHeading(opts.blockTitle, `Auction closes at ${endStr}`)}
    ${newsletterParagraph(
      `This auction ends today at <strong style="color:#f5f0ea;">${endStr}</strong>. If you&rsquo;ve been watching any lots, now is the time to place your final bid.`
    )}
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#252016;border-radius:10px;margin-bottom:24px;border:1px solid #d97706;">
      <tr>
        <td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size:13px;color:#a39d96;padding:3px 0;">Closes</td>
              <td style="font-size:15px;color:#d97706;font-weight:700;text-align:right;padding:3px 0;">${endStr}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${newsletterButton("Bid Before It's Too Late →", `https://vod-auctions.com/auctions/${opts.blockSlug}`)}
    ${topSection}
    <div style="height:20px;"></div>
  `, preheader)

  return { subject, html }
}
