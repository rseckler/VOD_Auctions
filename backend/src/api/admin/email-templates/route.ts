import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendEmail } from "../../../lib/email"
import { welcomeEmail } from "../../../emails/welcome"
import { verifyEmailTemplate } from "../../../emails/verify-email"
import { passwordResetEmail } from "../../../emails/password-reset"
import { bidWonEmail } from "../../../emails/bid-won"
import { outbidEmail } from "../../../emails/outbid"
import { paymentConfirmationEmail } from "../../../emails/payment-confirmation"
import { paymentReminder1Email } from "../../../emails/payment-reminder-1"
import { paymentReminder3Email } from "../../../emails/payment-reminder-3"
import { shippingEmail } from "../../../emails/shipping"
import { feedbackRequestEmail } from "../../../emails/feedback-request"
import { watchlistReminderEmail } from "../../../emails/watchlist-reminder"
import { newsletterConfirmEmail } from "../../../emails/newsletter-confirm"
import { blockTomorrowEmail } from "../../../emails/block-tomorrow"
import { blockLiveEmail } from "../../../emails/block-live"
import { blockEndingEmail } from "../../../emails/block-ending"

const STOREFRONT_URL = process.env.STOREFRONT_URL || "https://vod-auctions.com"
const BACKEND_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"

export type EmailTemplate = {
  id: string
  name: string
  description: string
  channel: "resend" | "brevo"
  category: "transactional" | "newsletter"
  trigger: string
  preheader: string
}

const TEMPLATES: EmailTemplate[] = [
  {
    id: "welcome",
    name: "Welcome Email",
    description: "Sent immediately after account creation",
    channel: "resend",
    category: "transactional",
    trigger: "Account created",
    preheader: "Great to have you — 40,000+ rare industrial records are waiting for new owners.",
  },
  {
    id: "verify-email",
    name: "Email Verification",
    description: "Sent when email verification is required",
    channel: "resend",
    category: "transactional",
    trigger: "Registration — verification required",
    preheader: "Just one click to complete your VOD Auctions registration",
  },
  {
    id: "password-reset",
    name: "Password Reset",
    description: "Triggered by a forgotten password request",
    channel: "resend",
    category: "transactional",
    trigger: "Forgot password",
    preheader: "Your password reset link — valid for 15 minutes",
  },
  {
    id: "bid-won",
    name: "Auction Won",
    description: "Sent to the winning bidder when an auction lot closes",
    channel: "resend",
    category: "transactional",
    trigger: "Lot ends — winning bid",
    preheader: "You won! Complete your payment within 5 days to secure your records",
  },
  {
    id: "outbid",
    name: "Outbid Alert",
    description: "Sent immediately when a bidder is outbid",
    channel: "resend",
    category: "transactional",
    trigger: "Higher bid placed",
    preheader: "Someone outbid you — jump back in before the auction closes",
  },
  {
    id: "payment-confirmation",
    name: "Payment Confirmation",
    description: "Sent after successful payment is received",
    channel: "resend",
    category: "transactional",
    trigger: "Payment succeeded (Stripe / PayPal)",
    preheader: "Payment received — your records are being prepared for shipping",
  },
  {
    id: "payment-reminder-1",
    name: "Payment Reminder (Day 1)",
    description: "First payment reminder sent 24h after auction win",
    channel: "resend",
    category: "transactional",
    trigger: "Cron: 24h after unpaid auction win",
    preheader: "Friendly reminder: your auction wins need payment in 4 days",
  },
  {
    id: "payment-reminder-3",
    name: "Payment Reminder (Day 3)",
    description: "Final payment reminder sent 72h after auction win",
    channel: "resend",
    category: "transactional",
    trigger: "Cron: 72h after unpaid auction win",
    preheader: "Last chance: pay by tomorrow or your items will be re-listed",
  },
  {
    id: "shipping",
    name: "Shipping Notification",
    description: "Sent when admin marks an order as shipped",
    channel: "resend",
    category: "transactional",
    trigger: "Admin: mark as shipped",
    preheader: "Your records are on their way — here's your tracking info",
  },
  {
    id: "feedback-request",
    name: "Feedback Request",
    description: "Sent 10 days after shipping to request a review",
    channel: "resend",
    category: "transactional",
    trigger: "Cron: 10 days after shipped",
    preheader: "How did we do? We'd love to hear about your VOD Auctions experience",
  },
  {
    id: "watchlist-reminder",
    name: "Watchlist Reminder",
    description: "Sent 24h before a saved lot ends",
    channel: "resend",
    category: "transactional",
    trigger: "Cron: hourly check — lot ends < 24h",
    preheader: "24 hours left on an item you saved — don't miss out",
  },
  {
    id: "newsletter-confirm",
    name: "Newsletter Confirmation (Double Opt-In)",
    description: "Sent when someone signs up for the newsletter",
    channel: "resend",
    category: "transactional",
    trigger: "POST /store/newsletter",
    preheader: "One click to confirm your VOD Auctions newsletter subscription",
  },
  {
    id: "block-tomorrow",
    name: "Auction Starts Tomorrow",
    description: "Newsletter campaign sent T-24h before auction opens",
    channel: "brevo",
    category: "newsletter",
    trigger: "Admin: schedule newsletter campaign",
    preheader: "Bidding opens tomorrow — browse all lots now",
  },
  {
    id: "block-live",
    name: "Auction Live Now",
    description: "Newsletter campaign sent when block status → active",
    channel: "brevo",
    category: "newsletter",
    trigger: "Block status changes to active",
    preheader: "Bidding is live — place your bids now",
  },
  {
    id: "block-ending",
    name: "Auction Ending Soon",
    description: "Newsletter campaign sent 6h before auction closes",
    channel: "brevo",
    category: "newsletter",
    trigger: "Cron: 6h before block end_time",
    preheader: "Last chance — auction closes in 6 hours",
  },
]

/**
 * GET /admin/email-templates
 * Returns metadata for all email templates.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  res.json({ templates: TEMPLATES })
}

/**
 * POST /admin/email-templates
 * Body: { templateId: string, to: string }
 * Renders a preview of the template and sends it to the given address.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { templateId, to } = req.body as { templateId?: string; to?: string }

  if (!templateId || !to || !to.includes("@")) {
    res.status(400).json({ message: "templateId and valid to address are required" })
    return
  }

  const template = TEMPLATES.find((t) => t.id === templateId)
  if (!template) {
    res.status(404).json({ message: `Template '${templateId}' not found` })
    return
  }

  let rendered: { subject: string; html: string }

  const DEMO_BLOCK_SLUG = "industrial-classics-demo"
  const DEMO_BLOCK_TITLE = "Industrial Classics Test Block"
  const DEMO_END_TIME = new Date(Date.now() + 6 * 60 * 60 * 1000)
  const DEMO_START_TIME = new Date(Date.now() + 24 * 60 * 60 * 1000)

  switch (templateId) {
    case "welcome":
      rendered = welcomeEmail({
        firstName: "Frank",
        auctionsUrl: `${STOREFRONT_URL}/auctions`,
      })
      break

    case "verify-email":
      rendered = verifyEmailTemplate({
        firstName: "Frank",
        verifyUrl: `${STOREFRONT_URL}/verify?token=TEST_TOKEN`,
      })
      break

    case "password-reset":
      rendered = passwordResetEmail({
        firstName: "Frank",
        resetUrl: `${STOREFRONT_URL}/reset-password?token=TEST_TOKEN`,
      })
      break

    case "bid-won":
      rendered = bidWonEmail({
        firstName: "Frank",
        itemTitle: "Black Tape for a Blue Girl — Ashes in the Brittle Air",
        artistName: "Black Tape for a Blue Girl",
        lotNumber: 7,
        blockTitle: DEMO_BLOCK_TITLE,
        finalPrice: 34.50,
        paymentUrl: `${STOREFRONT_URL}/account/wins`,
      })
      break

    case "outbid":
      rendered = outbidEmail({
        firstName: "Frank",
        itemTitle: "Skinny Puppy — Bites",
        artistName: "Skinny Puppy",
        lotNumber: 3,
        blockTitle: DEMO_BLOCK_TITLE,
        yourBid: 22.00,
        currentBid: 25.00,
        suggestedBid: 27.50,
        bidUrl: `${STOREFRONT_URL}/auctions/${DEMO_BLOCK_SLUG}/lot-demo`,
      })
      break

    case "payment-confirmation":
      rendered = paymentConfirmationEmail({
        firstName: "Frank",
        orderGroupId: "demo-order-group-id",
        items: [
          { title: "Bites", artistName: "Skinny Puppy", price: 25.00 },
          { title: "Remission", artistName: "Mastodon", price: 18.50 },
        ],
        totalAmount: 52.99,
        shippingCost: 9.49,
        paidAt: new Date(),
        accountUrl: `${STOREFRONT_URL}/account/wins`,
      })
      break

    case "payment-reminder-1":
      rendered = paymentReminder1Email({
        firstName: "Frank",
        blockTitle: DEMO_BLOCK_TITLE,
        items: [{ title: "Bites", artistName: "Skinny Puppy", lotNumber: 3, amount: 25.00 }],
        paymentUrl: `${STOREFRONT_URL}/account/checkout`,
      })
      break

    case "payment-reminder-3":
      rendered = paymentReminder3Email({
        firstName: "Frank",
        blockTitle: DEMO_BLOCK_TITLE,
        items: [{ title: "Bites", artistName: "Skinny Puppy", lotNumber: 3, amount: 25.00 }],
        deadlineDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        paymentUrl: `${STOREFRONT_URL}/account/checkout`,
      })
      break

    case "shipping":
      rendered = shippingEmail({
        firstName: "Frank",
        orderGroupId: "demo-order-group-id",
        items: [{ title: "Bites", artistName: "Skinny Puppy" }],
        carrier: "DHL",
        trackingNumber: "1Z999AA10123456784",
        trackingUrl: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html",
        shippingAddress: {
          name: "Frank Müller",
          line1: "Musterstraße 42",
          city: "Berlin",
          postalCode: "10115",
          country: "Germany",
        },
      })
      break

    case "feedback-request":
      rendered = feedbackRequestEmail({
        firstName: "Frank",
        items: [{ title: "Bites", artistName: "Skinny Puppy" }],
        feedbackUrl: `${STOREFRONT_URL}/account/feedback?order=demo`,
        auctionsUrl: `${STOREFRONT_URL}/auctions`,
      })
      break

    case "watchlist-reminder":
      rendered = watchlistReminderEmail({
        firstName: "Frank",
        itemTitle: "Cleanse Fold and Manipulate",
        artistName: "Skinny Puppy",
        lotNumber: 5,
        currentPrice: 42.00,
        format: "LP",
        year: 1987,
        bidUrl: `${STOREFRONT_URL}/auctions/${DEMO_BLOCK_SLUG}/lot-demo`,
      })
      break

    case "newsletter-confirm":
      rendered = newsletterConfirmEmail({
        email: to,
        confirmUrl: `${BACKEND_URL}/store/newsletter/confirm?token=TEST_TOKEN&email=${encodeURIComponent(to)}`,
      })
      break

    case "block-tomorrow":
      rendered = blockTomorrowEmail({
        blockTitle: DEMO_BLOCK_TITLE,
        blockSlug: DEMO_BLOCK_SLUG,
        startTime: DEMO_START_TIME,
        itemCount: 42,
        previewItems: [],
      })
      break

    case "block-live":
      rendered = blockLiveEmail({
        blockTitle: DEMO_BLOCK_TITLE,
        blockSlug: DEMO_BLOCK_SLUG,
        endTime: DEMO_END_TIME,
        itemCount: 42,
        previewItems: [],
      })
      break

    case "block-ending":
      rendered = blockEndingEmail({
        blockTitle: DEMO_BLOCK_TITLE,
        blockSlug: DEMO_BLOCK_SLUG,
        endTime: DEMO_END_TIME,
        topItems: [],
      })
      break

    default:
      res.status(400).json({ message: `No preview renderer for template '${templateId}'` })
      return
  }

  try {
    await sendEmail({ to, subject: `[TEST] ${rendered.subject}`, html: rendered.html })
    res.json({ success: true, subject: rendered.subject })
  } catch (error: any) {
    console.error("[email-templates] Send test failed:", error.message)
    res.status(500).json({ message: "Failed to send test email" })
  }
}
