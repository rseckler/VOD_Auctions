import { emailLayout, emailButton, emailItemPreview, formatPrice } from "./layout"

export function bidWonEmail(opts: {
  firstName: string
  itemTitle: string
  artistName?: string
  coverImage?: string
  lotNumber?: number
  blockTitle?: string
  finalPrice: number
  paymentUrl: string
  customerId?: string
}): { subject: string; html: string } {
  const lotLabel = opts.lotNumber ? `Lot #${String(opts.lotNumber).padStart(2, "0")}` : ""
  const subtitle = [lotLabel, opts.blockTitle].filter(Boolean).join(" — ")
  const displayTitle = opts.artistName ? `${opts.artistName} — ${opts.itemTitle}` : opts.itemTitle

  return {
    subject: `Congratulations! You won${lotLabel ? ` ${lotLabel}` : ""}`,
    html: emailLayout(`
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#0e1f14;border:1px solid #1a4a28;border-radius:8px;margin:0 0 24px;border-collapse:collapse;">
        <tr>
          <td style="padding:18px 20px;text-align:center;">
            <p style="margin:0 0 8px;font-size:32px;line-height:1;">&#127881;</p>
            <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#e8e0d4;font-family:'DM Sans',-apple-system,sans-serif;">Congratulations, ${opts.firstName}!</p>
            <p style="margin:0;font-size:14px;color:#6b9e7c;font-family:'DM Sans',-apple-system,sans-serif;">You won the auction &mdash; no buyer&rsquo;s premium added.</p>
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
              <td style="font-size:13px;color:#6b6560;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Final price</td>
              <td style="font-size:20px;color:#d4a54a;font-weight:700;text-align:right;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">${formatPrice(opts.finalPrice)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#6b6560;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Buyer&rsquo;s premium</td>
              <td style="font-size:13px;color:#6b9e7c;font-weight:600;text-align:right;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">None &#10003;</td>
            </tr>
          </table>
        </td></tr>
      </table>

      <p style="margin:0 0 24px;font-size:14px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        Please complete your payment within <strong style="color:#e8e0d4;">5 days</strong> to secure your win.
        After that, unpaid items are automatically re-listed.
      </p>

      ${emailButton("Complete Payment", opts.paymentUrl)}

      <p style="margin:20px 0 0;font-size:13px;color:#6b6560;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">
        Questions about your win? Write to <a href="mailto:support@vod-auctions.com" style="color:#d4a54a;text-decoration:none;">support@vod-auctions.com</a>
      </p>
    `, {
      preheader: "You won! Complete your payment within 5 days to secure your records",
      customerId: opts.customerId,
    }),
  }
}
