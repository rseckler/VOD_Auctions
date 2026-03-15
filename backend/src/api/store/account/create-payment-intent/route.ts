import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { stripe } from "../../../../lib/stripe"
import { isAvailableForDirectPurchase } from "../../../../lib/auction-helpers"
import { calculateShipping, getShippingConfig, resolveZoneByCountry } from "../../../../lib/shipping"

type CheckoutItem =
  | { type: "auction_win"; block_item_id: string }
  | { type: "cart"; cart_item_id: string }

type ShippingAddress = {
  name: string
  line1: string
  line2?: string
  city: string
  postal_code: string
  state?: string
  country: string
}

// Supported payment methods for PaymentIntent (Payment Element)
const PAYMENT_METHOD_TYPES = [
  "card",      // Card + Apple Pay + Google Pay (via wallets)
  "paypal",
  "klarna",
  "bancontact",
  "eps",
  "link",
] as const

// POST /store/account/create-payment-intent — Create Stripe PaymentIntent for embedded checkout
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  if (!stripe) {
    res.status(503).json({ message: "Payment service is not configured" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const body = req.body as any
  const items: CheckoutItem[] = body.items
  const shippingAddress: ShippingAddress | undefined = body.shipping_address
  const shipping_method_id: string | undefined = body.shipping_method_id

  // Resolve shipping zone from address country
  let shipping_zone: string
  let shipping_country: string
  if (body.country_code) {
    try {
      const resolved = await resolveZoneByCountry(pgConnection, body.country_code)
      shipping_zone = resolved.zone.slug
      shipping_country = resolved.country_code
    } catch {
      res.status(400).json({ message: `Invalid country_code: ${body.country_code}` })
      return
    }
  } else if (shippingAddress?.country) {
    try {
      const resolved = await resolveZoneByCountry(pgConnection, shippingAddress.country)
      shipping_zone = resolved.zone.slug
      shipping_country = resolved.country_code
    } catch {
      res.status(400).json({ message: `Invalid country: ${shippingAddress.country}` })
      return
    }
  } else {
    res.status(400).json({ message: "shipping_address.country or country_code is required" })
    return
  }

  if (!items || items.length === 0) {
    res.status(400).json({ message: "items are required" })
    return
  }

  try {
    const orderGroupId = generateEntityId()
    const transactionInserts: any[] = []
    const itemDescriptions: string[] = []

    // ── Process auction wins ──
    for (const item of items.filter((i): i is Extract<CheckoutItem, { type: "auction_win" }> => i.type === "auction_win")) {
      const blockItem = await pgConnection("block_item")
        .select("block_item.id", "block_item.current_price", "block_item.status", "block_item.release_id", "auction_block.title as block_title")
        .join("auction_block", "auction_block.id", "block_item.auction_block_id")
        .where("block_item.id", item.block_item_id)
        .first()

      if (!blockItem) {
        res.status(404).json({ message: `Auction item ${item.block_item_id} not found` })
        return
      }
      if (blockItem.status !== "sold") {
        res.status(400).json({ message: `Item ${item.block_item_id} is not available for payment` })
        return
      }

      const winningBid = await pgConnection("bid")
        .where({ block_item_id: item.block_item_id, user_id: customerId, is_winning: true })
        .first()
      if (!winningBid) {
        res.status(403).json({ message: `You are not the winning bidder for item ${item.block_item_id}` })
        return
      }

      const existingPaid = await pgConnection("transaction")
        .where({ block_item_id: item.block_item_id, status: "paid" })
        .first()
      if (existingPaid) {
        res.status(400).json({ message: `Item ${item.block_item_id} has already been paid for` })
        return
      }

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
    for (const item of items.filter((i): i is Extract<CheckoutItem, { type: "cart" }> => i.type === "cart")) {
      const cartItem = await pgConnection("cart_item")
        .where({ id: item.cart_item_id, user_id: customerId })
        .whereNull("deleted_at")
        .first()

      if (!cartItem) {
        res.status(404).json({ message: `Cart item ${item.cart_item_id} not found` })
        return
      }

      const { available, reason } = await isAvailableForDirectPurchase(pgConnection, cartItem.release_id)
      if (!available) {
        res.status(400).json({ message: `${reason} (${cartItem.release_id})` })
        return
      }

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
      res.status(400).json({ message: "No valid items for checkout" })
      return
    }

    // ── Calculate shipping ──
    const shippingItems = transactionInserts.map((t) => ({
      release_id: t.release_id,
      quantity: 1,
    }))

    let shippingCost: number
    try {
      const estimate = await calculateShipping(pgConnection, shippingItems, shipping_zone)
      shippingCost = estimate.price
    } catch {
      const fallbackRates: Record<string, number> = { de: 4.99, eu: 9.99, world: 14.99 }
      shippingCost = fallbackRates[shipping_zone] || 14.99
    }

    // Free shipping threshold
    const shippingConfig = await getShippingConfig(pgConnection)
    const itemsTotal = transactionInserts.reduce((sum, t) => sum + t.amount, 0)
    if (shippingConfig?.free_shipping_threshold && itemsTotal >= parseFloat(shippingConfig.free_shipping_threshold)) {
      shippingCost = 0
    }

    // Distribute shipping cost proportionally
    let shippingDistributed = 0
    for (let i = 0; i < transactionInserts.length; i++) {
      const share = i === transactionInserts.length - 1
        ? Math.round((shippingCost - shippingDistributed) * 100) / 100
        : Math.round((transactionInserts[i].amount / itemsTotal) * shippingCost * 100) / 100
      transactionInserts[i].shipping_cost = share
      transactionInserts[i].total_amount = transactionInserts[i].amount + share
      shippingDistributed += share
    }

    const grandTotal = itemsTotal + shippingCost

    // ── Store shipping address + method on transactions ──
    for (const tx of transactionInserts) {
      tx.shipping_country = shipping_country
      if (shippingAddress) {
        tx.shipping_name = shippingAddress.name || null
        tx.shipping_address_line1 = shippingAddress.line1 || null
        tx.shipping_address_line2 = shippingAddress.line2 || null
        tx.shipping_city = shippingAddress.city || null
        tx.shipping_postal_code = shippingAddress.postal_code || null
      }
      if (shipping_method_id) {
        tx.shipping_method_id = shipping_method_id
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
    // Also clean up old pending direct purchase transactions for same releases
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

    // ── Create Stripe PaymentIntent ──
    const description = itemDescriptions.length <= 3
      ? itemDescriptions.join(", ")
      : `${itemDescriptions.slice(0, 2).join(", ")} +${itemDescriptions.length - 2} more`

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(grandTotal * 100),
      currency: "eur",
      payment_method_types: [...PAYMENT_METHOD_TYPES],
      description: `VOD Auctions — ${description}`,
      receipt_email: customer?.email || undefined,
      metadata: {
        order_group_id: orderGroupId,
        user_id: customerId,
        customer_name: customerName || "",
        customer_email: customer?.email || "",
      },
      ...(shippingAddress ? {
        shipping: {
          name: shippingAddress.name || customerName || "",
          address: {
            line1: shippingAddress.line1 || "",
            line2: shippingAddress.line2 || "",
            city: shippingAddress.city || "",
            postal_code: shippingAddress.postal_code || "",
            state: shippingAddress.state || "",
            country: shipping_country,
          },
        },
      } : {}),
    }, {
      idempotencyKey: orderGroupId, // prevent duplicate charges on retry
    })

    // ── Save PaymentIntent ID on transactions ──
    await pgConnection("transaction")
      .where("order_group_id", orderGroupId)
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        updated_at: new Date(),
      })

    res.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      order_group_id: orderGroupId,
      amount: grandTotal,
      shipping_cost: shippingCost,
    })
  } catch (error: any) {
    console.error("[create-payment-intent] Error:", error)
    res.status(500).json({ message: "Failed to create payment intent" })
  }
}
