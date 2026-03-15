import { Knex } from "knex"
import {
  upsertContact,
  updateContactAttributes,
  isBrevoConfigured,
  BREVO_LIST_VOD_AUCTIONS,
} from "./brevo"

/**
 * CRM Event-Sync: Fire-and-forget Brevo contact updates.
 *
 * All functions are async and should be called with .catch(() => {})
 * so they never block the main request flow.
 */

// --- Helper: fetch customer email + name from Medusa auth tables ---

async function getCustomerInfo(
  pg: Knex,
  customerId: string
): Promise<{ email: string; first_name?: string; last_name?: string } | null> {
  // Medusa 2.x stores customer data in "customer" table
  const customer = await pg("customer")
    .select("email", "first_name", "last_name")
    .where("id", customerId)
    .whereNull("deleted_at")
    .first()
  return customer || null
}

// --- 1. Registration: sync new customer to Brevo ---

export async function crmSyncRegistration(
  pg: Knex,
  customerId: string
): Promise<void> {
  if (!isBrevoConfigured()) return

  const customer = await getCustomerInfo(pg, customerId)
  if (!customer) return

  const listIds = BREVO_LIST_VOD_AUCTIONS ? [BREVO_LIST_VOD_AUCTIONS] : undefined

  await upsertContact(customer.email, {
    FIRSTNAME: customer.first_name || "",
    LASTNAME: customer.last_name || "",
    MEDUSA_CUSTOMER_ID: customerId,
    PLATFORM_ORIGIN: "vod-auctions",
    CUSTOMER_SEGMENT: "registered",
    REGISTRATION_DATE: new Date().toISOString().split("T")[0],
  }, listIds)

  console.log(`[crm-sync] Registration synced: ${customer.email}`)
}

// --- 2. Bid placed: update bid stats ---

export async function crmSyncBidPlaced(
  pg: Knex,
  customerId: string,
  bidAmount: number
): Promise<void> {
  if (!isBrevoConfigured()) return

  const customer = await getCustomerInfo(pg, customerId)
  if (!customer) return

  // Count total bids for this customer
  const bidStats = await pg("bid")
    .where("user_id", customerId)
    .count("id as total")
    .first()

  await upsertContact(customer.email, {
    TOTAL_BIDS_PLACED: Number(bidStats?.total || 0),
    LAST_BID_DATE: new Date().toISOString().split("T")[0],
    LAST_BID_AMOUNT: bidAmount,
    CUSTOMER_SEGMENT: "bidder",
  })

  console.log(`[crm-sync] Bid synced: ${customer.email}, €${bidAmount}`)
}

// --- 3. Auction won: update win stats ---

export async function crmSyncAuctionWon(
  pg: Knex,
  customerId: string,
  price: number
): Promise<void> {
  if (!isBrevoConfigured()) return

  const customer = await getCustomerInfo(pg, customerId)
  if (!customer) return

  // Count total auctions won (sold items where user has winning bid)
  const wonCount = await pg("bid")
    .join("block_item", "block_item.id", "bid.block_item_id")
    .where("bid.user_id", customerId)
    .where("bid.is_winning", true)
    .where("block_item.status", "sold")
    .count("bid.id as total")
    .first()

  await upsertContact(customer.email, {
    TOTAL_AUCTIONS_WON: Number(wonCount?.total || 0),
    LAST_PURCHASE_DATE: new Date().toISOString().split("T")[0],
    CUSTOMER_SEGMENT: "buyer",
  })

  console.log(`[crm-sync] Auction won synced: ${customer.email}, €${price}`)
}

// --- 4. Payment completed: update purchase stats ---

export async function crmSyncPaymentCompleted(
  pg: Knex,
  orderGroupId: string
): Promise<void> {
  if (!isBrevoConfigured()) return

  // Get all transactions in this order group
  const transactions = await pg("transaction")
    .where("order_group_id", orderGroupId)
    .where("status", "paid")
    .select("user_id", "amount", "item_type")

  if (!transactions.length) return

  const customerId = transactions[0].user_id
  const customer = await getCustomerInfo(pg, customerId)
  if (!customer) return

  // Aggregate lifetime stats
  const lifetimeStats = await pg("transaction")
    .where("user_id", customerId)
    .where("status", "paid")
    .select(
      pg.raw("COUNT(*) as total_purchases"),
      pg.raw("COALESCE(SUM(amount), 0) as total_spent")
    )
    .first()

  // Get shipping address from latest transaction
  const latestTx = await pg("transaction")
    .where("order_group_id", orderGroupId)
    .whereNotNull("shipping_address_line1")
    .first()

  const addressAttributes: Record<string, any> = {}
  if (latestTx) {
    if (latestTx.shipping_address_line1) addressAttributes.SHIPPING_ADDRESS = latestTx.shipping_address_line1
    if (latestTx.shipping_city) addressAttributes.SHIPPING_CITY = latestTx.shipping_city
    if (latestTx.shipping_postal_code) addressAttributes.SHIPPING_POSTAL_CODE = latestTx.shipping_postal_code
    if (latestTx.shipping_country) addressAttributes.SHIPPING_COUNTRY = latestTx.shipping_country
    if (latestTx.shipping_name) addressAttributes.SHIPPING_NAME = latestTx.shipping_name
  }

  await upsertContact(customer.email, {
    TOTAL_PURCHASES: Number(lifetimeStats?.total_purchases || 0),
    TOTAL_SPENT: Number(parseFloat(lifetimeStats?.total_spent || "0").toFixed(2)),
    LAST_PURCHASE_DATE: new Date().toISOString().split("T")[0],
    CUSTOMER_SEGMENT: "buyer",
    ...addressAttributes,
  })

  console.log(`[crm-sync] Payment synced: ${customer.email}, group ${orderGroupId}`)
}

// --- 5. Shipping status update: sync to CRM ---

export async function crmSyncShippingUpdate(
  pg: Knex,
  transactionId: string,
  shippingStatus: "shipped" | "delivered"
): Promise<void> {
  if (!isBrevoConfigured()) return

  const transaction = await pg("transaction")
    .where("id", transactionId)
    .select("user_id")
    .first()

  if (!transaction) return

  const customer = await getCustomerInfo(pg, transaction.user_id)
  if (!customer) return

  const attrs: Record<string, any> = {}
  if (shippingStatus === "shipped") {
    attrs.LAST_SHIPMENT_DATE = new Date().toISOString().split("T")[0]
  } else if (shippingStatus === "delivered") {
    attrs.LAST_DELIVERY_DATE = new Date().toISOString().split("T")[0]
  }

  await updateContactAttributes(customer.email, attrs)

  console.log(`[crm-sync] Shipping ${shippingStatus} synced: ${customer.email}`)
}
