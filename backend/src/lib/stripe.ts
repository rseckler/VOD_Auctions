import Stripe from "stripe"

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("[stripe] STRIPE_SECRET_KEY not set — payment features will not work")
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : (null as unknown as Stripe)

// Legacy flat rates — kept for backward compatibility (wins page single-item flow).
// Actual shipping is now calculated dynamically via shipping.ts (RSE-103).
export const SHIPPING_RATES = {
  de: { label: "Germany (Standard)", price: 4.99 },
  eu: { label: "Europe (Standard)", price: 9.99 },
  world: { label: "Worldwide", price: 14.99 },
} as const

export type ShippingZone = keyof typeof SHIPPING_RATES
