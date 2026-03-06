import { Knex } from "knex"
import { sendEmail, APP_URL } from "./email"
import { getTrackingUrl } from "./tracking"
import { welcomeEmail } from "../emails/welcome"
import { outbidEmail } from "../emails/outbid"
import { bidWonEmail } from "../emails/bid-won"
import { paymentConfirmationEmail } from "../emails/payment-confirmation"
import { shippingEmail } from "../emails/shipping"
import { feedbackRequestEmail } from "../emails/feedback-request"

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
    .where("id", releaseId)
    .select("id", "title", "coverImage")
    .first()
  if (!release) return null

  // Get artist name
  const ra = await pg("ReleaseArtist")
    .where("releaseId", releaseId)
    .select("artistId")
    .first()
  let artistName: string | undefined
  if (ra) {
    const artist = await pg("Artist").where("id", ra.artistId).select("name").first()
    artistName = artist?.name
  }

  const coverImage = release.coverImage
    ? `https://tape-mag.com/bilder/gross/${release.coverImage}`
    : undefined

  return { title: release.title, artistName, coverImage }
}

// --- WELCOME ---
export async function sendWelcomeEmail(pg: Knex, userId: string) {
  const customer = await getCustomer(pg, userId)
  if (!customer?.email) return

  const { subject, html } = welcomeEmail({
    firstName: customer.first_name || "there",
    auctionsUrl: `${APP_URL}/auctions`,
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

  const { subject, html } = outbidEmail({
    firstName: customer.first_name || "there",
    itemTitle: release?.title || "Unknown Item",
    artistName: release?.artistName,
    coverImage: release?.coverImage,
    lotNumber: item.lot_number,
    blockTitle: block?.title,
    yourBid,
    currentBid,
    bidUrl: `${APP_URL}/auctions/${block?.slug || ""}/${blockItemId}`,
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

  const items = []
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

  const items = []
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

  const items = []
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
