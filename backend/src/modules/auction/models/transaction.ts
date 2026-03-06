import { model } from "@medusajs/framework/utils"

const Transaction = model.define("transaction", {
  id: model.id().primaryKey(),

  // FK to block_item (for auction wins) — NOW NULLABLE
  block_item_id: model.text().nullable(),
  // FK to Release (for direct purchases) — NEW
  release_id: model.text().nullable(),

  user_id: model.text(),

  // Type: auction | direct_purchase
  item_type: model.text().default("auction"),

  // Order grouping: all items in same checkout share this ID
  order_group_id: model.text().nullable(),

  // Pricing
  amount: model.float(),
  shipping_cost: model.float(),
  total_amount: model.float(),
  currency: model.text().default("eur"),

  // Stripe
  stripe_session_id: model.text().nullable(),
  stripe_payment_intent_id: model.text().nullable(),

  // Status: pending | paid | failed | refunded
  status: model.text().default("pending"),
  // Shipping: pending | shipped | delivered
  shipping_status: model.text().default("pending"),

  // Timestamps
  paid_at: model.dateTime().nullable(),
  shipped_at: model.dateTime().nullable(),
  delivered_at: model.dateTime().nullable(),

  // Shipping tracking
  tracking_number: model.text().nullable(),
  carrier: model.text().nullable(),

  // Shipping address (collected by Stripe Checkout)
  shipping_name: model.text().nullable(),
  shipping_address_line1: model.text().nullable(),
  shipping_address_line2: model.text().nullable(),
  shipping_city: model.text().nullable(),
  shipping_postal_code: model.text().nullable(),
  shipping_country: model.text().nullable(),
})

export default Transaction
