import { emailLayout, emailButton, emailItemPreview, formatPrice } from "./layout"

export function paymentReminder1Email(opts: {
  firstName: string
  blockTitle: string
  items: Array<{
    title: string
    artistName?: string
    coverImage?: string
    lotNumber?: number
    amount: number
  }>
  paymentUrl: string
}): { subject: string; html: string } {
  const itemCount = opts.items.length
  const itemWord = itemCount === 1 ? "item" : "items"

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
    subject: `Reminder: You won an auction — payment due in 4 days`,
    html: emailLayout(`
      <div style="text-align:center;margin-bottom:16px;">
        <p style="font-size:32px;margin:0;">&#128276;</p>
        <h2 style="margin:4px 0;font-size:18px;font-weight:bold;color:#18181b;">Payment reminder, ${opts.firstName}</h2>
        <p style="margin:0;font-size:14px;color:#71717a;">You won ${itemCount} ${itemWord} in <strong>${opts.blockTitle}</strong>.</p>
      </div>
      ${itemRows}
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">
        Payment is due within <strong>5 days</strong> of auction end. You have <strong>4 days remaining</strong> — complete your payment now to secure your win.
      </p>
      ${emailButton("Complete Payment Now", opts.paymentUrl)}
    `),
  }
}
