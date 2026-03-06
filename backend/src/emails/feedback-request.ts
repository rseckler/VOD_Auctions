import { emailLayout, emailButton, emailItemPreview } from "./layout.js"

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
}): { subject: string; html: string } {
  const itemsHtml = opts.items.map((item) =>
    emailItemPreview({
      imageUrl: item.coverImage,
      title: item.artistName ? `${item.artistName} — ${item.title}` : item.title,
    })
  ).join("")

  const ratingButtons = [
    { emoji: "&#128543;", label: "1" },
    { emoji: "&#128528;", label: "2" },
    { emoji: "&#128578;", label: "3" },
    { emoji: "&#128522;", label: "4" },
    { emoji: "&#129321;", label: "5" },
  ].map((r) =>
    `<td style="text-align:center;">
      <a href="${opts.feedbackUrl}&rating=${r.label}" style="display:inline-block;width:40px;height:40px;line-height:40px;background-color:#f4f4f5;border-radius:50%;font-size:20px;text-decoration:none;">${r.emoji}</a>
    </td>`
  ).join("")

  return {
    subject: "How was your experience at VOD Auctions?",
    html: emailLayout(`
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#18181b;">How was your purchase?</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">
        Hi ${opts.firstName}, your order should have arrived by now. We hope you're happy with it!
      </p>
      ${itemsHtml}
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">
        Your feedback helps us make VOD Auctions even better. How do you rate your purchase?
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
        <tr>${ratingButtons}</tr>
      </table>
      ${emailButton("Leave Feedback", opts.feedbackUrl)}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin-top:16px;">
        <tr>
          <td style="padding:12px;">
            <p style="margin:0;font-size:14px;font-weight:500;color:#92400e;">New auctions are waiting!</p>
            <p style="margin:4px 0 0;font-size:12px;color:#b45309;">Check out our upcoming auction blocks.</p>
            <p style="margin:8px 0 0;"><a href="${opts.auctionsUrl}" style="font-size:12px;color:#d4a54a;text-decoration:underline;">Browse auctions</a></p>
          </td>
        </tr>
      </table>
    `),
  }
}
