import { emailLayout, emailButton, emailItemPreview, formatPrice } from "./layout"

export function watchlistReminderEmail(opts: {
  firstName: string
  itemTitle: string
  artistName?: string
  coverImage?: string
  lotNumber?: number
  currentPrice: number
  format?: string
  year?: number
  bidUrl: string
  customerId?: string
}): { subject: string; html: string } {
  const lotLabel = opts.lotNumber ? `Lot #${String(opts.lotNumber).padStart(2, "0")}` : ""
  const titleLine = opts.artistName ? `${opts.artistName} — ${opts.itemTitle}` : opts.itemTitle
  const detailParts = [opts.format, opts.year?.toString()].filter(Boolean).join(", ")

  return {
    subject: `24 hours left: ${titleLine}`,
    html: emailLayout(`
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#1a1608;border:1px solid #4a3a10;border-radius:8px;margin:0 0 24px;border-collapse:collapse;">
        <tr>
          <td style="padding:14px 18px;">
            <p style="margin:0;font-size:15px;font-weight:700;color:#d4a54a;font-family:'DM Sans',-apple-system,sans-serif;">&#9201; Less than 24 hours remaining</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 20px;font-size:15px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        Hi ${opts.firstName}, an item on your watchlist is ending soon.
      </p>

      ${emailItemPreview({
        imageUrl: opts.coverImage,
        title: titleLine,
        subtitle: lotLabel || undefined,
        detail: detailParts || undefined,
      })}

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            ${lotLabel ? `<tr>
              <td style="font-size:13px;color:#6b6560;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Lot</td>
              <td style="font-size:13px;color:#c4bdb5;text-align:right;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">${lotLabel}</td>
            </tr>` : ""}
            <tr>
              <td style="font-size:13px;color:#6b6560;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Current bid</td>
              <td style="font-size:16px;color:#d4a54a;font-weight:700;text-align:right;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">${formatPrice(opts.currentPrice)}</td>
            </tr>
            ${opts.format ? `<tr>
              <td style="font-size:13px;color:#6b6560;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Format</td>
              <td style="font-size:13px;color:#c4bdb5;text-align:right;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">${opts.format}</td>
            </tr>` : ""}
            ${opts.year ? `<tr>
              <td style="font-size:13px;color:#6b6560;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Year</td>
              <td style="font-size:13px;color:#c4bdb5;text-align:right;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">${opts.year}</td>
            </tr>` : ""}
          </table>
        </td></tr>
      </table>

      <p style="margin:0 0 24px;font-size:14px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        Don&rsquo;t miss your chance &mdash; place a bid before the auction closes.
      </p>

      ${emailButton("Bid Now", opts.bidUrl)}
    `, {
      preheader: "24 hours left on an item you saved — don't miss out",
      customerId: opts.customerId,
    }),
  }
}
