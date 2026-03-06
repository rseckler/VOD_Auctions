import { emailLayout, emailButton, formatPrice } from "./layout.js"

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
}): { subject: string; html: string } {
  const shortOrderId = opts.orderGroupId.substring(0, 13).toUpperCase()
  const paidDate = opts.paidAt.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })

  const itemRows = opts.items.map((item) => {
    const label = item.artistName ? `${item.artistName} — ${item.title}` : item.title
    return `<tr>
      <td style="font-size:13px;color:#18181b;padding:4px 0;">${label}</td>
      <td style="font-size:13px;color:#18181b;text-align:right;padding:4px 0;">${formatPrice(item.price)}</td>
    </tr>`
  }).join("")

  return {
    subject: `Payment Confirmed — Order #${shortOrderId}`,
    html: emailLayout(`
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:12px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="font-size:16px;color:#15803d;padding-right:8px;">&#10003;</td>
              <td style="font-size:14px;font-weight:600;color:#15803d;">Payment successfully received</td>
            </tr></table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">
        Hi ${opts.firstName}, we have received your payment. Your order is now being prepared for shipping.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#71717a;padding:2px 0;">Order number</td>
                <td style="font-size:13px;color:#18181b;font-family:monospace;text-align:right;padding:2px 0;">#${shortOrderId}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#71717a;padding:2px 0;">Paid on</td>
                <td style="font-size:13px;color:#18181b;text-align:right;padding:2px 0;">${paidDate}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${itemRows}
              <tr>
                <td style="font-size:13px;color:#71717a;padding:4px 0;">Shipping</td>
                <td style="font-size:13px;color:#18181b;text-align:right;padding:4px 0;">${formatPrice(opts.shippingCost)}</td>
              </tr>
              <tr>
                <td colspan="2" style="border-top:1px solid #e4e4e7;padding-top:8px;margin-top:4px;"></td>
              </tr>
              <tr>
                <td style="font-size:14px;font-weight:600;color:#18181b;padding:2px 0;">Total</td>
                <td style="font-size:14px;font-weight:bold;color:#18181b;text-align:right;padding:2px 0;">${formatPrice(opts.totalAmount)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#71717a;">
        We'll notify you when your order ships.
      </p>
      ${emailButton("View Order", opts.accountUrl)}
    `),
  }
}
