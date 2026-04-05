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
  customerId?: string
}): { subject: string; html: string } {
  const shortOrderId = opts.orderGroupId.substring(0, 13).toUpperCase()

  const itemsHtml = opts.items.map((item) =>
    emailItemPreview({
      imageUrl: item.coverImage,
      title: item.artistName ? `${item.artistName} — ${item.title}` : item.title,
      subtitle: `Order #${shortOrderId}`,
    })
  ).join("")

  const addressLines = opts.shippingAddress
    ? [
        opts.shippingAddress.name,
        opts.shippingAddress.line1,
        [opts.shippingAddress.postalCode, opts.shippingAddress.city].filter(Boolean).join(" "),
        opts.shippingAddress.country,
      ].filter(Boolean)
    : []

  const addressHtml = addressLines.length > 0
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:11px;color:#6b6560;letter-spacing:0.05em;text-transform:uppercase;font-family:'DM Sans',-apple-system,sans-serif;">Delivery address</p>
          <p style="margin:0;font-size:14px;color:#c4bdb5;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">${addressLines.join("<br>")}</p>
        </td></tr>
      </table>`
    : ""

  return {
    subject: "Your order has shipped!",
    html: emailLayout(`
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#0d1b24;border:1px solid #1a3a4a;border-radius:8px;margin:0 0 24px;border-collapse:collapse;">
        <tr>
          <td style="padding:16px 20px;text-align:center;">
            <p style="margin:0 0 6px;font-size:28px;line-height:1;">&#128230;</p>
            <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#e8e0d4;font-family:'DM Sans',-apple-system,sans-serif;">Your records are on their way!</p>
            <p style="margin:0;font-size:13px;color:#6b9e9e;font-family:'DM Sans',-apple-system,sans-serif;">Hi ${opts.firstName} &mdash; we&rsquo;ve shipped your order.</p>
          </td>
        </tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="font-size:13px;color:#6b6560;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Carrier</td>
              <td style="font-size:13px;color:#c4bdb5;text-align:right;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">${opts.carrier}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#6b6560;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Tracking number</td>
              <td style="font-size:13px;color:#d4a54a;font-family:monospace;text-align:right;padding:4px 0;font-weight:600;">${opts.trackingNumber}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#6b6560;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Order</td>
              <td style="font-size:13px;color:#c4bdb5;font-family:monospace;text-align:right;padding:4px 0;">#${shortOrderId}</td>
            </tr>
          </table>
        </td></tr>
      </table>

      ${itemsHtml}
      ${addressHtml}

      ${opts.trackingUrl ? emailButton("Track Shipment", opts.trackingUrl) : ""}

      <p style="margin:20px 0 0;font-size:13px;color:#6b6560;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">
        Any questions? Write to <a href="mailto:support@vod-auctions.com" style="color:#d4a54a;text-decoration:none;">support@vod-auctions.com</a>
      </p>
    `, {
      preheader: "Your records are on their way — here's your tracking info",
      customerId: opts.customerId,
    }),
  }
}
