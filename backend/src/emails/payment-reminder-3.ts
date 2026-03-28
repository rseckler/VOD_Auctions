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
}): { subject: string; html: string } {
  const itemCount = opts.items.length
  const itemWord = itemCount === 1 ? "item" : "items"

  // Format deadline as e.g. "Monday, 31 March 2026"
  const deadlineStr = opts.deadlineDate.toLocaleDateString("en-GB", {
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
      <div style="text-align:center;margin-bottom:16px;">
        <p style="font-size:32px;margin:0;">&#9888;&#65039;</p>
        <h2 style="margin:4px 0;font-size:18px;font-weight:bold;color:#18181b;">Final reminder, ${opts.firstName}</h2>
        <p style="margin:0;font-size:14px;color:#71717a;">Your payment for ${itemCount} ${itemWord} from <strong>${opts.blockTitle}</strong> is due tomorrow.</p>
      </div>
      ${itemRows}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:12px;font-size:13px;color:#991b1b;">
            &#9888; If payment is not received by <strong>${deadlineStr}</strong>, your items will be re-listed and your win will be forfeited.
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">
        Pay now to secure your wins — this is your final reminder.
      </p>
      ${emailButton("Pay Now to Secure Your Wins", opts.paymentUrl)}
    `),
  }
}
