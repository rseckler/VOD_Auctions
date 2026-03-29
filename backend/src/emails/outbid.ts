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
  customerId?: string
}): { subject: string; html: string } {
  const lotLabel = opts.lotNumber ? `Lot #${String(opts.lotNumber).padStart(2, "0")}` : ""
  const subtitle = [lotLabel, opts.blockTitle].filter(Boolean).join(" — ")
  const rebidUrl = `${opts.bidUrl}?bid=${opts.suggestedBid.toFixed(2)}`
  const displayTitle = opts.artistName ? `${opts.artistName} — ${opts.itemTitle}` : opts.itemTitle

  return {
    subject: `You've been outbid${lotLabel ? ` — ${lotLabel}` : ""}`,
    html: emailLayout(`
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#2a1a12;border:1px solid #7c3a1a;border-radius:8px;margin:0 0 24px;border-collapse:collapse;">
        <tr>
          <td style="padding:14px 16px;">
            <p style="margin:0;font-size:15px;font-weight:700;color:#f97316;font-family:'DM Sans',-apple-system,sans-serif;">Another bidder has taken the lead</p>
          </td>
        </tr>
      </table>

      ${emailItemPreview({
        imageUrl: opts.coverImage,
        title: displayTitle,
        subtitle,
      })}

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="font-size:13px;color:#6b6560;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Your bid</td>
              <td style="font-size:13px;color:#6b6560;text-align:right;text-decoration:line-through;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">${formatPrice(opts.yourBid)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#a39d96;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Highest bid now</td>
              <td style="font-size:14px;color:#f97316;font-weight:700;text-align:right;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">${formatPrice(opts.currentBid)}</td>
            </tr>
            <tr>
              <td colspan="2" style="height:8px;border-top:1px solid #2a2520;font-size:0;padding-top:8px;"></td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#a39d96;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Suggested rebid</td>
              <td style="font-size:18px;color:#d4a54a;font-weight:700;text-align:right;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">${formatPrice(opts.suggestedBid)}</td>
            </tr>
          </table>
        </td></tr>
      </table>

      <p style="margin:0 0 24px;font-size:14px;color:#a39d96;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">
        The auction is still running &mdash; bid again now to get back in the lead.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:12px;">
        <tr>
          <td style="padding-right:6px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="border-radius:6px;background-color:#d4a54a;text-align:center;">
                  <a href="${rebidUrl}" style="display:block;padding:13px 12px;font-size:14px;font-weight:700;color:#1c1915;text-decoration:none;border-radius:6px;font-family:'DM Sans',-apple-system,sans-serif;">Bid ${formatPrice(opts.suggestedBid)} Now</a>
                </td>
              </tr>
            </table>
          </td>
          <td style="padding-left:6px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="border-radius:6px;background-color:#1c1915;border:1px solid #2a2520;text-align:center;">
                  <a href="${opts.bidUrl}" style="display:block;padding:13px 12px;font-size:14px;font-weight:600;color:#e8e0d4;text-decoration:none;border-radius:6px;font-family:'DM Sans',-apple-system,sans-serif;">View Lot</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:16px 0 0;font-size:12px;color:#4a4540;text-align:center;font-family:'DM Sans',-apple-system,sans-serif;">
        Proxy bidding: you&rsquo;ll only ever pay the minimum needed to win.
      </p>
    `, {
      preheader: "Someone outbid you — jump back in before the auction closes",
      customerId: opts.customerId,
    }),
  }
}
