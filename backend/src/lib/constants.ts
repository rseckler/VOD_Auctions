// Logging prefixes
export const LOG = {
  BID: "[bid]",
  ANTI_SNIPE: "[anti-snipe]",
  STRIPE: "[stripe-webhook]",
  PAYPAL: "[paypal-webhook]",
  LIFECYCLE: "[auction-lifecycle]",
  PAYMENT_DEADLINE: "[payment-deadline]",
  WATCHLIST: "[watchlist-reminder]",
  NEWSLETTER: "[newsletter-sequence]",
  FEEDBACK: "[feedback-email]",
  CRM: "[crm-sync]",
  EMAIL: "[email]",
} as const

// Auction statuses
export const AUCTION_STATUS = {
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  PREVIEW: "preview",
  ACTIVE: "active",
  ENDED: "ended",
  ARCHIVED: "archived",
} as const

// Block item auction statuses
export const ITEM_STATUS = {
  AVAILABLE: "available",
  RESERVED: "reserved",
  IN_AUCTION: "in_auction",
  SOLD: "sold",
  UNSOLD: "unsold",
} as const

// Transaction statuses
export const TRANSACTION_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  REFUNDED: "refunded",
  PARTIALLY_REFUNDED: "partially_refunded",
  CANCELLED: "cancelled",
  FAILED: "failed",
} as const

// Fulfillment statuses
export const FULFILLMENT_STATUS = {
  UNFULFILLED: "unfulfilled",
  PACKING: "packing",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  RETURNED: "returned",
} as const

// Payment deadline constants
export const PAYMENT_DEADLINE_DAYS = 5
export const PAYMENT_REMINDER_1_DAY = 1
export const PAYMENT_REMINDER_3_DAY = 3

// Anti-sniping
export const ANTI_SNIPE_EXTENSION_MINUTES = 5
export const ANTI_SNIPE_MAX_EXTENSIONS = 10
