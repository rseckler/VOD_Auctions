"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getToken } from "@/lib/auth"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { useAuth } from "@/components/AuthProvider"
import { ShoppingCart, Trash2, Disc3 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import type { CartItem } from "@/types"

export default function CartPage() {
  const { refreshStatus } = useAuth()
  const [items, setItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    fetchCart()
  }, [])

  async function fetchCart() {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/cart`, {
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
      })
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(id: string) {
    const token = getToken()
    if (!token) return

    setRemovingId(id)
    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/cart/${id}`, {
        method: "DELETE",
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
      })

      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id))
        await refreshStatus()
        toast.success("Removed from cart")
      } else {
        toast.error("Failed to remove item")
      }
    } catch {
      toast.error("Failed to remove item")
    } finally {
      setRemovingId(null)
    }
  }

  const subtotal = items.reduce((sum, item) => sum + item.price, 0)

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <ShoppingCart className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
        <p className="text-muted-foreground mb-2">Your cart is empty.</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/catalog">Browse Catalog</Link>
        </Button>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">
        Shopping Cart
        <span className="text-muted-foreground text-base font-normal ml-2">
          ({items.length} item{items.length !== 1 ? "s" : ""})
        </span>
      </h2>

      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.id} className="p-4">
            <div className="flex gap-4">
              <Link
                href={`/catalog/${item.release_id}`}
                className="w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-card"
              >
                {item.coverImage ? (
                  <img
                    src={item.coverImage}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Disc3 className="h-6 w-6 text-muted-foreground/30" />
                  </div>
                )}
              </Link>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {item.artist_name && (
                    <span className="text-muted-foreground">
                      {item.artist_name} —{" "}
                    </span>
                  )}
                  {item.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.format} · Direct Purchase
                </p>
              </div>

              <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                <p className="text-lg font-bold font-mono text-primary">
                  &euro;{Number(item.price).toFixed(2)}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(item.id)}
                  disabled={removingId === item.id}
                  className="text-muted-foreground hover:text-destructive h-8"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-4">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="text-xl font-bold font-mono text-primary">
            &euro;{subtotal.toFixed(2)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Shipping calculated at checkout based on weight and destination.
        </p>
        <Button asChild className="w-full mt-4 bg-primary hover:bg-primary/90 text-[#1c1915]">
          <Link href="/account/checkout">Proceed to Checkout</Link>
        </Button>
      </Card>
    </div>
  )
}
