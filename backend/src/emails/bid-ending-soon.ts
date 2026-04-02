import { emailLayout, emailItemPreview, emailButton, formatPrice } from "./layout"

export type BidEndingReminderType = "24h" | "8h" | "1h" | "5m"

const REMINDER_CONFIG: Record<BidEndingReminderType, {
  subject: (title: string) => string
  headline: string
  headlineColor: string
  bannerBg: string
  bannerBorder: string
  preheader: string
  bodyText: (firstName: string) => string
}> = {
  "24h": {
    subject: (title) => `Ending tomorrow — ${title}`,
    headline: "⏰ Ending in 24 hours",
    headlineColor: "#d4a54a",
    bannerBg: "#1a1608",
    bannerBorder: "#4a3a10",
    preheader: "You have an active bid on a lot ending in 24 hours",
    bodyText: (n) => `Hi ${n}, a lot you've bid on closes tomorrow. Make sure your max bid is still competitive.`,
  },
  "8h": {
    subject: (title) => `8 hours left — ${title}`,
    headline: "⏳ 8 hours remaining",
    headlineColor: "#d4a54a",
    bannerBg: "#1a1608",
    bannerBorder: "#4a3a10",
    preheader: "Your bid expires in 8 hours — check the current price",
    bodyText: (n) => `Hi ${n}, less than 8 hours to go. Bidding is heating up — confirm your position now.`,
  },
  "1h": {
    subject: (title) => `Last hour — ${title}`,
    headline: "🔥 Final hour",
    headlineColor: "#f97316",
    bannerBg: "#2a1a12",
    bannerBorder: "#7c3a1a",
    preheader: "One hour left on a lot you've bid on — don't miss out",
    bodyText: (n) => `Hi ${n}, the auction closes in under 60 minutes. This is your last real chance to secure the win.`,
  },
  "5m": {
    subject: (title) => `⚡ Ending in 5 minutes — ${title}`,
    headline: "⚡ Ending NOW",
    headlineColor: "#ef4444",
    bannerBg: "#2a0f0f",
    bannerBorder: "#7c1a1a",
    preheader: "FINAL MINUTES — place your last bid now",
    bodyText: (n) => `Hi ${n}, this lot closes in just minutes. Place your final bid now.`,
  },
}

export function bidEndingSoonEmail(opts: {
  firstName: string
  reminderType: BidEndingReminderType
  itemTitle: string
  artistName?: string
  coverImage?: string
  lotNumber?: number
  blockTitle?: string
  yourBid: number
  currentPrice: number
  isWinning: boolean
  bidUrl: string
  customerId?: string
}): { subject: string; html: string } {
  const cfg = REMINDER_CONFIG[opts.reminderType]
  const lotLabel = opts.lotNumber ? `Lot #${String(opts.lotNumber).padStart(2, "0")}` : ""
  const displayTitle = opts.artistName ? `${opts.artistName} — ${opts.itemTitle}` : opts.itemTitle
  const subtitle = [lotLabel, opts.blockTitle].filter(Boolean).join(" — ")

  const statusBadge = opts.isWinning
    ? `<span style="display:inline-block;background-color:#166534;color:#86efac;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:0.06em;font-family:'DM Sans',-apple-system,sans-serif;">Winning</span>`
    : `<span style="display:inline-block;background-color:#7c1a1a;color:#fca5a5;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:0.06em;font-family:'DM Sans',-apple-system,sans-serif;">Outbid</span>`

  return {
    subject: cfg.subject(displayTitle),
    html: emailLayout(`
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:${cfg.bannerBg};border:1px solid ${cfg.bannerBorder};border-radius:8px;margin:0 0 24px;border-collapse:collapse;">
        <tr>
          <td style="padding:14px 16px;">
            <p style="margin:0;font-size:15px;font-weight:700;color:${cfg.headlineColor};font-family:'DM Sans',-apple-system,sans-serif;">${cfg.headline}</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 20px;font-size:15px;color:#a39d96;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        ${cfg.bodyText(opts.firstName)}
      </p>

      ${emailItemPreview({
        imageUrl: opts.coverImage,
        title: displayTitle,
        subtitle: subtitle || undefined,
      })}

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="font-size:13px;color:#6b6560;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Your status</td>
              <td style="text-align:right;padding:4px 0;">${statusBadge}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#6b6560;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Your bid</td>
              <td style="font-size:13px;color:#c4bdb5;text-align:right;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">${formatPrice(opts.yourBid)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#6b6560;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">Current price</td>
              <td style="font-size:16px;color:#d4a54a;font-weight:700;text-align:right;padding:4px 0;font-family:'DM Sans',-apple-system,sans-serif;">${formatPrice(opts.currentPrice)}</td>
            </tr>
          </table>
        </td></tr>
      </table>

      ${emailButton(opts.isWinning ? "Check Your Bid" : "Bid Again", opts.bidUrl)}

      <p style="margin:16px 0 0;font-size:12px;color:#4a4540;text-align:center;font-family:'DM Sans',-apple-system,sans-serif;">
        Proxy bidding: you&rsquo;ll only ever pay the minimum needed to win.
      </p>
    `, {
      preheader: cfg.preheader,
      customerId: opts.customerId,
    }),
  }
}
