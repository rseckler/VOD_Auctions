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

  // Payment provider: "stripe" | "paypal"
  payment_provider: model.text().default("stripe"),

  // Stripe
  stripe_session_id: model.text().nullable(),
  stripe_payment_intent_id: model.text().nullable(),

  // PayPal
  paypal_order_id: model.text().nullable(),
  paypal_capture_id: model.text().nullable(),

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

  // Order number (VOD-000001 format, shared across order_group_id)
  order_number: model.text().nullable(),

  // Fulfillment: unfulfilled | packing | shipped | delivered | returned
  fulfillment_status: model.text().default("unfulfilled"),

  // Refund tracking
  refund_amount: model.float().default(0),

  // Payment reminder tracking
  payment_reminder_1_sent_at: model.dateTime().nullable(),
  payment_reminder_3_sent_at: model.dateTime().nullable(),

  // Cancellation
  cancelled_at: model.dateTime().nullable(),
  cancel_reason: model.text().nullable(),

  // Internal admin note
  internal_note: model.text().nullable(),

  // Customer phone
  phone: model.text().nullable(),

  // Billing address (if different from shipping)
  billing_name: model.text().nullable(),
  billing_address_line1: model.text().nullable(),
  billing_city: model.text().nullable(),
  billing_postal_code: model.text().nullable(),
  billing_country: model.text().nullable(),
})

export default Transaction
