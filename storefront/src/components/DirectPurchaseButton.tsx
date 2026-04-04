"use client"

import { useState } from "react"
import { ShoppingCart, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/AuthProvider"
import { getToken } from "@/lib/auth"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { toast } from "sonner"
import { brevoAddToCart } from "@/lib/brevo-tracking"

type Props = {
  releaseId: string
  saleMode: string | null
  directPrice: number | null
  auctionStatus: string | null
}

export function DirectPurchaseButton({ releaseId, saleMode, directPrice, auctionStatus }: Props) {
  const { isAuthenticated, refreshStatus } = useAuth()
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)

  // Only show if item is available for direct purchase
  if (!saleMode || (saleMode !== "direct_purchase" && saleMode !== "both")) return null
  if (!directPrice || directPrice <= 0) return null
  if (auctionStatus !== "available") return null

  async function handleAddToCart() {
    if (!isAuthenticated) {
      toast.error("Please log in to add items to your cart")
      return
    }

    const token = getToken()
    if (!token) return

    setAdding(true)
    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/cart`, {
        method: "POST",
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ release_id: releaseId }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.message || "Failed to add to cart")
        return
      }

      setAdded(true)
      await refreshStatus()
      brevoAddToCart(releaseId, data.title || releaseId, directPrice!)
      toast.success("Added to cart!")
    } catch {
      toast.error("Failed to add to cart")
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="mt-4 bg-primary/10 border border-primary/30 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Direct Purchase</p>
          <p className="text-2xl font-bold font-mono text-primary">
            &euro;{Number(directPrice).toFixed(2)}
          </p>
        </div>
        <Button
          onClick={handleAddToCart}
          disabled={adding || added}
          className={added ? "bg-green-600 hover:bg-green-600" : "bg-primary hover:bg-primary/90 text-primary-foreground"}
        >
          {added ? (
            <>
              <Check className="w-4 h-4 mr-1.5" /> In Cart
            </>
          ) : adding ? (
            "Adding..."
          ) : (
            <>
              <ShoppingCart className="w-4 h-4 mr-1.5" /> Add to Cart
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
