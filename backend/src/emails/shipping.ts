import { emailLayout, emailButton, emailItemPreview } from "./layout"

type ShippingItem = {
  title: string
  artistName?: string
  coverImage?: string
}

export function shippingEmail(opts: {
  firstName: string
  orderGroupId: string
  items: ShippingItem[]
  carrier: string
  trackingNumber: string
  trackingUrl: string | null
  shippingAddress?: {
    name?: string
    line1?: string
    city?: string
    postalCode?: string
    country?: string
  }
}): { subject: string; html: string } {
  const shortOrderId = opts.orderGroupId.substring(0, 13).toUpperCase()

  const itemsHtml = opts.items.map((item) =>
    emailItemPreview({
      imageUrl: item.coverImage,
      title: item.artistName ? `${item.artistName} — ${item.title}` : item.title,
      subtitle: `Order #${shortOrderId}`,
    })
  ).join("")

  const addressHtml = opts.shippingAddress
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;margin-bottom:16px;">
        <tr><td style="padding:12px;">
          <p style="margin:0 0 4px;font-size:12px;color:#71717a;">Delivery address</p>
          <p style="margin:0;font-size:14px;color:#18181b;">${[
            opts.shippingAddress.name,
            opts.shippingAddress.line1,
            [opts.shippingAddress.postalCode, opts.shippingAddress.city].filter(Boolean).join(" "),
            opts.shippingAddress.country,
          ].filter(Boolean).join("<br/>")}</p>
        </td></tr>
      </table>`
    : ""

  return {
    subject: "Your order has shipped!",
    html: emailLayout(`
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#18181b;">Your order has shipped!</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">
        Hi ${opts.firstName}, your order has been shipped and is on its way to you.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#71717a;padding:2px 0;">Carrier</td>
                <td style="font-size:13px;color:#18181b;text-align:right;padding:2px 0;">${opts.carrier}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#71717a;padding:2px 0;">Tracking number</td>
                <td style="font-size:13px;color:#18181b;font-family:monospace;text-align:right;padding:2px 0;">${opts.trackingNumber}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      ${itemsHtml}
      ${addressHtml}
      ${opts.trackingUrl ? emailButton("Track Shipment", opts.trackingUrl) : ""}
    `),
  }
}
