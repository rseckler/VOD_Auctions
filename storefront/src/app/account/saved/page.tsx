"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { getToken } from "@/lib/auth"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { useAuth } from "@/components/AuthProvider"
import { Heart, Trash2, Disc3, ShoppingCart, Check, AlertTriangle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

type SavedItem = {
  id: string
  release_id: string
  created_at: string
  title: string
  coverImage: string | null
  format: string | null
  artist_name: string | null
  sale_mode: string
  direct_price: number | null
  legacy_price: number | null
  auction_status: string
  block_item_id: string | null
  block_slug: string | null
}

// block_item_id → { is_winning, amount }
type BidStatus = { is_winning: boolean; amount: number }

export default function SavedPage() {
  const { refreshStatus } = useAuth()
  const [items, setItems] = useState<SavedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [addingToCartId, setAddingToCartId] = useState<string | null>(null)
  const [bidStatusMap, setBidStatusMap] = useState<Record<string, BidStatus>>({})

  useEffect(() => {
    fetchSaved()
    fetchBidStatus()
  }, [])

  async function fetchBidStatus() {
    const token = getToken()
    if (!token) return
    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/bids`, {
        headers: { "x-publishable-api-key": PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      const map: Record<string, BidStatus> = {}
      for (const b of data.bids || []) {
        if (b.item?.id) map[b.item.id] = { is_winning: b.is_winning, amount: b.amount }
      }
      setBidStatusMap(map)
    } catch { /* ignore */ }
  }

  async function fetchSaved() {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/saved`, {
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
      const res = await fetch(`${MEDUSA_URL}/store/account/saved/${id}`, {
        method: "DELETE",
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
      })

      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id))
        await refreshStatus()
        toast.success("Removed from saved")
      } else {
        toast.error("Failed to remove item")
      }
    } catch {
      toast.error("Failed to remove item")
    } finally {
      setRemovingId(null)
    }
  }

  async function handleAddToCart(item: SavedItem) {
    const token = getToken()
    if (!token) return

    setAddingToCartId(item.id)
    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/cart`, {
        method: "POST",
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ release_id: item.release_id }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.message || "Failed to add to cart")
        return
      }

      await refreshStatus()
      toast.success("Added to cart")
    } catch {
      toast.error("Failed to add to cart")
    } finally {
      setAddingToCartId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <Heart className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
        <p className="text-muted-foreground mb-2">No saved items yet.</p>
        <p className="text-sm text-muted-foreground/60 mb-4">
          Use the heart icon on any article to save it for later.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/catalog">Browse Catalog</Link>
        </Button>
      </div>
    )
  }

  return (
    <div>
      <h2 className="heading-2 mb-6">
        Saved Items
        <span className="text-muted-foreground text-base font-normal ml-2">
          ({items.length} item{items.length !== 1 ? "s" : ""})
        </span>
      </h2>

      <div className="space-y-2">
        {items.map((item) => {
          const price = item.direct_price || item.legacy_price
          const itemHref =
            item.block_slug && item.block_item_id
              ? `/auctions/${item.block_slug}/${item.block_item_id}`
              : `/catalog/${item.release_id}`
          return (
            <Card key={item.id} className="p-3 gap-0">
              <div className="flex gap-3">
                <Link
                  href={itemHref}
                  className="w-14 h-14 flex-shrink-0 rounded overflow-hidden bg-card relative"
                >
                  {item.coverImage ? (
                    <Image
                      src={item.coverImage}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Disc3 className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  )}
                </Link>

                <div className="flex-1 min-w-0">
                  <Link
                    href={itemHref}
                    className="hover:text-primary transition-colors"
                  >
                    <p className="text-sm font-medium truncate">
                      {item.artist_name && (
                        <span className="text-muted-foreground">
                          {item.artist_name} —{" "}
                        </span>
                      )}
                      {item.title}
                    </p>
                  </Link>
                  {item.block_item_id && bidStatusMap[item.block_item_id] && (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium mt-1 ${
                      bidStatusMap[item.block_item_id].is_winning
                        ? "text-green-400"
                        : "text-orange-400"
                    }`}>
                      {bidStatusMap[item.block_item_id].is_winning
                        ? <><Check className="h-3 w-3" /> Highest bid · €{Number(bidStatusMap[item.block_item_id].amount).toFixed(2)}</>
                        : <><AlertTriangle className="h-3 w-3" /> Outbid · €{Number(bidStatusMap[item.block_item_id].amount).toFixed(2)}</>
                      }
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.format}
                    {item.sale_mode !== "auction_only" && price
                      ? ` · Available for purchase`
                      : ""}
                  </p>
                </div>

                <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                  {price ? (
                    <p className="text-sm font-bold font-mono text-primary">
                      &euro;{Number(price).toFixed(2)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                  <div className="flex items-center gap-1">
                    {item.sale_mode !== "auction_only" && price && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddToCart(item)}
                        disabled={addingToCartId === item.id}
                        className="text-muted-foreground hover:text-primary h-8"
                        title="Add to Cart"
                      >
                        <ShoppingCart className="h-4 w-4" />
                      </Button>
                    )}
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
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
