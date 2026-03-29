import { emailLayout, emailButton } from "./layout"

export function welcomeEmail(opts: {
  firstName: string
  auctionsUrl: string
  customerId?: string
}): { subject: string; html: string } {
  return {
    subject: "Welcome to VOD Auctions!",
    html: emailLayout(`
      <h2 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#e8e0d4;font-family:'DM Sans',-apple-system,sans-serif;line-height:1.2;">Welcome, ${opts.firstName}!</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        Great to have you on board. VOD Auctions is your platform for curated auctions of rare records
        from the world of Industrial, Experimental &amp; Electronic Music — no buyer&rsquo;s premium, ever.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        Over 40,000 records in thematically curated auction blocks are waiting for new owners.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 28px;border-collapse:collapse;">
        <tr><td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="padding:4px 0;vertical-align:top;width:20px;">
                <span style="color:#d4a54a;font-size:14px;">&#8250;</span>
              </td>
              <td style="padding:4px 0 4px 8px;font-size:14px;color:#c4bdb5;font-family:'DM Sans',-apple-system,sans-serif;">Browse curated auction blocks by theme, genre, or era</td>
            </tr>
            <tr>
              <td style="padding:4px 0;vertical-align:top;">
                <span style="color:#d4a54a;font-size:14px;">&#8250;</span>
              </td>
              <td style="padding:4px 0 4px 8px;font-size:14px;color:#c4bdb5;font-family:'DM Sans',-apple-system,sans-serif;">Place proxy bids — we automatically bid up to your maximum</td>
            </tr>
            <tr>
              <td style="padding:4px 0;vertical-align:top;">
                <span style="color:#d4a54a;font-size:14px;">&#8250;</span>
              </td>
              <td style="padding:4px 0 4px 8px;font-size:14px;color:#c4bdb5;font-family:'DM Sans',-apple-system,sans-serif;">Save items to your watchlist and get reminded before they end</td>
            </tr>
          </table>
        </td></tr>
      </table>

      ${emailButton("Browse Current Auctions", opts.auctionsUrl)}

      <p style="margin:24px 0 0;font-size:13px;color:#6b6560;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">
        Questions? Reply to this email or write to <a href="mailto:info@vod-records.com" style="color:#d4a54a;text-decoration:none;">info@vod-records.com</a>
      </p>
    `, {
      preheader: "Great to have you — 40,000+ rare industrial records are waiting for new owners.",
      customerId: opts.customerId,
    }),
  }
}
