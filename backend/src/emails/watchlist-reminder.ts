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
}): { subject: string; html: string } {
  const lotLabel = opts.lotNumber ? `Lot #${String(opts.lotNumber).padStart(2, "0")}` : ""
  const titleLine = opts.artistName ? `${opts.artistName} — ${opts.itemTitle}` : opts.itemTitle
  const detailParts = [opts.format, opts.year?.toString()].filter(Boolean).join(", ")

  return {
    subject: `24 hours left: ${titleLine} goes to auction soon`,
    html: emailLayout(`
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fefce8;border:1px solid #fde68a;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:12px;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#92400e;">⏱ Less than 24 hours remaining</p>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">
        Hi ${opts.firstName}, an item on your watchlist is ending soon.
      </p>
      ${emailItemPreview({
        imageUrl: opts.coverImage,
        title: titleLine,
        subtitle: lotLabel || undefined,
        detail: detailParts || undefined,
      })}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${lotLabel ? `<tr>
                <td style="font-size:13px;color:#71717a;padding:2px 0;">Lot</td>
                <td style="font-size:13px;color:#18181b;text-align:right;padding:2px 0;">${lotLabel}</td>
              </tr>` : ""}
              <tr>
                <td style="font-size:13px;color:#71717a;padding:2px 0;">Current bid</td>
                <td style="font-size:13px;color:#18181b;font-weight:600;text-align:right;padding:2px 0;">${formatPrice(opts.currentPrice)}</td>
              </tr>
              ${opts.format ? `<tr>
                <td style="font-size:13px;color:#71717a;padding:2px 0;">Format</td>
                <td style="font-size:13px;color:#18181b;text-align:right;padding:2px 0;">${opts.format}</td>
              </tr>` : ""}
              ${opts.year ? `<tr>
                <td style="font-size:13px;color:#71717a;padding:2px 0;">Year</td>
                <td style="font-size:13px;color:#18181b;text-align:right;padding:2px 0;">${opts.year}</td>
              </tr>` : ""}
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">
        Don't miss your chance — place a bid before the auction closes.
      </p>
      ${emailButton("Bid Now", opts.bidUrl)}
      <p style="margin:24px 0 0;font-size:11px;color:#a1a1aa;text-align:center;">
        You're receiving this because you saved this item to your watchlist. Unsubscribe link coming soon.
      </p>
    `),
  }
}
