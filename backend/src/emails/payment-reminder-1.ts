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
  customerId?: string
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
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#1a1608;border:1px solid #4a3a10;border-radius:8px;margin:0 0 24px;border-collapse:collapse;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#e8e0d4;font-family:'DM Sans',-apple-system,sans-serif;">Payment reminder, ${opts.firstName}</p>
            <p style="margin:0;font-size:14px;color:#c4a84a;font-family:'DM Sans',-apple-system,sans-serif;">You won ${itemCount} ${itemWord} in <strong>${opts.blockTitle}</strong></p>
          </td>
        </tr>
      </table>

      ${itemRows}

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="font-size:13px;color:#6b6560;padding:3px 0;font-family:'DM Sans',-apple-system,sans-serif;">Payment deadline</td>
              <td style="font-size:13px;color:#e8e0d4;text-align:right;padding:3px 0;font-family:'DM Sans',-apple-system,sans-serif;">5 days from auction end</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#6b6560;padding:3px 0;font-family:'DM Sans',-apple-system,sans-serif;">Time remaining</td>
              <td style="font-size:14px;color:#d4a54a;font-weight:700;text-align:right;padding:3px 0;font-family:'DM Sans',-apple-system,sans-serif;">4 days</td>
            </tr>
          </table>
        </td></tr>
      </table>

      <p style="margin:0 0 24px;font-size:14px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        Complete your payment now to secure your ${itemWord}. If payment is not received by the deadline,
        your ${itemWord} will be automatically re-listed.
      </p>

      ${emailButton("Complete Payment Now", opts.paymentUrl)}
    `, {
      preheader: "Friendly reminder: your auction wins need payment in 4 days",
      customerId: opts.customerId,
    }),
  }
}
