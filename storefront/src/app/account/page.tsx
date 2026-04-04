"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/components/AuthProvider"
import { getToken } from "@/lib/auth"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { Gavel, Trophy, Package, ShoppingCart, Heart, ArrowRight, CreditCard } from "lucide-react"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export default function AccountOverview() {
  const { customer } = useAuth()
  const [activeBids, setActiveBids] = useState(0)
  const [winningCount, setWinningCount] = useState(0)
  const [wins, setWins] = useState(0)
  const [unpaidAmount, setUnpaidAmount] = useState(0)
  const [pastOrders, setPastOrders] = useState(0)
  const [cartItems, setCartItems] = useState(0)
  const [cartTotal, setCartTotal] = useState(0)
  const [savedItems, setSavedItems] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) return

    const headers = {
      "x-publishable-api-key": PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    }

    Promise.all([
      fetch(`${MEDUSA_URL}/store/account/bids`, { headers }).then((r) => r.json()),
      fetch(`${MEDUSA_URL}/store/account/wins`, { headers }).then((r) => r.json()),
      fetch(`${MEDUSA_URL}/store/account/orders`, { headers }).then((r) => r.json()),
      fetch(`${MEDUSA_URL}/store/account/cart`, { headers }).then((r) => r.json()),
      fetch(`${MEDUSA_URL}/store/account/saved`, { headers }).then((r) => r.json()),
    ])
      .then(([bidsData, winsData, ordersData, cartData, savedData]) => {
        const bids = bidsData.bids || []
        const active = bids.filter((b: any) => b.is_winning && b.item?.status === "active")
        setActiveBids(active.length)
        setWinningCount(bids.filter((b: any) => b.is_winning).length)
        setWins(winsData.count || 0)
        // Sum unpaid win amounts
        const unpaid = (winsData.wins || []).filter((w: any) => !w.transaction || w.transaction.status !== "paid")
        setUnpaidAmount(unpaid.reduce((sum: number, w: any) => sum + Number(w.item?.current_price || 0), 0))
        setPastOrders(ordersData.count || 0)
        const items = cartData.items || []
        setCartItems(items.length)
        setCartTotal(items.reduce((sum: number, i: any) => sum + Number(i.price || 0), 0))
        setSavedItems(savedData.count || 0)
        setLoaded(true)
      })
      .catch(() => {
        toast.error("Failed to load account data")
        setLoaded(true)
      })
  }, [])

  return (
    <div>
      <h2 className="heading-2 mb-6">
        Welcome, {customer?.first_name || customer?.email}
      </h2>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {/* Active Bids */}
        <Card className="p-4 hover:border-primary/30 transition-colors group">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Gavel className="h-4 w-4 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">Active Bids</p>
          </div>
          <p className="text-2xl font-bold font-mono mb-1">
            {loaded ? activeBids : <Skeleton className="h-7 w-10 inline-block" />}
          </p>
          {loaded && winningCount > 0 && (
            <p className="text-xs text-green-400 mb-2">Winning {winningCount} lot{winningCount !== 1 ? "s" : ""}</p>
          )}
          <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground group-hover:text-foreground" asChild>
            <Link href="/account/bids">View Bids <ArrowRight className="h-3 w-3" /></Link>
          </Button>
        </Card>

        {/* Won Auctions */}
        <Card className="p-4 hover:border-primary/30 transition-colors group">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-md bg-green-500/10">
              <Trophy className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-xs text-muted-foreground">Won Auctions</p>
          </div>
          <p className="text-2xl font-bold font-mono mb-1">
            {loaded ? wins : <Skeleton className="h-7 w-10 inline-block" />}
          </p>
          {loaded && unpaidAmount > 0 && (
            <p className="text-xs text-amber-400 mb-2">&euro;{unpaidAmount.toFixed(2)} awaiting payment</p>
          )}
          <Button
            variant={unpaidAmount > 0 ? "default" : "ghost"}
            size="sm"
            className={`w-full justify-between text-xs ${unpaidAmount > 0 ? "" : "text-muted-foreground group-hover:text-foreground"}`}
            asChild
          >
            <Link href="/account/wins">
              {unpaidAmount > 0 ? <><CreditCard className="h-3 w-3" /> Pay Now</> : <>View Wins <ArrowRight className="h-3 w-3" /></>}
            </Link>
          </Button>
        </Card>

        {/* Past Orders */}
        <Card className="p-4 hover:border-primary/30 transition-colors group">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Package className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-xs text-muted-foreground">Past Orders</p>
          </div>
          <p className="text-2xl font-bold font-mono mb-1">
            {loaded ? pastOrders : <Skeleton className="h-7 w-10 inline-block" />}
          </p>
          <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground group-hover:text-foreground" asChild>
            <Link href="/account/orders">View Orders <ArrowRight className="h-3 w-3" /></Link>
          </Button>
        </Card>

        {/* Cart */}
        <Card className="p-4 hover:border-primary/30 transition-colors group">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-md bg-orange-500/10">
              <ShoppingCart className="h-4 w-4 text-orange-500" />
            </div>
            <p className="text-xs text-muted-foreground">Cart</p>
          </div>
          <p className="text-2xl font-bold font-mono mb-1">
            {loaded ? cartItems : <Skeleton className="h-7 w-10 inline-block" />}
          </p>
          {loaded && cartTotal > 0 && (
            <p className="text-xs text-muted-foreground mb-2">&euro;{cartTotal.toFixed(2)} total</p>
          )}
          <Button
            variant={cartItems > 0 ? "default" : "ghost"}
            size="sm"
            className={`w-full justify-between text-xs ${cartItems > 0 ? "" : "text-muted-foreground group-hover:text-foreground"}`}
            asChild
          >
            <Link href={cartItems > 0 ? "/account/checkout" : "/account/cart"}>
              {cartItems > 0 ? <>Checkout <ArrowRight className="h-3 w-3" /></> : <>View Cart <ArrowRight className="h-3 w-3" /></>}
            </Link>
          </Button>
        </Card>

        {/* Saved */}
        <Card className="p-4 hover:border-primary/30 transition-colors group">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-md bg-rose-500/10">
              <Heart className="h-4 w-4 text-rose-500" />
            </div>
            <p className="text-xs text-muted-foreground">Saved</p>
          </div>
          <p className="text-2xl font-bold font-mono mb-1">
            {loaded ? savedItems : <Skeleton className="h-7 w-10 inline-block" />}
          </p>
          <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground group-hover:text-foreground" asChild>
            <Link href="/account/saved">View Saved <ArrowRight className="h-3 w-3" /></Link>
          </Button>
        </Card>
      </div>
    </div>
  )
}
