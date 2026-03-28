import { emailLayout, emailItemPreview, formatPrice } from "./layout"

export function outbidEmail(opts: {
  firstName: string
  itemTitle: string
  artistName?: string
  coverImage?: string
  lotNumber?: number
  blockTitle?: string
  yourBid: number
  currentBid: number
  suggestedBid: number
  bidUrl: string
}): { subject: string; html: string } {
  const lotLabel = opts.lotNumber ? `Lot #${String(opts.lotNumber).padStart(2, "0")}` : ""
  const subtitle = [lotLabel, opts.blockTitle].filter(Boolean).join(" — ")
  const rebidUrl = `${opts.bidUrl}?bid=${opts.suggestedBid.toFixed(2)}`

  return {
    subject: `You've been outbid${lotLabel ? ` — ${lotLabel}` : ""}`,
    html: emailLayout(`
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:12px;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#c2410c;">You've been outbid!</p>
          </td>
        </tr>
      </table>
      ${emailItemPreview({
        imageUrl: opts.coverImage,
        title: opts.artistName ? `${opts.artistName} — ${opts.itemTitle}` : opts.itemTitle,
        subtitle,
      })}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#71717a;padding:2px 0;">Your bid</td>
                <td style="font-size:13px;color:#18181b;text-align:right;text-decoration:line-through;padding:2px 0;">${formatPrice(opts.yourBid)}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#71717a;padding:2px 0;">Current highest bid</td>
                <td style="font-size:13px;color:#c2410c;font-weight:600;text-align:right;padding:2px 0;">${formatPrice(opts.currentBid)}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#71717a;padding:6px 0 2px;">Suggested rebid</td>
                <td style="font-size:15px;color:#d4a54a;font-weight:700;text-align:right;padding:6px 0 2px;">${formatPrice(opts.suggestedBid)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">
        Another bidder has taken the lead. The auction is still running — bid again now!
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
        <tr>
          <td style="padding-right:6px;">
            <a href="${rebidUrl}" style="display:block;width:100%;padding:12px 8px;background-color:#d4a54a;color:#1c1915;font-size:14px;font-weight:600;text-align:center;text-decoration:none;border-radius:8px;box-sizing:border-box;">Bid ${formatPrice(opts.suggestedBid)} Now</a>
          </td>
          <td style="padding-left:6px;">
            <a href="${opts.bidUrl}" style="display:block;width:100%;padding:12px 8px;background-color:#ffffff;color:#1c1915;font-size:14px;font-weight:500;text-align:center;text-decoration:none;border-radius:8px;border:1px solid #d4a54a;box-sizing:border-box;">View Lot</a>
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:11px;color:#a1a1aa;text-align:center;">
        You'll only pay the minimum needed to win — our proxy bidding system handles the rest.
      </p>
    `),
  }
}
