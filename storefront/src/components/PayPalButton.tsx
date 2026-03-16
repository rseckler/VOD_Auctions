"use client"

import { useEffect, useRef, useState } from "react"
import { loadPayPalSDK } from "@/lib/paypal-client"
import { getToken } from "@/lib/auth"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { toast } from "sonner"

type PayPalButtonProps = {
  items: any[]
  countryCode: string
  shippingAddress: any
  shippingMethodId?: string
  promoCode?: string
  onSuccess: (data: { order_group_id: string; capture_id: string }) => void
  onCancel?: () => void
  disabled?: boolean
}

export default function PayPalButton({
  items,
  countryCode,
  shippingAddress,
  shippingMethodId,
  promoCode,
  onSuccess,
  onCancel,
  disabled,
}: PayPalButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const buttonsRendered = useRef(false)

  useEffect(() => {
    if (!containerRef.current || buttonsRendered.current || disabled) return

    let cancelled = false

    async function renderButtons() {
      try {
        const paypal = await loadPayPalSDK()
        if (cancelled || !containerRef.current) return

        // Clear any existing buttons
        containerRef.current.innerHTML = ""
        buttonsRendered.current = true

        paypal
          .Buttons({
            style: {
              layout: "vertical",
              color: "gold",
              shape: "rect",
              label: "paypal",
              height: 48,
            },

            createOrder: async () => {
              const token = getToken()
              if (!token) throw new Error("Not authenticated")

              const body: any = {
                items,
                country_code: countryCode,
                shipping_address: shippingAddress,
                ...(shippingMethodId ? { shipping_method_id: shippingMethodId } : {}),
                ...(promoCode ? { promo_code: promoCode } : {}),
              }

              const res = await fetch(
                `${MEDUSA_URL}/store/account/create-paypal-order`,
                {
                  method: "POST",
                  headers: {
                    "x-publishable-api-key": PUBLISHABLE_KEY,
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(body),
                }
              )

              const data = await res.json()
              if (!res.ok) {
                throw new Error(data.message || "Failed to create PayPal order")
              }

              return data.paypal_order_id
            },

            onApprove: async (data: any) => {
              const token = getToken()
              if (!token) throw new Error("Not authenticated")

              try {
                const res = await fetch(
                  `${MEDUSA_URL}/store/account/capture-paypal-order`,
                  {
                    method: "POST",
                    headers: {
                      "x-publishable-api-key": PUBLISHABLE_KEY,
                      Authorization: `Bearer ${token}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      paypal_order_id: data.orderID,
                    }),
                  }
                )

                const result = await res.json()
                if (!res.ok) {
                  throw new Error(result.message || "Failed to capture payment")
                }

                onSuccess({
                  order_group_id: result.order_group_id,
                  capture_id: result.capture_id,
                })
              } catch (err: any) {
                toast.error(err.message || "Payment capture failed")
                setError(err.message || "Payment capture failed")
              }
            },

            onCancel: () => {
              toast.info("PayPal payment cancelled.")
              onCancel?.()
            },

            onError: (err: any) => {
              console.error("[PayPalButton] Error:", err)
              toast.error("PayPal encountered an error. Please try again.")
              setError("PayPal error. Please try again.")
            },
          })
          .render(containerRef.current)

        setLoading(false)
      } catch (err: any) {
        if (!cancelled) {
          console.error("[PayPalButton] Failed to load:", err)
          setError(err.message || "Failed to load PayPal")
          setLoading(false)
        }
      }
    }

    renderButtons()

    return () => {
      cancelled = true
    }
  }, [disabled])

  // Re-render buttons when checkout params change
  useEffect(() => {
    if (buttonsRendered.current && containerRef.current) {
      buttonsRendered.current = false
      containerRef.current.innerHTML = ""
      setLoading(true)
      setError("")

      // Small delay to ensure cleanup, then re-render
      const timer = setTimeout(() => {
        if (containerRef.current) {
          buttonsRendered.current = false
          // Trigger re-mount by forcing React to re-run the first effect
          setLoading(true)
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [items.length, countryCode, promoCode])

  if (disabled) {
    return (
      <div className="w-full h-12 rounded-lg bg-muted/50 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Complete the form above to enable PayPal</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {loading && (
        <div className="w-full h-12 rounded-lg bg-muted/30 animate-pulse flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading PayPal...</p>
        </div>
      )}
      <div ref={containerRef} className={loading ? "hidden" : ""} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
