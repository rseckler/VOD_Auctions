import { Knex } from "knex"
import { createHmac } from "crypto"
import { sendEmail, APP_URL } from "./email"
import { getTrackingUrl } from "./tracking"
import { welcomeEmail } from "../emails/welcome"
import { outbidEmail } from "../emails/outbid"
import { bidWonEmail } from "../emails/bid-won"
import { paymentConfirmationEmail } from "../emails/payment-confirmation"
import { shippingEmail } from "../emails/shipping"
import { feedbackRequestEmail } from "../emails/feedback-request"
import { paymentReminder1Email } from "../emails/payment-reminder-1"
import { paymentReminder3Email } from "../emails/payment-reminder-3"
import { watchlistReminderEmail } from "../emails/watchlist-reminder"
import { bidPlacedEmail } from "../emails/bid-placed"

// --- Unsubscribe token helpers ---

export function generateUnsubscribeToken(customerId: string): string {
  const secret = process.env.REVALIDATE_SECRET || "fallback-secret"
  return createHmac("sha256", secret)
    .update(`${customerId}:unsubscribe`)
    .digest("hex")
    .slice(0, 32)
}

export function getUnsubscribeUrl(customerId: string): string {
  const token = generateUnsubscribeToken(customerId)
  const base = process.env.STOREFRONT_URL || "http://localhost:3000"
  return `${base}/email-preferences/unsubscribe?token=${token}&id=${customerId}`
}

// Tiered bid increment table (mirrors bid route logic)
function getMinIncrement(currentPrice: number): number {
  if (currentPrice < 10)   return 0.50
  if (currentPrice < 50)   return 1.00
  if (currentPrice < 200)  return 2.50
  if (currentPrice < 500)  return 5.00
  if (currentPrice < 2000) return 10.00
  return 25.00
}

// Resolve customer email + first_name from Medusa customer ID
async function getCustomer(pg: Knex, userId: string) {
  const customer = await pg("customer")
    .where("id", userId)
    .select("id", "email", "first_name", "last_name")
    .first()
  return customer || null
}

// Resolve release info for an item (via block_item or direct release_id)
async function getReleaseInfo(pg: Knex, releaseId: string) {
  const release = await pg("Release")
    .where("Release.id", releaseId)
    .leftJoin("Artist", "Artist.id", "Release.artistId")
    .select("Release.id", "Release.title", "Release.coverImage", "Artist.name as artistName")
    .first()
  if (!release) return null

  return {
    title: release.title,
    artistName: release.artistName || undefined,
    coverImage: release.coverImage || undefined,
  }
}

// --- WELCOME ---
export async function sendWelcomeEmail(pg: Knex, userId: string) {
  const customer = await getCustomer(pg, userId)
  if (!customer?.email) return

  const { subject, html } = welcomeEmail({
    firstName: customer.first_name || "there",
    auctionsUrl: `${APP_URL}/auctions`,
    customerId: customer.id,
  })
  await sendEmail({ to: customer.email, subject, html })
}

// --- OUTBID ---
export async function sendOutbidEmail(
  pg: Knex,
  outbidUserId: string,
  blockItemId: string,
  yourBid: number,
  currentBid: number
) {
  const customer = await getCustomer(pg, outbidUserId)
  if (!customer?.email) return

  const item = await pg("block_item")
    .where("id", blockItemId)
    .select("release_id", "lot_number", "auction_block_id")
    .first()
  if (!item) return

  const block = await pg("auction_block")
    .where("id", item.auction_block_id)
    .select("title", "slug")
    .first()

  const release = await getReleaseInfo(pg, item.release_id)

  const lotUrl = `${APP_URL}/auctions/${block?.slug || ""}/${blockItemId}`
  const suggestedBid = currentBid + getMinIncrement(currentBid)

  const { subject, html } = outbidEmail({
    firstName: customer.first_name || "there",
    itemTitle: release?.title || "Unknown Item",
    artistName: release?.artistName,
    coverImage: release?.coverImage,
    lotNumber: item.lot_number,
    blockTitle: block?.title,
    yourBid,
    currentBid,
    suggestedBid,
    bidUrl: lotUrl,
    customerId: customer.id,
  })
  await sendEmail({ to: customer.email, subject, html })
}

// --- BID PLACED ---
export async function sendBidPlacedEmail(
  pg: Knex,
  bidderId: string,
  blockItemId: string,
  bidAmount: number
) {
  const customer = await getCustomer(pg, bidderId)
  if (!customer?.email) return

  const item = await pg("block_item")
    .where("id", blockItemId)
    .select("release_id", "lot_number", "auction_block_id")
    .first()
  if (!item) return

  const block = await pg("auction_block")
    .where("id", item.auction_block_id)
    .select("title", "slug")
    .first()

  const release = await getReleaseInfo(pg, item.release_id)

  const lotUrl = `${APP_URL}/auctions/${block?.slug || ""}/${blockItemId}`

  const { subject, html } = bidPlacedEmail({
    firstName: customer.first_name || "there",
    itemTitle: release?.title || "Unknown Item",
    artistName: release?.artistName,
    coverImage: release?.coverImage,
    lotNumber: item.lot_number,
    blockTitle: block?.title,
    bidAmount,
    lotUrl,
    customerId: customer.id,
  })
  await sendEmail({ to: customer.email, subject, html })
}

// --- BID WON ---
export async function sendBidWonEmail(
  pg: Knex,
  winnerId: string,
  blockItemId: string,
  finalPrice: number,
  lotNumber?: number,
  blockTitle?: string
) {
  const customer = await getCustomer(pg, winnerId)
  if (!customer?.email) return

  const item = await pg("block_item")
    .where("id", blockItemId)
    .select("release_id")
    .first()
  if (!item) return

  const release = await getReleaseInfo(pg, item.release_id)

  const { subject, html } = bidWonEmail({
    firstName: customer.first_name || "there",
    itemTitle: release?.title || "Unknown Item",
    artistName: release?.artistName,
    coverImage: release?.coverImage,
    lotNumber,
    blockTitle,
    finalPrice,
    paymentUrl: `${APP_URL}/account/wins`,
    customerId: customer.id,
  })
  await sendEmail({ to: customer.email, subject, html })
}

// --- PAYMENT CONFIRMATION ---
export async function sendPaymentConfirmationEmail(
  pg: Knex,
  orderGroupId: string
) {
  // Get all transactions for this order group
  const transactions = await pg("transaction")
    .where("order_group_id", orderGroupId)
    .where("status", "paid")

  if (!transactions.length) return

  const customer = await getCustomer(pg, transactions[0].user_id)
  if (!customer?.email) return

  const items: Array<{ title: string; artistName?: string; coverImage?: string; price: number }> = []
  let totalAmount = 0
  let shippingCost = 0

  for (const tx of transactions) {
    const releaseId = tx.release_id || (
      tx.block_item_id
        ? (await pg("block_item").where("id", tx.block_item_id).select("release_id").first())?.release_id
        : null
    )
    const release = releaseId ? await getReleaseInfo(pg, releaseId) : null

    items.push({
      title: release?.title || "Item",
      artistName: release?.artistName,
      coverImage: release?.coverImage,
      price: parseFloat(tx.amount),
    })
    totalAmount += parseFloat(tx.total_amount || tx.amount)
    shippingCost += parseFloat(tx.shipping_cost || 0)
  }

  const { subject, html } = paymentConfirmationEmail({
    firstName: customer.first_name || "there",
    orderGroupId,
    items,
    totalAmount,
    shippingCost,
    paidAt: transactions[0].paid_at || new Date(),
    accountUrl: `${APP_URL}/account/wins`,
    customerId: customer.id,
  })
  await sendEmail({ to: customer.email, subject, html })
}

// --- SHIPPING ---
export async function sendShippingEmail(
  pg: Knex,
  transactionId: string
) {
  const tx = await pg("transaction").where("id", transactionId).first()
  if (!tx) return

  const customer = await getCustomer(pg, tx.user_id)
  if (!customer?.email) return

  // Get all items in same order group (if grouped)
  const transactions = tx.order_group_id
    ? await pg("transaction").where("order_group_id", tx.order_group_id)
    : [tx]

  const items: Array<{ title: string; artistName?: string; coverImage?: string }> = []
  for (const t of transactions) {
    const releaseId = t.release_id || (
      t.block_item_id
        ? (await pg("block_item").where("id", t.block_item_id).select("release_id").first())?.release_id
        : null
    )
    const release = releaseId ? await getReleaseInfo(pg, releaseId) : null
    items.push({
      title: release?.title || "Item",
      artistName: release?.artistName,
      coverImage: release?.coverImage,
    })
  }

  const trackingUrl = getTrackingUrl(tx.carrier, tx.tracking_number)

  const { subject, html } = shippingEmail({
    firstName: customer.first_name || "there",
    orderGroupId: tx.order_group_id || tx.id,
    items,
    carrier: tx.carrier || "Standard",
    trackingNumber: tx.tracking_number || "",
    trackingUrl,
    shippingAddress: {
      name: tx.shipping_name,
      line1: tx.shipping_address_line1,
      city: tx.shipping_city,
      postalCode: tx.shipping_postal_code,
      country: tx.shipping_country,
    },
    customerId: customer.id,
  })
  await sendEmail({ to: customer.email, subject, html })
}

// --- PAYMENT REMINDER 1 (day 1) ---
export async function sendPaymentReminder1Email(
  pg: Knex,
  transactionId: string
) {
  const tx = await pg("transaction").where("id", transactionId).first()
  if (!tx) return

  const customer = await getCustomer(pg, tx.user_id)
  if (!customer?.email) return

  // Get all pending transactions in the same order group (or just this one)
  const transactions = tx.order_group_id
    ? await pg("transaction")
        .where("order_group_id", tx.order_group_id)
        .where("status", "pending")
        .where("item_type", "auction")
    : [tx]

  if (!transactions.length) return

  // Resolve block title from the first transaction's block_item
  const firstItem = await pg("block_item").where("id", tx.block_item_id).first()
  const block = firstItem
    ? await pg("auction_block").where("id", firstItem.auction_block_id).select("title").first()
    : null
  const blockTitle = block?.title || "VOD Auctions"

  const items: Array<{ title: string; artistName?: string; coverImage?: string; lotNumber?: number; amount: number }> = []
  for (const t of transactions) {
    if (!t.block_item_id) continue
    const blockItem = await pg("block_item").where("id", t.block_item_id).first()
    const releaseId = blockItem?.release_id || t.release_id
    const release = releaseId ? await getReleaseInfo(pg, releaseId) : null
    items.push({
      title: release?.title || "Item",
      artistName: release?.artistName,
      coverImage: release?.coverImage,
      lotNumber: blockItem?.lot_number,
      amount: parseFloat(t.amount),
    })
  }

  if (!items.length) return

  const { subject, html } = paymentReminder1Email({
    firstName: customer.first_name || "there",
    blockTitle,
    items,
    paymentUrl: `${APP_URL}/account/checkout`,
    customerId: customer.id,
  })
  await sendEmail({ to: customer.email, subject, html })
}

// --- PAYMENT REMINDER 3 (day 3) ---
export async function sendPaymentReminder3Email(
  pg: Knex,
  transactionId: string,
  deadlineDate: Date
) {
  const tx = await pg("transaction").where("id", transactionId).first()
  if (!tx) return

  const customer = await getCustomer(pg, tx.user_id)
  if (!customer?.email) return

  // Get all pending transactions in the same order group (or just this one)
  const transactions = tx.order_group_id
    ? await pg("transaction")
        .where("order_group_id", tx.order_group_id)
        .where("status", "pending")
        .where("item_type", "auction")
    : [tx]

  if (!transactions.length) return

  // Resolve block title from the first transaction's block_item
  const firstItem = await pg("block_item").where("id", tx.block_item_id).first()
  const block = firstItem
    ? await pg("auction_block").where("id", firstItem.auction_block_id).select("title").first()
    : null
  const blockTitle = block?.title || "VOD Auctions"

  const items: Array<{ title: string; artistName?: string; coverImage?: string; lotNumber?: number; amount: number }> = []
  for (const t of transactions) {
    if (!t.block_item_id) continue
    const blockItem = await pg("block_item").where("id", t.block_item_id).first()
    const releaseId = blockItem?.release_id || t.release_id
    const release = releaseId ? await getReleaseInfo(pg, releaseId) : null
    items.push({
      title: release?.title || "Item",
      artistName: release?.artistName,
      coverImage: release?.coverImage,
      lotNumber: blockItem?.lot_number,
      amount: parseFloat(t.amount),
    })
  }

  if (!items.length) return

  const { subject, html } = paymentReminder3Email({
    firstName: customer.first_name || "there",
    blockTitle,
    items,
    deadlineDate,
    paymentUrl: `${APP_URL}/account/checkout`,
    customerId: customer.id,
  })
  await sendEmail({ to: customer.email, subject, html })
}

// --- FEEDBACK REQUEST ---
export async function sendFeedbackRequestEmail(
  pg: Knex,
  transactionId: string
) {
  const tx = await pg("transaction").where("id", transactionId).first()
  if (!tx || tx.feedback_email_sent) return

  const customer = await getCustomer(pg, tx.user_id)
  if (!customer?.email) return

  const transactions = tx.order_group_id
    ? await pg("transaction").where("order_group_id", tx.order_group_id)
    : [tx]

  const items: Array<{ title: string; artistName?: string; coverImage?: string }> = []
  for (const t of transactions) {
    const releaseId = t.release_id || (
      t.block_item_id
        ? (await pg("block_item").where("id", t.block_item_id).select("release_id").first())?.release_id
        : null
    )
    const release = releaseId ? await getReleaseInfo(pg, releaseId) : null
    items.push({
      title: release?.title || "Item",
      artistName: release?.artistName,
      coverImage: release?.coverImage,
    })
  }

  const orderRef = tx.order_group_id || tx.id
  const { subject, html } = feedbackRequestEmail({
    firstName: customer.first_name || "there",
    items,
    feedbackUrl: `${APP_URL}/account/feedback?order=${orderRef}`,
    auctionsUrl: `${APP_URL}/auctions`,
    customerId: customer.id,
  })
  await sendEmail({ to: customer.email, subject, html })

  // Mark feedback email as sent (for all items in group)
  if (tx.order_group_id) {
    await pg("transaction")
      .where("order_group_id", tx.order_group_id)
      .update({ feedback_email_sent: true, updated_at: new Date() })
  } else {
    await pg("transaction")
      .where("id", transactionId)
      .update({ feedback_email_sent: true, updated_at: new Date() })
  }
}

// --- WATCHLIST REMINDER ---
export async function sendWatchlistReminderEmail(
  pg: Knex,
  savedItemId: string
): Promise<void> {
  // 1. Fetch saved_item
  const savedItem = await pg("saved_item")
    .where("id", savedItemId)
    .whereNull("deleted_at")
    .first()
  if (!savedItem) return

  // 2. Find the active block_item for this release
  const blockItem = await pg("block_item")
    .where("release_id", savedItem.release_id)
    .where("status", "active")
    .first()
  if (!blockItem) return

  // 3. Get the auction block (for slug)
  const block = await pg("auction_block")
    .where("id", blockItem.auction_block_id)
    .select("slug", "title")
    .first()
  if (!block) return

  // 4. Get release details (title, artist, format, year, coverImage)
  const release = await pg("Release")
    .select(
      "Release.id",
      "Release.title",
      "Release.coverImage",
      "Release.format",
      "Release.year",
      "Artist.name as artist_name"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .where("Release.id", savedItem.release_id)
    .first()
  if (!release) return

  const coverImage = release.coverImage || undefined

  // 5. Get customer email
  const customer = await pg("customer")
    .where("id", savedItem.user_id)
    .select("id", "email", "first_name")
    .first()
  if (!customer?.email) return

  const bidUrl = `${APP_URL}/auctions/${block.slug}/${blockItem.id}`

  const { subject, html } = watchlistReminderEmail({
    firstName: customer.first_name || "there",
    itemTitle: release.title || "Unknown Item",
    artistName: release.artist_name || undefined,
    coverImage,
    lotNumber: blockItem.lot_number || undefined,
    currentPrice: Number(blockItem.current_price || blockItem.start_price || 0),
    format: release.format || undefined,
    year: release.year || undefined,
    bidUrl,
    customerId: customer.id,
  })

  await sendEmail({ to: customer.email, subject, html })
}
