import { emailLayout, emailButton, emailItemPreview, formatPrice } from "./layout"

export function paymentReminder3Email(opts: {
  firstName: string
  blockTitle: string
  items: Array<{
    title: string
    artistName?: string
    coverImage?: string
    lotNumber?: number
    amount: number
  }>
  deadlineDate: Date
  paymentUrl: string
  customerId?: string
}): { subject: string; html: string } {
  const itemCount = opts.items.length
  const itemWord = itemCount === 1 ? "item" : "items"

  const deadlineStr = new Date(opts.deadlineDate).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

  const itemRows = opts.items.map((item) => {
    const lotLabel = item.lotNumber ? `Lot #${String(item.lotNumber).padStart(2, "0")}` : ""
    const displayTitle = item.artistName ? `${item.artistName} — ${item.title}` : item.title
    return emailItemPreview({
      imageUrl: item.coverImage,
      title: displayTitle,
      subtitle: [lotLabel, opts.blockTitle].filter(Boolean).join(" — "),
      detail: formatPrice(item.amount),
    })
  }).join("")

  return {
    subject: `Final reminder: Auction payment due tomorrow`,
    html: emailLayout(`
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#1f0e0e;border:1px solid #5a1a1a;border-radius:8px;margin:0 0 24px;border-collapse:collapse;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#e8e0d4;font-family:'DM Sans',-apple-system,sans-serif;">Final reminder, ${opts.firstName}</p>
            <p style="margin:0;font-size:14px;color:#f87171;font-family:'DM Sans',-apple-system,sans-serif;">
              Payment for ${itemCount} ${itemWord} from <strong>${opts.blockTitle}</strong> is due tomorrow.
            </p>
          </td>
        </tr>
      </table>

      ${itemRows}

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#1f0e0e;border-radius:8px;border:1px solid #5a1a1a;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:12px;color:#f87171;letter-spacing:0.04em;text-transform:uppercase;font-family:'DM Sans',-apple-system,sans-serif;">&#9888; Action required by</p>
          <p style="margin:0;font-size:15px;font-weight:700;color:#fca5a5;font-family:'DM Sans',-apple-system,sans-serif;">${deadlineStr}</p>
          <p style="margin:8px 0 0;font-size:13px;color:#a39d96;line-height:1.5;font-family:'DM Sans',-apple-system,sans-serif;">
            If payment is not received by this deadline, your ${itemWord} will be re-listed and your win forfeited.
          </p>
        </td></tr>
      </table>

      <p style="margin:0 0 24px;font-size:14px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        This is your final reminder &mdash; pay now to keep your ${itemWord}.
      </p>

      ${emailButton("Pay Now to Secure Your Wins", opts.paymentUrl)}
    `, {
      preheader: "Last chance: pay by tomorrow or your items will be re-listed",
      customerId: opts.customerId,
    }),
  }
}
