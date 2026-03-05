import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { stripe, SHIPPING_RATES, ShippingZone } from "../../../../lib/stripe"

const APP_URL = process.env.STOREFRONT_URL || "http://localhost:3000"

// EU country codes for Stripe shipping_address_collection
const EU_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
] as const

// POST /store/account/checkout — Create Stripe Checkout Session for a won item
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

  const { block_item_id, shipping_zone } = req.body as {
    block_item_id: string
    shipping_zone: ShippingZone
  }

  if (!block_item_id || !shipping_zone) {
    res.status(400).json({ message: "block_item_id and shipping_zone are required" })
    return
  }

  if (!SHIPPING_RATES[shipping_zone]) {
    res.status(400).json({ message: "Invalid shipping_zone. Must be: de, eu, or world" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    // 1. Verify: Item exists and is sold
    const item = await pgConnection("block_item")
      .select(
        "block_item.id",
        "block_item.current_price",
        "block_item.status",
        "block_item.release_id",
        "block_item.auction_block_id",
        "auction_block.title as block_title",
        "auction_block.slug as block_slug"
      )
      .join("auction_block", "auction_block.id", "block_item.auction_block_id")
      .where("block_item.id", block_item_id)
      .first()

    if (!item) {
      res.status(404).json({ message: "Item not found" })
      return
    }
    if (item.status !== "sold") {
      res.status(400).json({ message: "Item is not available for payment" })
      return
    }

    // 2. Verify: User is the winning bidder
    const winningBid = await pgConnection("bid")
      .where({ block_item_id, user_id: customerId, is_winning: true })
      .first()

    if (!winningBid) {
      res.status(403).json({ message: "You are not the winning bidder for this item" })
      return
    }

    // 3. Check for existing transaction
    const existingTransaction = await pgConnection("transaction")
      .where({ block_item_id })
      .whereIn("status", ["paid", "pending"])
      .first()

    if (existingTransaction?.status === "paid") {
      res.status(400).json({ message: "This item has already been paid for" })
      return
    }

    // 4. Get Release info for Stripe line item description
    const release = await pgConnection("Release")
      .select("title")
      .where("id", item.release_id)
      .first()

    const artistRow = await pgConnection("Release")
      .select("Artist.name")
      .leftJoin("Artist", "Artist.id", "Release.artistId")
      .where("Release.id", item.release_id)
      .first()
    const artistName = artistRow?.name || "Unknown Artist"

    // 5. Get customer email
    const customer = await pgConnection("customer")
      .select("email")
      .where("id", customerId)
      .first()

    // 6. Calculate amounts
    const finalPrice = parseFloat(item.current_price)
    const shippingCost = SHIPPING_RATES[shipping_zone].price
    const totalAmount = finalPrice + shippingCost

    // 7. Create or reuse transaction record
    let transactionId: string
    if (existingTransaction) {
      await pgConnection("transaction")
        .where("id", existingTransaction.id)
        .update({
          shipping_cost: shippingCost,
          total_amount: totalAmount,
          updated_at: new Date(),
        })
      transactionId = existingTransaction.id
    } else {
      const [newTx] = await pgConnection("transaction")
        .insert({
          block_item_id,
          user_id: customerId,
          amount: finalPrice,
          shipping_cost: shippingCost,
          total_amount: totalAmount,
          currency: "eur",
          status: "pending",
          shipping_status: "pending",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id")
      transactionId = newTx.id
    }

    // 8. Create Stripe Checkout Session
    const itemDescription = `${artistName} — ${release?.title || "Release"}`

    const allowedCountries = shipping_zone === "de"
      ? (["DE"] as const)
      : shipping_zone === "eu"
        ? EU_COUNTRIES
        : undefined // world = all Stripe-supported countries

    const sessionConfig: any = {
      mode: "payment",
      customer_email: customer?.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: itemDescription,
              description: `Auction: ${item.block_title}`,
            },
            unit_amount: Math.round(finalPrice * 100),
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Shipping (${SHIPPING_RATES[shipping_zone].label})`,
            },
            unit_amount: Math.round(shippingCost * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        transaction_id: transactionId,
        block_item_id,
        user_id: customerId,
      },
      success_url: `${APP_URL}/account/wins?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/account/wins?payment=cancelled`,
    }

    // Add shipping address collection (skip for "world" to avoid huge country list)
    if (allowedCountries) {
      sessionConfig.shipping_address_collection = {
        allowed_countries: allowedCountries,
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig)

    // 9. Save Stripe session ID
    await pgConnection("transaction")
      .where("id", transactionId)
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
