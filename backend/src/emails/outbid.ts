import { emailLayout, emailButton, emailItemPreview, formatPrice } from "./layout.js"

export function outbidEmail(opts: {
  firstName: string
  itemTitle: string
  artistName?: string
  coverImage?: string
  lotNumber?: number
  blockTitle?: string
  yourBid: number
  currentBid: number
  bidUrl: string
}): { subject: string; html: string } {
  const lotLabel = opts.lotNumber ? `Lot #${String(opts.lotNumber).padStart(2, "0")}` : ""
  const subtitle = [lotLabel, opts.blockTitle].filter(Boolean).join(" — ")

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
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">
        Another bidder has taken the lead. The auction is still running — bid again now!
      </p>
      ${emailButton("Bid Again", opts.bidUrl)}
    `),
  }
}
