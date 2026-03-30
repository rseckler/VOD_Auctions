import { emailLayout, emailItemPreview, formatPrice } from "./layout"

export function bidPlacedEmail(opts: {
  firstName: string
  itemTitle: string
  artistName?: string
  coverImage?: string
  lotNumber?: number
  blockTitle?: string
  bidAmount: number
  lotUrl: string
  customerId?: string
}): { subject: string; html: string } {
  const lotLabel = opts.lotNumber ? `Lot #${String(opts.lotNumber).padStart(2, "0")}` : ""
  const subtitle = [lotLabel, opts.blockTitle].filter(Boolean).join(" — ")
  const displayTitle = opts.artistName ? `${opts.artistName} — ${opts.itemTitle}` : opts.itemTitle

  return {
    subject: `Bid confirmed${lotLabel ? ` — ${lotLabel}` : ""}: ${formatPrice(opts.bidAmount)}`,
    html: emailLayout(`
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#0d2a1a;border:1px solid #1a6b3a;border-radius:8px;margin:0 0 24px;border-collapse:collapse;">
        <tr>
          <td style="padding:14px 16px;">
            <p style="margin:0;font-size:15px;font-weight:700;color:#22c55e;font-family:'DM Sans',-apple-system,sans-serif;">You are the highest bidder</p>
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
              <td style="font-size:13px;color:#a39d96;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Your bid</td>
              <td style="font-size:22px;color:#d4a54a;font-weight:700;text-align:right;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">${formatPrice(opts.bidAmount)}</td>
            </tr>
          </table>
        </td></tr>
      </table>

      <p style="margin:0 0 24px;font-size:14px;color:#a39d96;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">
        We&rsquo;ll notify you immediately if someone outbids you. You only pay the minimum needed to stay in the lead &mdash; no buyer&rsquo;s premium.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:12px;">
        <tr>
          <td>
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="border-radius:6px;background-color:#d4a54a;text-align:center;">
                  <a href="${opts.lotUrl}" style="display:block;padding:13px 12px;font-size:14px;font-weight:700;color:#1c1915;text-decoration:none;border-radius:6px;font-family:'DM Sans',-apple-system,sans-serif;">View Lot</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:16px 0 0;font-size:12px;color:#4a4540;text-align:center;font-family:'DM Sans',-apple-system,sans-serif;">
        Proxy bidding: set a maximum and we&rsquo;ll bid automatically up to your limit.
      </p>
    `, {
      preheader: `Your bid of ${formatPrice(opts.bidAmount)} is the highest — you're in the lead!`,
      customerId: opts.customerId,
    }),
  }
}
