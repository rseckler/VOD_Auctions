import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { welcomeEmail } from "../../../../emails/welcome"
import { verifyEmailTemplate } from "../../../../emails/verify-email"
import { passwordResetEmail } from "../../../../emails/password-reset"
import { bidWonEmail } from "../../../../emails/bid-won"
import { outbidEmail } from "../../../../emails/outbid"
import { paymentConfirmationEmail } from "../../../../emails/payment-confirmation"
import { paymentReminder1Email } from "../../../../emails/payment-reminder-1"
import { paymentReminder3Email } from "../../../../emails/payment-reminder-3"
import { shippingEmail } from "../../../../emails/shipping"
import { feedbackRequestEmail } from "../../../../emails/feedback-request"
import { watchlistReminderEmail } from "../../../../emails/watchlist-reminder"
import { newsletterConfirmEmail } from "../../../../emails/newsletter-confirm"
import { blockTomorrowEmail } from "../../../../emails/block-tomorrow"
import { blockLiveEmail } from "../../../../emails/block-live"
import { blockEndingEmail } from "../../../../emails/block-ending"
import { bidPlacedEmail } from "../../../../emails/bid-placed"

const STOREFRONT_URL = process.env.STOREFRONT_URL || "https://vod-auctions.com"
const BACKEND_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"

function renderTemplate(id: string): { subject: string; html: string } | null {
  const DEMO_BLOCK_TITLE = "Industrial Classics 1980–1995"
  const DEMO_BLOCK_SLUG = "industrial-classics-demo"
  const DEMO_END_TIME = new Date(Date.now() + 6 * 60 * 60 * 1000)
  const DEMO_START_TIME = new Date(Date.now() + 24 * 60 * 60 * 1000)

  switch (id) {
    case "welcome":
      return welcomeEmail({ firstName: "Frank", auctionsUrl: `${STOREFRONT_URL}/auctions` })
    case "verify-email":
      return verifyEmailTemplate({ firstName: "Frank", verifyUrl: `${STOREFRONT_URL}/verify?token=PREVIEW_TOKEN` })
    case "password-reset":
      return passwordResetEmail({ firstName: "Frank", resetUrl: `${STOREFRONT_URL}/reset-password?token=PREVIEW_TOKEN` })
    case "bid-placed":
      return bidPlacedEmail({
        firstName: "Frank",
        itemTitle: "Dorothy — I Confess / Softness",
        artistName: "Dorothy",
        lotNumber: 5,
        blockTitle: DEMO_BLOCK_TITLE,
        bidAmount: 1.50,
        lotUrl: `${STOREFRONT_URL}/auctions/${DEMO_BLOCK_SLUG}/lot-demo`,
      })
    case "bid-won":
      return bidWonEmail({
        firstName: "Frank",
        itemTitle: "Black Tape for a Blue Girl — Ashes in the Brittle Air",
        artistName: "Black Tape for a Blue Girl",
        lotNumber: 7,
        blockTitle: DEMO_BLOCK_TITLE,
        finalPrice: 34.50,
        paymentUrl: `${STOREFRONT_URL}/account/wins`,
      })
    case "outbid":
      return outbidEmail({
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
    case "payment-confirmation":
      return paymentConfirmationEmail({
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
    case "payment-reminder-1":
      return paymentReminder1Email({
        firstName: "Frank",
        blockTitle: DEMO_BLOCK_TITLE,
        items: [{ title: "Bites", artistName: "Skinny Puppy", lotNumber: 3, amount: 25.00 }],
        paymentUrl: `${STOREFRONT_URL}/account/checkout`,
      })
    case "payment-reminder-3":
      return paymentReminder3Email({
        firstName: "Frank",
        blockTitle: DEMO_BLOCK_TITLE,
        items: [{ title: "Bites", artistName: "Skinny Puppy", lotNumber: 3, amount: 25.00 }],
        deadlineDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        paymentUrl: `${STOREFRONT_URL}/account/checkout`,
      })
    case "shipping":
      return shippingEmail({
        firstName: "Frank",
        orderGroupId: "demo-order-group-id",
        items: [{ title: "Bites", artistName: "Skinny Puppy" }],
        carrier: "DHL",
        trackingNumber: "1Z999AA10123456784",
        trackingUrl: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html",
        shippingAddress: { name: "Frank Müller", line1: "Musterstraße 42", city: "Berlin", postalCode: "10115", country: "Germany" },
      })
    case "feedback-request":
      return feedbackRequestEmail({
        firstName: "Frank",
        items: [{ title: "Bites", artistName: "Skinny Puppy" }],
        feedbackUrl: `${STOREFRONT_URL}/account/feedback?order=demo`,
        auctionsUrl: `${STOREFRONT_URL}/auctions`,
      })
    case "watchlist-reminder":
      return watchlistReminderEmail({
        firstName: "Frank",
        itemTitle: "Cleanse Fold and Manipulate",
        artistName: "Skinny Puppy",
        lotNumber: 5,
        currentPrice: 42.00,
        format: "LP",
        year: 1987,
        bidUrl: `${STOREFRONT_URL}/auctions/${DEMO_BLOCK_SLUG}/lot-demo`,
      })
    case "newsletter-confirm":
      return newsletterConfirmEmail({
        email: "frank@vod-records.com",
        confirmUrl: `${BACKEND_URL}/store/newsletter/confirm?token=PREVIEW_TOKEN&email=frank%40vod-records.com`,
      })
    case "block-tomorrow":
      return blockTomorrowEmail({ blockTitle: DEMO_BLOCK_TITLE, blockSlug: DEMO_BLOCK_SLUG, startTime: DEMO_START_TIME, itemCount: 42, previewItems: [] })
    case "block-live":
      return blockLiveEmail({ blockTitle: DEMO_BLOCK_TITLE, blockSlug: DEMO_BLOCK_SLUG, endTime: DEMO_END_TIME, itemCount: 42, previewItems: [] })
    case "block-ending":
      return blockEndingEmail({ blockTitle: DEMO_BLOCK_TITLE, blockSlug: DEMO_BLOCK_SLUG, endTime: DEMO_END_TIME, topItems: [] })
    default:
      return null
  }
}

/**
 * GET /admin/email-templates/:id
 * Returns rendered HTML preview + saved config overrides.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { id } = req.params
  const rendered = renderTemplate(id)

  if (!rendered) {
    res.status(404).json({ message: `Template '${id}' not found` })
    return
  }

  // Load any saved config overrides from content_block
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const saved = await pgConnection("content_block")
    .where({ page: "email_config", section: id })
    .first()

  const config = saved?.content || {}

  res.json({
    id,
    subject: config.subject_override || rendered.subject,
    subject_default: rendered.subject,
    html: rendered.html,
    config,
  })
}

/**
 * PUT /admin/email-templates/:id
 * Body: { subject_override?: string, preheader_override?: string, notes?: string }
 * Saves config overrides to content_block.
 */
export async function PUT(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { id } = req.params
  const body = req.body as Record<string, string>
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const existing = await pgConnection("content_block")
    .where({ page: "email_config", section: id })
    .first()

  const content = { ...(existing?.content || {}), ...body }

  if (existing) {
    await pgConnection("content_block")
      .where({ page: "email_config", section: id })
      .update({ content: JSON.stringify(content), updated_at: new Date() })
  } else {
    await pgConnection("content_block").insert({
      id: `email-config-${id}`,
      page: "email_config",
      section: id,
      content: JSON.stringify(content),
      created_at: new Date(),
      updated_at: new Date(),
    })
  }

  res.json({ success: true, config: content })
}
