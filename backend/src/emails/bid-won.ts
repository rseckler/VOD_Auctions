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
}): { subject: string; html: string } {
  const lotLabel = opts.lotNumber ? `Lot #${String(opts.lotNumber).padStart(2, "0")}` : ""
  const subtitle = [lotLabel, opts.blockTitle].filter(Boolean).join(" — ")

  return {
    subject: `Congratulations! You won${lotLabel ? ` ${lotLabel}` : ""}`,
    html: emailLayout(`
      <div style="text-align:center;margin-bottom:16px;">
        <p style="font-size:32px;margin:0;">&#127881;</p>
        <h2 style="margin:4px 0;font-size:18px;font-weight:bold;color:#18181b;">Congratulations, ${opts.firstName}!</h2>
        <p style="margin:0;font-size:14px;color:#71717a;">You won the auction.</p>
      </div>
      ${emailItemPreview({
        imageUrl: opts.coverImage,
        title: opts.artistName ? `${opts.artistName} — ${opts.itemTitle}` : opts.itemTitle,
        subtitle,
      })}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#52525b;padding:2px 0;">Final price</td>
                <td style="font-size:13px;color:#15803d;font-weight:bold;text-align:right;padding:2px 0;">${formatPrice(opts.finalPrice)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">
        Please complete your payment within 5 days so we can ship your record as soon as possible.
      </p>
      ${emailButton("Pay Now", opts.paymentUrl)}
    `),
  }
}
