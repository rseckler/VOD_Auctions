import { emailLayout, emailButton } from "./layout"

export function welcomeEmail(opts: {
  firstName: string
  auctionsUrl: string
}): { subject: string; html: string } {
  return {
    subject: "Welcome to VOD Auctions!",
    html: emailLayout(`
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#18181b;">Welcome, ${opts.firstName}!</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;line-height:1.6;">
        Great to have you on board. VOD Auctions is your platform for curated auctions of rare records
        from the world of Industrial, Experimental &amp; Electronic Music.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;line-height:1.6;">
        Over 40,000 records are waiting in thematically curated auction blocks for new owners.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:12px;">
            <p style="margin:0;font-size:12px;color:#71717a;">Your next step:</p>
            <p style="margin:4px 0 0;font-size:14px;font-weight:500;color:#18181b;">Browse our current auctions and place your first bid!</p>
          </td>
        </tr>
      </table>
      ${emailButton("Browse Auctions", opts.auctionsUrl)}
    `),
  }
}
