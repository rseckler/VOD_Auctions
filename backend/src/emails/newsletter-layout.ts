// Dark-theme newsletter layout for VOD Auctions subscriber emails (Brevo campaigns)
// Brevo auto-injects {{ unsubscribe }} / {{ mirror }} variables into campaign footer.

export interface NewsletterItem {
  coverImage?: string | null
  artistName?: string | null
  title: string
  detail?: string | null     // e.g. start price or current bid
  lotNumber?: number | null
}

export function newsletterLayout(content: string, preheader?: string): string {
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#111009;line-height:1px;">${preheader}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>`
    : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#111009;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  ${preheaderHtml}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111009;">
    <tr>
      <td align="center" style="padding:24px 16px;">

        <!-- Header -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-collapse:collapse;">
          <tr>
            <td style="background-color:#111009;padding:20px 28px;border-radius:12px 12px 0 0;border:1px solid #2a2520;border-bottom:none;">
              <a href="https://vod-auctions.com" style="text-decoration:none;display:inline-block;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="width:26px;height:26px;background-color:#d4a54a;border-radius:50%;text-align:center;vertical-align:middle;font-size:12px;font-weight:700;color:#1c1915;line-height:26px;font-family:'DM Sans',-apple-system,sans-serif;">V</td>
                    <td style="padding-left:10px;color:#d4a54a;font-weight:700;font-size:15px;letter-spacing:0.08em;font-family:'DM Sans',-apple-system,sans-serif;">VOD AUCTIONS</td>
                  </tr>
                </table>
              </a>
            </td>
          </tr>
        </table>

        <!-- Body -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#1c1915;border:1px solid #2a2520;border-top:none;border-bottom:none;border-collapse:collapse;">
          <tr>
            <td style="padding:28px 28px 16px;">
              ${content}
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-collapse:collapse;">
          <tr>
            <td style="background-color:#111009;padding:20px 28px;border-radius:0 0 12px 12px;border:1px solid #2a2520;border-top:1px solid #2a2520;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#6b6560;font-family:'DM Sans',-apple-system,sans-serif;">VOD Auctions &mdash; Curated Industrial Music Auctions</p>
              <p style="margin:0;font-size:12px;color:#6b6560;font-family:'DM Sans',-apple-system,sans-serif;">
                <a href="{{ unsubscribe }}" style="color:#6b6560;text-decoration:none;">Unsubscribe</a>
                &nbsp;&middot;&nbsp;
                <a href="{{ mirror }}" style="color:#6b6560;text-decoration:none;">View in browser</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
}

export function newsletterHeading(text: string, sub?: string): string {
  return `<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#f5f0ea;line-height:1.2;">${text}</h1>
${sub ? `<p style="margin:0 0 20px;font-size:14px;color:#a39d96;">${sub}</p>` : "<div style='margin-bottom:20px;'></div>"}`
}

export function newsletterParagraph(text: string): string {
  return `<p style="margin:0 0 20px;font-size:14px;color:#c4bdb5;line-height:1.6;">${text}</p>`
}

export function newsletterButton(text: string, url: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
  <tr>
    <td align="center">
      <a href="${url}" style="display:inline-block;padding:14px 36px;background-color:#d4a54a;color:#1c1915;font-size:15px;font-weight:700;text-align:center;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">${text}</a>
    </td>
  </tr>
</table>`
}

/**
 * Renders a 3-column grid of lot preview cards (email-safe table layout).
 * Pass up to 6 items; renders in rows of 3.
 */
export function newsletterLotGrid(items: NewsletterItem[]): string {
  const rows: string[] = []
  for (let i = 0; i < items.length; i += 3) {
    const chunk = items.slice(i, i + 3)
    // Pad to 3 columns so table is balanced
    while (chunk.length < 3) chunk.push({ title: "", coverImage: null })
    const cells = chunk.map((item) => {
      if (!item.title) {
        return `<td width="33%" style="padding:4px;" valign="top"></td>`
      }
      const lotLabel = item.lotNumber ? `<p style="margin:0 0 4px;font-size:10px;color:#d4a54a;letter-spacing:0.5px;font-weight:600;">LOT #${String(item.lotNumber).padStart(2, "0")}</p>` : ""
      const imgSrc = item.coverImage || ""
      const imgBlock = imgSrc
        ? `<img src="${imgSrc}" alt="" width="160" height="160" style="display:block;width:100%;max-width:160px;height:auto;aspect-ratio:1/1;object-fit:cover;border-radius:6px;margin-bottom:8px;" />`
        : `<div style="width:100%;max-width:160px;aspect-ratio:1/1;background-color:#2a2520;border-radius:6px;margin-bottom:8px;display:block;"></div>`
      const artist = item.artistName ? `<p style="margin:0 0 2px;font-size:11px;color:#a39d96;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.artistName}</p>` : ""
      const titleEl = `<p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#f5f0ea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.title}</p>`
      const detailEl = item.detail ? `<p style="margin:0;font-size:11px;color:#d4a54a;">${item.detail}</p>` : ""
      return `<td width="33%" style="padding:4px;" valign="top">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#252016;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:10px 10px 0;">
            ${imgBlock}
            ${lotLabel}
            ${artist}
            ${titleEl}
            ${detailEl}
          </td></tr>
          <tr><td style="height:10px;"></td></tr>
        </table>
      </td>`
    })
    rows.push(`<tr>${cells.join("")}</tr>`)
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
  ${rows.join("<tr><td colspan='3' style='height:8px;'></td></tr>")}
</table>`
}

/**
 * A single featured lot (used in teaser email — 3 preview items stacked vertically)
 */
export function newsletterLotRow(item: NewsletterItem): string {
  const lotLabel = item.lotNumber ? `Lot #${String(item.lotNumber).padStart(2, "0")} &nbsp;` : ""
  const imgSrc = item.coverImage || ""
  const imgBlock = imgSrc
    ? `<td style="width:64px;vertical-align:top;padding-right:14px;"><img src="${imgSrc}" alt="" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:8px;" /></td>`
    : `<td style="width:64px;vertical-align:top;padding-right:14px;"><div style="width:64px;height:64px;background-color:#2a2520;border-radius:8px;"></div></td>`
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#252016;border-radius:10px;margin-bottom:10px;">
  <tr>
    <td style="padding:12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          ${imgBlock}
          <td style="vertical-align:middle;">
            ${item.artistName ? `<p style="margin:0 0 2px;font-size:11px;color:#a39d96;">${item.artistName}</p>` : ""}
            <p style="margin:0;font-size:13px;font-weight:600;color:#f5f0ea;">${item.title}</p>
            ${item.detail ? `<p style="margin:4px 0 0;font-size:12px;color:#d4a54a;">${item.detail}</p>` : ""}
            ${lotLabel ? `<p style="margin:4px 0 0;font-size:11px;color:#6b6560;">${lotLabel}</p>` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}

/**
 * Divider line
 */
export function newsletterDivider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
  <tr><td style="border-top:1px solid #2a2520;"></td></tr>
</table>`
}

/**
 * Format a Date as "28 Mar at 14:00 CET" using Europe/Berlin timezone.
 * Automatically shows CET (UTC+1) or CEST (UTC+2) depending on the date.
 */
export function formatCET(date: Date): string {
  const dateStr = date.toLocaleDateString("en-GB", {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "short",
  })
  const timeStr = date.toLocaleTimeString("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  // Determine whether we're in CET (UTC+1) or CEST (UTC+2) for the given date
  // by comparing UTC offset: if Berlin is 2h ahead of UTC it's CEST, otherwise CET
  const utcHour = date.getUTCHours()
  const berlinHour = parseInt(
    date.toLocaleTimeString("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false }),
    10
  )
  const offsetHours = (berlinHour - utcHour + 24) % 24
  const tzLabel = offsetHours === 2 ? "CEST" : "CET"
  return `${dateStr} at ${timeStr} ${tzLabel}`
}
