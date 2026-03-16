/**
 * Shared checkout logic extracted from create-payment-intent.
 * Used by both Stripe and PayPal checkout flows.
 */
import { Knex } from "knex"
import { generateEntityId } from "@medusajs/framework/utils"
import { isAvailableForDirectPurchase } from "./auction-helpers"
import { calculateShipping, getShippingConfig, resolveZoneByCountry } from "./shipping"

type CheckoutItem =
  | { type: "auction_win"; block_item_id: string }
  | { type: "cart"; cart_item_id: string }

type ShippingAddress = {
  name?: string
  first_name?: string
  last_name?: string
  line1: string
  line2?: string
  city: string
  postal_code: string
  state?: string
  country: string
}

export type PreparedCheckoutOrder = {
  orderGroupId: string
  transactionInserts: any[]
  grandTotal: number
  itemsTotal: number
  shippingCost: number
  discountAmount: number
  promoCodeId: string | null
  itemDescriptions: string[]
  customerName: string
  customerEmail: string
  shippingCountry: string
  shippingZone: string
}

export async function prepareCheckoutOrder(
  pgConnection: Knex,
  customerId: string,
  body: {
    items: CheckoutItem[]
    shipping_address?: ShippingAddress
    country_code?: string
    shipping_method_id?: string
    promo_code?: string
  }
): Promise<PreparedCheckoutOrder> {
  const { items, shipping_method_id: shippingMethodId, promo_code: promoCode } = body
  const shippingAddress = body.shipping_address

  // ── Resolve shipping zone ──
  let shippingZone: string
  let shippingCountry: string
  if (body.country_code) {
    const resolved = await resolveZoneByCountry(pgConnection, body.country_code)
    shippingZone = resolved.zone.slug
    shippingCountry = resolved.country_code
  } else if (shippingAddress?.country) {
    const resolved = await resolveZoneByCountry(pgConnection, shippingAddress.country)
    shippingZone = resolved.zone.slug
    shippingCountry = resolved.country_code
  } else {
    throw new CheckoutError("shipping_address.country or country_code is required", 400)
  }

  if (!items || items.length === 0) {
    throw new CheckoutError("items are required", 400)
  }

  const orderGroupId = generateEntityId()
  const transactionInserts: any[] = []
  const itemDescriptions: string[] = []

  // ── Process auction wins ──
  for (const item of items.filter(
    (i): i is Extract<CheckoutItem, { type: "auction_win" }> => i.type === "auction_win"
  )) {
    const blockItem = await pgConnection("block_item")
      .select("block_item.id", "block_item.current_price", "block_item.status", "block_item.release_id", "auction_block.title as block_title")
      .join("auction_block", "auction_block.id", "block_item.auction_block_id")
      .where("block_item.id", item.block_item_id)
      .first()

    if (!blockItem) throw new CheckoutError(`Auction item ${item.block_item_id} not found`, 404)
    if (blockItem.status !== "sold") throw new CheckoutError(`Item ${item.block_item_id} is not available for payment`, 400)

    const winningBid = await pgConnection("bid")
      .where({ block_item_id: item.block_item_id, user_id: customerId, is_winning: true })
      .first()
    if (!winningBid) throw new CheckoutError(`You are not the winning bidder for item ${item.block_item_id}`, 403)

    const existingPaid = await pgConnection("transaction")
      .where({ block_item_id: item.block_item_id, status: "paid" })
      .first()
    if (existingPaid) throw new CheckoutError(`Item ${item.block_item_id} has already been paid for`, 400)

    const price = parseFloat(blockItem.current_price)
    const release = await pgConnection("Release")
      .select("Release.title", "Artist.name as artist_name")
      .leftJoin("Artist", "Artist.id", "Release.artistId")
      .where("Release.id", blockItem.release_id)
      .first()

    itemDescriptions.push(`${release?.artist_name || "Unknown"} — ${release?.title || "Release"}`)

    transactionInserts.push({
      id: generateEntityId(),
      block_item_id: item.block_item_id,
      release_id: blockItem.release_id,
      user_id: customerId,
      item_type: "auction",
      order_group_id: orderGroupId,
      amount: price,
      currency: "eur",
      status: "pending",
      shipping_status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
    })
  }

  // ── Process cart items ──
  for (const item of items.filter(
    (i): i is Extract<CheckoutItem, { type: "cart" }> => i.type === "cart"
  )) {
    const cartItem = await pgConnection("cart_item")
      .where({ id: item.cart_item_id, user_id: customerId })
      .whereNull("deleted_at")
      .first()

    if (!cartItem) throw new CheckoutError(`Cart item ${item.cart_item_id} not found`, 404)

    const { available, reason } = await isAvailableForDirectPurchase(pgConnection, cartItem.release_id)
    if (!available) throw new CheckoutError(`${reason} (${cartItem.release_id})`, 400)

    const price = Number(cartItem.price)
    const releaseInfo = await pgConnection("Release")
      .select("Release.title", "Artist.name as artist_name")
      .leftJoin("Artist", "Artist.id", "Release.artistId")
      .where("Release.id", cartItem.release_id)
      .first()

    itemDescriptions.push(`${releaseInfo?.artist_name || "Unknown"} — ${releaseInfo?.title || "Release"}`)

    transactionInserts.push({
      id: generateEntityId(),
      release_id: cartItem.release_id,
      user_id: customerId,
      item_type: "direct_purchase",
      order_group_id: orderGroupId,
      amount: price,
      currency: "eur",
      status: "pending",
      shipping_status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
    })
  }

  if (transactionInserts.length === 0) {
    throw new CheckoutError("No valid items for checkout", 400)
  }

  // ── Calculate shipping ──
  const shippingItems = transactionInserts.map((t) => ({
    release_id: t.release_id,
    quantity: 1,
  }))

  let shippingCost: number
  try {
    const estimate = await calculateShipping(pgConnection, shippingItems, shippingZone)
    shippingCost = estimate.price
  } catch {
    const fallbackRates: Record<string, number> = { de: 4.99, eu: 9.99, world: 14.99 }
    shippingCost = fallbackRates[shippingZone] || 14.99
  }

  // Free shipping threshold
  const shippingConfig = await getShippingConfig(pgConnection)
  const itemsTotal = transactionInserts.reduce((sum, t) => sum + t.amount, 0)
  if (shippingConfig?.free_shipping_threshold && itemsTotal >= parseFloat(shippingConfig.free_shipping_threshold)) {
    shippingCost = 0
  }

  // ── Validate and apply promo code ──
  let discountAmount = 0
  let promoCodeId: string | null = null
  if (promoCode && typeof promoCode === "string") {
    const promo = await pgConnection("promo_code")
      .where("code", promoCode.trim().toUpperCase())
      .where("is_active", true)
      .first()

    if (!promo) throw new CheckoutError("Invalid promo code.", 400)

    const now = new Date()
    if (promo.valid_from && new Date(promo.valid_from) > now) throw new CheckoutError("This promo code is not yet active.", 400)
    if (promo.valid_to && new Date(promo.valid_to) < now) throw new CheckoutError("This promo code has expired.", 400)
    if (promo.max_uses !== null && Number(promo.used_count) >= Number(promo.max_uses)) throw new CheckoutError("This promo code has reached its usage limit.", 400)
    const minOrder = Number(promo.min_order_amount) || 0
    if (itemsTotal < minOrder) throw new CheckoutError(`Minimum order amount of \u20AC${minOrder.toFixed(2)} required.`, 400)

    if (promo.discount_type === "percentage") {
      discountAmount = itemsTotal * Number(promo.discount_value) / 100
      if (promo.max_discount_amount !== null) {
        discountAmount = Math.min(discountAmount, Number(promo.max_discount_amount))
      }
    } else {
      discountAmount = Math.min(Number(promo.discount_value), itemsTotal)
    }
    discountAmount = Math.round(discountAmount * 100) / 100
    promoCodeId = promo.id
  }

  // ── Distribute shipping cost + discount proportionally ──
  let shippingDistributed = 0
  let discountDistributed = 0
  for (let i = 0; i < transactionInserts.length; i++) {
    const share = i === transactionInserts.length - 1
      ? Math.round((shippingCost - shippingDistributed) * 100) / 100
      : Math.round((transactionInserts[i].amount / itemsTotal) * shippingCost * 100) / 100
    transactionInserts[i].shipping_cost = share
    shippingDistributed += share

    const discountShare = i === transactionInserts.length - 1
      ? Math.round((discountAmount - discountDistributed) * 100) / 100
      : Math.round((transactionInserts[i].amount / itemsTotal) * discountAmount * 100) / 100
    transactionInserts[i].discount_amount = discountShare
    transactionInserts[i].promo_code_id = promoCodeId
    discountDistributed += discountShare

    transactionInserts[i].total_amount = transactionInserts[i].amount + share - discountShare
  }

  const grandTotal = Math.max(itemsTotal + shippingCost - discountAmount, 0.50)

  // ── Store shipping address + method on transactions ──
  for (const tx of transactionInserts) {
    tx.shipping_country = shippingCountry
    if (shippingAddress) {
      const shippingName = shippingAddress.name
        || [shippingAddress.first_name, shippingAddress.last_name].filter(Boolean).join(" ")
        || null
      tx.shipping_name = shippingName
      tx.shipping_address_line1 = shippingAddress.line1 || null
      tx.shipping_address_line2 = shippingAddress.line2 || null
      tx.shipping_city = shippingAddress.city || null
      tx.shipping_postal_code = shippingAddress.postal_code || null
    }
    if (shippingMethodId) {
      tx.shipping_method_id = shippingMethodId
    }
  }

  // ── Clean up old pending transactions ──
  const auctionBlockItemIds = transactionInserts.filter(t => t.block_item_id).map(t => t.block_item_id)
  if (auctionBlockItemIds.length > 0) {
    await pgConnection("transaction")
      .whereIn("block_item_id", auctionBlockItemIds)
      .where("status", "pending")
      .delete()
  }
  const directReleaseIds = transactionInserts.filter(t => !t.block_item_id).map(t => t.release_id)
  if (directReleaseIds.length > 0) {
    await pgConnection("transaction")
      .whereIn("release_id", directReleaseIds)
      .where("user_id", customerId)
      .where("item_type", "direct_purchase")
      .where("status", "pending")
      .delete()
  }

  // ── Insert transactions ──
  await pgConnection("transaction").insert(transactionInserts)

  // ── Get customer info ──
  const customer = await pgConnection("customer")
    .select("email", "first_name", "last_name")
    .where("id", customerId)
    .first()

  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ")

  // ── Save/update default shipping address ──
  if (shippingAddress) {
    const addressData = {
      first_name: shippingAddress.first_name || customer?.first_name || null,
      last_name: shippingAddress.last_name || customer?.last_name || null,
      address_1: shippingAddress.line1 || null,
      address_2: shippingAddress.line2 || null,
      city: shippingAddress.city || null,
      postal_code: shippingAddress.postal_code || null,
      country_code: shippingCountry,
      updated_at: new Date(),
    }

    const existingAddress = await pgConnection("customer_address")
      .where({ customer_id: customerId, is_default_shipping: true })
      .whereNull("deleted_at")
      .first()

    if (existingAddress) {
      await pgConnection("customer_address")
        .where("id", existingAddress.id)
        .update(addressData)
    } else {
      await pgConnection("customer_address").insert({
        id: generateEntityId(),
        customer_id: customerId,
        is_default_shipping: true,
        is_default_billing: true,
        ...addressData,
        created_at: new Date(),
      })
    }
  }

  return {
    orderGroupId,
    transactionInserts,
    grandTotal,
    itemsTotal,
    shippingCost,
    discountAmount,
    promoCodeId,
    itemDescriptions,
    customerName,
    customerEmail: customer?.email || "",
    shippingCountry,
    shippingZone,
  }
}

export class CheckoutError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
  }
}
