import { emailLayout, emailButton, formatPrice } from "./layout"

type OrderItem = {
  title: string
  artistName?: string
  coverImage?: string
  price: number
}

export function paymentConfirmationEmail(opts: {
  firstName: string
  orderGroupId: string
  items: OrderItem[]
  totalAmount: number
  shippingCost: number
  paidAt: Date
  accountUrl: string
  customerId?: string
}): { subject: string; html: string } {
  const shortOrderId = opts.orderGroupId.substring(0, 13).toUpperCase()
  const paidDate = new Date(opts.paidAt).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })

  const itemRows = opts.items.map((item) => {
    const label = item.artistName ? `${item.artistName} — ${item.title}` : item.title
    return `<tr>
      <td style="font-size:13px;color:#c4bdb5;padding:5px 0;font-family:'DM Sans',-apple-system,sans-serif;">${label}</td>
      <td style="font-size:13px;color:#e8e0d4;text-align:right;padding:5px 0;font-weight:600;font-family:'DM Sans',-apple-system,sans-serif;">${formatPrice(item.price)}</td>
    </tr>`
  }).join("")

  return {
    subject: `Payment Confirmed — Order #${shortOrderId}`,
    html: emailLayout(`
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#0e1f14;border:1px solid #1a4a28;border-radius:8px;margin:0 0 24px;border-collapse:collapse;">
        <tr>
          <td style="padding:14px 18px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr>
                <td style="width:20px;font-size:16px;color:#4ade80;vertical-align:middle;padding-right:10px;">&#10003;</td>
                <td style="font-size:15px;font-weight:700;color:#4ade80;font-family:'DM Sans',-apple-system,sans-serif;">Payment received</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 24px;font-size:15px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        Hi ${opts.firstName}, we&rsquo;ve received your payment. Your order is now being prepared for shipping.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 16px;border-collapse:collapse;">
        <tr><td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="font-size:12px;color:#6b6560;padding:3px 0;font-family:'DM Sans',-apple-system,sans-serif;letter-spacing:0.04em;text-transform:uppercase;">Order number</td>
              <td style="font-size:13px;color:#d4a54a;font-family:monospace;text-align:right;padding:3px 0;font-weight:600;">#${shortOrderId}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#6b6560;padding:3px 0;font-family:'DM Sans',-apple-system,sans-serif;letter-spacing:0.04em;text-transform:uppercase;">Paid on</td>
              <td style="font-size:13px;color:#c4bdb5;text-align:right;padding:3px 0;font-family:'DM Sans',-apple-system,sans-serif;">${paidDate}</td>
            </tr>
          </table>
        </td></tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            ${itemRows}
            <tr>
              <td style="font-size:13px;color:#6b6560;padding:5px 0;font-family:'DM Sans',-apple-system,sans-serif;">Shipping</td>
              <td style="font-size:13px;color:#c4bdb5;text-align:right;padding:5px 0;font-family:'DM Sans',-apple-system,sans-serif;">${formatPrice(opts.shippingCost)}</td>
            </tr>
            <tr><td colspan="2" style="height:1px;border-top:1px solid #2a2520;padding:8px 0 4px;font-size:0;"></td></tr>
            <tr>
              <td style="font-size:14px;font-weight:700;color:#e8e0d4;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Total</td>
              <td style="font-size:16px;font-weight:700;color:#d4a54a;text-align:right;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">${formatPrice(opts.totalAmount)}</td>
            </tr>
          </table>
        </td></tr>
      </table>

      <p style="margin:0 0 24px;font-size:14px;color:#6b6560;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">
        We&rsquo;ll send you a tracking number as soon as your order ships.
      </p>

      ${emailButton("View Order Details", opts.accountUrl)}
    `, {
      preheader: "Payment received — your records are being prepared for shipping",
      customerId: opts.customerId,
    }),
  }
}
