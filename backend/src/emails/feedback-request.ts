import { emailLayout, emailButton, emailItemPreview } from "./layout"

type FeedbackItem = {
  title: string
  artistName?: string
  coverImage?: string
}

export function feedbackRequestEmail(opts: {
  firstName: string
  items: FeedbackItem[]
  feedbackUrl: string
  auctionsUrl: string
  customerId?: string
}): { subject: string; html: string } {
  const itemsHtml = opts.items.map((item) =>
    emailItemPreview({
      imageUrl: item.coverImage,
      title: item.artistName ? `${item.artistName} — ${item.title}` : item.title,
    })
  ).join("")

  const ratingButtons = [1, 2, 3, 4, 5].map((n) => {
    const emojis: Record<number, string> = { 1: "&#128543;", 2: "&#128528;", 3: "&#128578;", 4: "&#128522;", 5: "&#129321;" }
    return `<td style="padding:4px;text-align:center;">
      <a href="${opts.feedbackUrl}&rating=${n}" style="display:inline-block;width:44px;height:44px;line-height:44px;background-color:#111009;border:1px solid #2a2520;border-radius:50%;font-size:22px;text-decoration:none;text-align:center;">${emojis[n]}</a>
    </td>`
  }).join("")

  return {
    subject: "How was your experience at VOD Auctions?",
    html: emailLayout(`
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#e8e0d4;font-family:'DM Sans',-apple-system,sans-serif;">How was your purchase?</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        Hi ${opts.firstName}, your order should have arrived by now. We hope you&rsquo;re happy with it!
        Your feedback helps us improve VOD Auctions.
      </p>

      ${itemsHtml}

      <p style="margin:0 0 16px;font-size:15px;color:#e8e0d4;font-weight:600;text-align:center;font-family:'DM Sans',-apple-system,sans-serif;">How do you rate your experience?</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;border-collapse:collapse;">
        <tr>${ratingButtons}</tr>
      </table>

      ${emailButton("Leave Detailed Feedback", opts.feedbackUrl)}

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:24px 0 0;border-collapse:collapse;">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#d4a54a;font-family:'DM Sans',-apple-system,sans-serif;">More rare records are waiting</p>
          <p style="margin:0 0 10px;font-size:13px;color:#8a847e;font-family:'DM Sans',-apple-system,sans-serif;">New auction blocks launch every month.</p>
          <a href="${opts.auctionsUrl}" style="font-size:13px;color:#d4a54a;text-decoration:none;font-weight:600;font-family:'DM Sans',-apple-system,sans-serif;">Browse upcoming auctions &#8250;</a>
        </td></tr>
      </table>
    `, {
      preheader: "How did we do? We'd love to hear about your VOD Auctions experience",
      customerId: opts.customerId,
    }),
  }
}
