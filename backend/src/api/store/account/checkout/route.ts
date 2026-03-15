import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { stripe } from "../../../../lib/stripe"
import { isAvailableForDirectPurchase } from "../../../../lib/auction-helpers"
import { calculateShipping, getShippingConfig, resolveZoneByCountry } from "../../../../lib/shipping"

const APP_URL = process.env.STOREFRONT_URL || "http://localhost:3000"

// EU country codes for Stripe shipping_address_collection
const EU_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
] as const

type CheckoutItem =
  | { type: "auction_win"; block_item_id: string }
  | { type: "cart"; cart_item_id: string }

// POST /store/account/checkout — Combined Checkout (auction wins + cart items)
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

  // Backward compatibility: old format { block_item_id, shipping_zone }
  let items: CheckoutItem[]
  let shipping_zone: string
  let shipping_country: string | null = null

  const body = req.body as any
  if (body.block_item_id && !body.items) {
    items = [{ type: "auction_win", block_item_id: body.block_item_id }]
    shipping_zone = body.shipping_zone
  } else {
    items = body.items
    shipping_zone = body.shipping_zone
  }

  // Support country_code: resolve to zone_slug
  if (body.country_code && !shipping_zone) {
    try {
      const resolved = await resolveZoneByCountry(pgConnection, body.country_code)
      shipping_zone = resolved.zone.slug
      shipping_country = resolved.country_code
    } catch {
      res.status(400).json({ message: `Invalid country_code: ${body.country_code}` })
      return
    }
  }

  if (!items || items.length === 0 || !shipping_zone) {
    res.status(400).json({ message: "items and shipping_zone (or country_code) are required" })
    return
  }

  // Validate zone exists
  const zoneCheck = await pgConnection("shipping_zone").where("slug", shipping_zone).first()
  if (!zoneCheck) {
    res.status(400).json({ message: `Invalid shipping zone: ${shipping_zone}` })
    return
  }

  try {
    const orderGroupId = generateEntityId()
    const lineItems: any[] = []
    const transactionInserts: any[] = []

    // Process auction wins
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

      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: `${release?.artist_name || "Unknown"} — ${release?.title || "Release"}`,
            description: `Auction: ${blockItem.block_title}`,
          },
          unit_amount: Math.round(price * 100),
        },
        quantity: 1,
      })

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

    // Process cart items
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

      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: `${releaseInfo?.artist_name || "Unknown"} — ${releaseInfo?.title || "Release"}`,
            description: "Direct Purchase",
          },
          unit_amount: Math.round(price * 100),
        },
        quantity: 1,
      })

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

    if (lineItems.length === 0) {
      res.status(400).json({ message: "No valid items for checkout" })
      return
    }

    // Calculate shipping dynamically based on item weights
    const shippingItems = transactionInserts.map((t) => ({
      release_id: t.release_id,
      quantity: 1,
    }))

    let shippingCost: number
    let shippingLabel: string
    try {
      const estimate = await calculateShipping(pgConnection, shippingItems, shipping_zone)
      shippingCost = estimate.price
      shippingLabel = `Shipping (${estimate.zone.name} — ${estimate.carrier})`
    } catch {
      // Fallback to simple flat rates if shipping tables not yet configured
      const fallbackRates: Record<string, number> = { de: 4.99, eu: 9.99, world: 14.99 }
      shippingCost = fallbackRates[shipping_zone] || 14.99
      shippingLabel = `Shipping (${shipping_zone.toUpperCase()})`
    }

    // Check free shipping threshold
    const shippingConfig = await getShippingConfig(pgConnection)
    const itemsTotal = transactionInserts.reduce((sum, t) => sum + t.amount, 0)
    if (shippingConfig?.free_shipping_threshold && itemsTotal >= parseFloat(shippingConfig.free_shipping_threshold)) {
      shippingCost = 0
      shippingLabel = "Shipping (Free)"
    }

    // Distribute shipping cost proportionally across items
    let shippingDistributed = 0
    for (let i = 0; i < transactionInserts.length; i++) {
      const share = i === transactionInserts.length - 1
        ? Math.round((shippingCost - shippingDistributed) * 100) / 100
        : Math.round((transactionInserts[i].amount / itemsTotal) * shippingCost * 100) / 100
      transactionInserts[i].shipping_cost = share
      transactionInserts[i].total_amount = transactionInserts[i].amount + share
      shippingDistributed += share
    }

    // Add shipping line item (only if there's a cost)
    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: shippingLabel,
          },
          unit_amount: Math.round(shippingCost * 100),
        },
        quantity: 1,
      })
    }

    // Store shipping country and method on transactions BEFORE insert
    if (shipping_country) {
      for (const tx of transactionInserts) {
        tx.shipping_country = shipping_country
      }
    }
    const shipping_method_id = body.shipping_method_id
    if (shipping_method_id) {
      for (const tx of transactionInserts) {
        tx.shipping_method_id = shipping_method_id
      }
    }

    // Delete existing pending transactions for these auction items (avoid duplicates on retry)
    const auctionBlockItemIds = transactionInserts.filter(t => t.block_item_id).map(t => t.block_item_id)
    if (auctionBlockItemIds.length > 0) {
      await pgConnection("transaction")
        .whereIn("block_item_id", auctionBlockItemIds)
        .where("status", "pending")
        .delete()
    }

    // Insert all transaction records
    await pgConnection("transaction").insert(transactionInserts)

    // Get customer info (email + name for Stripe/PayPal display)
    const customer = await pgConnection("customer")
      .select("email", "first_name", "last_name")
      .where("id", customerId)
      .first()

    // Build Stripe session — restrict to selected country if known
    const allowedCountries = shipping_country
      ? ([shipping_country] as any)
      : shipping_zone === "de"
        ? (["DE"] as const)
        : shipping_zone === "eu"
          ? EU_COUNTRIES
          : undefined

    const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ")

    const sessionConfig: any = {
      mode: "payment",
      customer_email: customer?.email || undefined,
      line_items: lineItems,
      payment_intent_data: {
        description: `VOD Auctions Order — ${customerName || customer?.email || "Customer"}`,
        ...(customerName ? { shipping: {
          name: customerName,
          address: { line1: "", city: "", country: shipping_country || "DE", postal_code: "" },
        } } : {}),
      },
      metadata: {
        order_group_id: orderGroupId,
        user_id: customerId,
        customer_name: customerName || undefined,
        customer_email: customer?.email || undefined,
      },
      success_url: `${APP_URL}/account/checkout?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/account/checkout?payment=cancelled`,
    }

    if (allowedCountries) {
      sessionConfig.shipping_address_collection = {
        allowed_countries: allowedCountries,
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig)

    // Save stripe session ID on all transactions
    await pgConnection("transaction")
      .where("order_group_id", orderGroupId)
      .update({
        stripe_session_id: session.id,
        updated_at: new Date(),
      })

    res.json({ checkout_url: session.url })
  } catch (error: any) {
    console.error("[checkout] Error:", error)
    res.status(500).json({ message: "Failed to create checkout session" })
  }
}
