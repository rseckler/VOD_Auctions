// Shared email layout components — inline CSS, Outlook-safe, dark VOD design system
// Uses 600px max-width, preheader text, HMAC unsubscribe links
import { getUnsubscribeUrl } from "../lib/email-helpers"

const STOREFRONT_URL = process.env.STOREFRONT_URL || "https://vod-auctions.com"

/** Full HTML document wrapper with preheader, header, body, footer */
export function emailLayout(
  content: string,
  opts: {
    preheader: string
    customerId?: string  // if provided, renders unsubscribe link in footer
  }
): string {
  const preheader = buildPreheader(opts.preheader)
  const footer = buildFooter(opts.customerId)

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  <style>td,th{font-family:'DM Sans',Arial,sans-serif!important}</style>
  <![endif]-->
</head>
<body style="word-spacing:normal;background-color:#0d0b08;margin:0;padding:0;">
  <div role="article" aria-roledescription="email" lang="en">
    ${preheader}

    <table align="center" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background-color:#0d0b08;border-collapse:collapse;">
      <tr><td align="center" style="padding:24px 16px;">

        <!-- Container -->
        <table align="center" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:600px;border-collapse:collapse;">

          <!-- Header -->
          <tr><td style="background-color:#1c1915;border-radius:12px 12px 0 0;border:1px solid #2a2520;padding:24px 32px;">
            <a href="${STOREFRONT_URL}" style="text-decoration:none;display:inline-block;">
              <span style="font-family:'DM Sans',Arial,sans-serif;font-size:18px;font-weight:700;color:#d4a54a;letter-spacing:0.08em;text-transform:uppercase;">VOD AUCTIONS</span>
            </a>
          </td></tr>

          <!-- Body -->
          <tr><td style="background-color:#1c1915;border-left:1px solid #2a2520;border-right:1px solid #2a2520;padding:40px 32px;">
            ${content}
          </td></tr>

          <!-- Divider -->
          <tr><td style="background-color:#1c1915;border-left:1px solid #2a2520;border-right:1px solid #2a2520;padding:0 32px;">
            <div style="height:1px;background-color:#2a2520;"></div>
          </td></tr>

          <!-- Footer -->
          ${footer}

        </table>
      </td></tr>
    </table>
  </div>
</body>
</html>`
}

function buildPreheader(text: string): string {
  // Pad to ~160 chars to prevent body text bleeding into preview
  const padding = "&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;"
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#0d0b08;line-height:1px;">${text}${padding}</div>`
}

function buildFooter(customerId?: string): string {
  const unsubscribeHtml = customerId
    ? `<a href="${getUnsubscribeUrl(customerId)}" style="color:#6b6560;text-decoration:none;">Unsubscribe</a>
       <span style="color:#3a3530;">&nbsp;&middot;&nbsp;</span>
       <a href="${STOREFRONT_URL}/email-preferences/${customerId}" style="color:#6b6560;text-decoration:none;">Email Preferences</a>
       <span style="color:#3a3530;">&nbsp;&middot;&nbsp;</span>
       <a href="${STOREFRONT_URL}" style="color:#6b6560;text-decoration:none;">Visit VOD Auctions</a>`
    : `<a href="${STOREFRONT_URL}" style="color:#6b6560;text-decoration:none;">Visit VOD Auctions</a>`

  return `<tr>
    <td style="background-color:#111009;padding:24px 32px;border-radius:0 0 12px 12px;border:1px solid #2a2520;border-top:none;text-align:center;">
      <p style="margin:0 0 8px;font-size:12px;color:#6b6560;font-family:'DM Sans',-apple-system,sans-serif;letter-spacing:0.03em;">VOD Auctions &middot; Curated Industrial &amp; Experimental Music</p>
      <p style="margin:0;font-size:12px;color:#6b6560;font-family:'DM Sans',-apple-system,sans-serif;">${unsubscribeHtml}</p>
    </td>
  </tr>`
}

/** Gold CTA button (Outlook-safe VML approach not needed for transactional; table cell gives solid bg) */
export function emailButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0;">
  <tr>
    <td style="border-radius:6px;background-color:#d4a54a;">
      <a href="${url}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#1c1915;text-decoration:none;border-radius:6px;font-family:'DM Sans',-apple-system,sans-serif;letter-spacing:0.01em;">${text}</a>
    </td>
  </tr>
</table>`
}

/** Item preview card — dark theme */
export function emailItemPreview(opts: {
  imageUrl?: string
  title: string
  subtitle?: string
  detail?: string
}): string {
  const imgBlock = opts.imageUrl
    ? `<td style="width:72px;padding:12px 0 12px 12px;vertical-align:top;">
        <img src="${opts.imageUrl}" width="56" height="56" alt="${opts.title}" style="display:block;width:56px;height:56px;border-radius:6px;object-fit:cover;">
      </td>`
    : ""
  const leftPad = opts.imageUrl ? "0" : "12px"

  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 16px;border-collapse:collapse;">
  <tr>
    ${imgBlock}
    <td style="padding:12px 12px 12px ${leftPad};vertical-align:top;">
      ${opts.subtitle ? `<p style="margin:0 0 3px;font-size:11px;color:#8a847e;font-family:'DM Sans',-apple-system,sans-serif;">${opts.subtitle}</p>` : ""}
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#e8e0d4;font-family:'DM Sans',-apple-system,sans-serif;">${opts.title}</p>
      ${opts.detail ? `<p style="margin:0;font-size:13px;color:#d4a54a;font-weight:600;font-family:'DM Sans',-apple-system,sans-serif;">${opts.detail}</p>` : ""}
    </td>
  </tr>
</table>`
}

/** Divider line */
export function emailDivider(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:24px 0;">
  <tr><td style="border-top:1px solid #2a2520;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>
</table>`
}

export function formatPrice(amount: number): string {
  return `€${Number(amount).toFixed(2)}`
}
