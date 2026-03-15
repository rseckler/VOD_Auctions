import { loadStripe } from "@stripe/stripe-js"

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""

if (!publishableKey) {
  console.warn("[stripe-client] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set")
}

export const stripePromise = publishableKey ? loadStripe(publishableKey) : null
