// Shared email layout components — inline CSS for email client compatibility

export function emailLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VOD Auctions</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
          ${emailHeader()}
          <tr>
            <td style="padding:24px;">
              ${content}
            </td>
          </tr>
          ${emailFooter()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function emailHeader(): string {
  return `<tr>
  <td style="background-color:#1c1915;padding:24px;text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="width:22px;height:22px;background-color:#d4a54a;border-radius:50%;text-align:center;vertical-align:middle;font-size:11px;font-weight:bold;color:#1c1915;line-height:22px;">V</td>
        <td style="padding-left:8px;color:#d4a54a;font-weight:600;font-size:14px;">VOD Auctions</td>
      </tr>
    </table>
  </td>
</tr>`
}

export function emailFooter(): string {
  return `<tr>
  <td style="border-top:1px solid #e4e4e7;padding:16px 24px;text-align:center;font-size:11px;color:#a1a1aa;">
    <p style="margin:0;">VOD Auctions &mdash; Curated Music Auctions</p>
    <p style="margin:4px 0 0;">
      <a href="{UNSUBSCRIBE_URL}" style="color:#a1a1aa;text-decoration:underline;">Unsubscribe</a> &middot;
      <a href="{SETTINGS_URL}" style="color:#a1a1aa;text-decoration:underline;">Settings</a>
    </p>
  </td>
</tr>`
}

export function emailButton(text: string, url: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <a href="${url}" style="display:inline-block;width:100%;max-width:400px;padding:12px 24px;background-color:#d4a54a;color:#1c1915;font-size:14px;font-weight:600;text-align:center;text-decoration:none;border-radius:8px;box-sizing:border-box;">${text}</a>
    </td>
  </tr>
</table>`
}

export function emailItemPreview(opts: {
  imageUrl?: string
  title: string
  subtitle?: string
  detail?: string
}): string {
  const img = opts.imageUrl
    ? `<td style="width:56px;vertical-align:top;"><img src="${opts.imageUrl}" alt="" width="56" height="56" style="border-radius:8px;object-fit:cover;display:block;" /></td>`
    : ""
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;padding:12px;margin-bottom:16px;">
  <tr>
    ${img}
    <td style="padding-left:${opts.imageUrl ? "12px" : "0"};vertical-align:top;">
      ${opts.subtitle ? `<p style="margin:0;font-size:12px;color:#71717a;">${opts.subtitle}</p>` : ""}
      <p style="margin:2px 0 0;font-size:14px;font-weight:500;color:#18181b;">${opts.title}</p>
      ${opts.detail ? `<p style="margin:2px 0 0;font-size:12px;color:#71717a;">${opts.detail}</p>` : ""}
    </td>
  </tr>
</table>`
}

export function formatPrice(amount: number): string {
  return `€${amount.toFixed(2)}`
}
