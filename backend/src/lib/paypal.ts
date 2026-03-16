/**
 * PayPal REST API Client
 * Handles OAuth2 token management, order creation, capture, and refunds.
 * Switches between Sandbox and Live based on PAYPAL_MODE env var.
 */

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET
const PAYPAL_MODE = process.env.PAYPAL_MODE || "sandbox"

const BASE_URL =
  PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com"

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
  console.warn("[paypal] PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET not set — PayPal features will not work")
}

// ── OAuth2 Token Cache ──
let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64")

  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PayPal OAuth2 failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiresAt = Date.now() + data.expires_in * 1000
  return cachedToken!
}

// ── Create Order ──
export async function createPayPalOrder(params: {
  amount: number
  currency: string
  description: string
  orderGroupId: string
  userId: string
  customerName: string
  customerEmail: string
  shippingAddress?: {
    name: string
    line1: string
    line2?: string
    city: string
    postalCode: string
    country: string
  }
}): Promise<{ id: string; status: string }> {
  const token = await getAccessToken()

  const orderBody: any = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: params.orderGroupId,
        description: params.description,
        custom_id: params.userId,
        amount: {
          currency_code: params.currency.toUpperCase(),
          value: params.amount.toFixed(2),
        },
        ...(params.shippingAddress
          ? {
              shipping: {
                name: { full_name: params.shippingAddress.name },
                address: {
                  address_line_1: params.shippingAddress.line1,
                  ...(params.shippingAddress.line2
                    ? { address_line_2: params.shippingAddress.line2 }
                    : {}),
                  admin_area_2: params.shippingAddress.city,
                  postal_code: params.shippingAddress.postalCode,
                  country_code: params.shippingAddress.country,
                },
              },
            }
          : {}),
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
          brand_name: "VOD Auctions",
          locale: "en-US",
          user_action: "PAY_NOW",
          return_url: "https://vod-auctions.com/account/checkout?payment=success&provider=paypal",
          cancel_url: "https://vod-auctions.com/account/checkout?payment=cancelled",
        },
      },
    },
  }

  const res = await fetch(`${BASE_URL}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": params.orderGroupId, // idempotency
    },
    body: JSON.stringify(orderBody),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PayPal create order failed: ${res.status} ${text}`)
  }

  return await res.json()
}

// ── Capture Order ──
export async function capturePayPalOrder(orderId: string): Promise<{
  id: string
  status: string
  purchase_units: Array<{
    payments: {
      captures: Array<{
        id: string
        status: string
        amount: { currency_code: string; value: string }
      }>
    }
  }>
}> {
  const token = await getAccessToken()

  const res = await fetch(`${BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PayPal capture order failed: ${res.status} ${text}`)
  }

  return await res.json()
}

// ── Refund Capture ──
export async function refundPayPalCapture(
  captureId: string,
  amount?: { value: string; currency_code: string }
): Promise<{ id: string; status: string }> {
  const token = await getAccessToken()

  const body = amount ? { amount } : {}

  const res = await fetch(`${BASE_URL}/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PayPal refund failed: ${res.status} ${text}`)
  }

  return await res.json()
}

// ── Verify Webhook Signature ──
export async function verifyWebhookSignature(params: {
  webhookId: string
  headers: Record<string, string>
  body: string
}): Promise<boolean> {
  const token = await getAccessToken()

  const res = await fetch(`${BASE_URL}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: params.headers["paypal-auth-algo"],
      cert_url: params.headers["paypal-cert-url"],
      transmission_id: params.headers["paypal-transmission-id"],
      transmission_sig: params.headers["paypal-transmission-sig"],
      transmission_time: params.headers["paypal-transmission-time"],
      webhook_id: params.webhookId,
      webhook_event: JSON.parse(params.body),
    }),
  })

  if (!res.ok) return false

  const data = await res.json()
  return data.verification_status === "SUCCESS"
}

// ── Check if PayPal is configured ──
export const paypalConfigured = !!(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET)
