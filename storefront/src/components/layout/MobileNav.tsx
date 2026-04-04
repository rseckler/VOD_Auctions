"use client"

import Link from "next/link"
import { Gavel, User, LogOut, Disc3, Library, Info, Search, ShoppingCart, Heart, Trophy, Package, MapPin, Settings, Landmark } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useState } from "react"
import { AuthModal } from "@/components/AuthModal"

export function MobileNav({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { isAuthenticated, customer, logout, cartCount, savedCount, bidsCount } = useAuth()
  const [authModalOpen, setAuthModalOpen] = useState(false)

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="right" className="w-72 bg-card border-border">
          <SheetHeader>
            <SheetTitle className="text-left flex items-center gap-2">
              <Disc3 className="h-5 w-5 text-primary" />
              <span className="font-serif text-lg text-foreground">VOD Auctions</span>
            </SheetTitle>
          </SheetHeader>

          <nav className="flex flex-col gap-1 mt-6">
            <Link
              href="/auctions"
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-[rgba(232,224,212,0.04)] transition-colors"
            >
              <Gavel className="h-4 w-4" />
              Auctions
            </Link>
            <Link
              href="/catalog"
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-[rgba(232,224,212,0.04)] transition-colors"
            >
              <Library className="h-4 w-4" />
              Catalog
            </Link>
            <Link
              href="/gallery"
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-[rgba(232,224,212,0.04)] transition-colors"
            >
              <Landmark className="h-4 w-4" />
              Gallery
            </Link>
            <Link
              href="/about"
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-[rgba(232,224,212,0.04)] transition-colors"
            >
              <Info className="h-4 w-4" />
              About
            </Link>
            <Link
              href="/catalog"
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-[rgba(232,224,212,0.04)] transition-colors"
            >
              <Search className="h-4 w-4" />
              Search Catalog
            </Link>

            {isAuthenticated && customer && (
              <>
                <div className="border-t border-[rgba(232,224,212,0.08)] my-2" />
                <Link
                  href="/account/saved"
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-[rgba(232,224,212,0.04)] transition-colors"
                >
                  <Heart className="h-4 w-4" />
                  Saved{savedCount > 0 && ` (${savedCount})`}
                </Link>
                <Link
                  href="/account/cart"
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-[rgba(232,224,212,0.04)] transition-colors"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Cart{cartCount > 0 && ` (${cartCount})`}
                </Link>
                <Link
                  href="/account"
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-[rgba(232,224,212,0.04)] transition-colors"
                >
                  <User className="h-4 w-4" />
                  My Account
                </Link>
                <Link
                  href="/account/bids"
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 pl-7 py-2 rounded-md text-sm text-muted-foreground/80 hover:text-foreground hover:bg-[rgba(232,224,212,0.04)] transition-colors"
                >
                  <Gavel className="h-3.5 w-3.5" />
                  My Bids{bidsCount > 0 && ` (${bidsCount})`}
                </Link>
                <Link
                  href="/account/wins"
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 pl-7 py-2 rounded-md text-sm text-muted-foreground/80 hover:text-foreground hover:bg-[rgba(232,224,212,0.04)] transition-colors"
                >
                  <Trophy className="h-3.5 w-3.5" />
                  Won
                </Link>
                <Link
                  href="/account/orders"
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 pl-7 py-2 rounded-md text-sm text-muted-foreground/80 hover:text-foreground hover:bg-[rgba(232,224,212,0.04)] transition-colors"
                >
                  <Package className="h-3.5 w-3.5" />
                  Orders
                </Link>
                <Link
                  href="/account/addresses"
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 pl-7 py-2 rounded-md text-sm text-muted-foreground/80 hover:text-foreground hover:bg-[rgba(232,224,212,0.04)] transition-colors"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Addresses
                </Link>
                <Link
                  href="/account/settings"
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 pl-7 py-2 rounded-md text-sm text-muted-foreground/80 hover:text-foreground hover:bg-[rgba(232,224,212,0.04)] transition-colors"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </Link>
                <button
                  onClick={() => {
                    logout()
                    onClose()
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-[rgba(232,224,212,0.04)] transition-colors text-left"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </>
            )}

            {!isAuthenticated && (
              <>
                <div className="border-t border-[rgba(232,224,212,0.08)] my-2" />
                <Button
                  size="sm"
                  onClick={() => {
                    onClose()
                    setAuthModalOpen(true)
                  }}
                  className="mx-3 bg-gradient-to-r from-primary to-[#b8860b]"
                >
                  Login
                </Button>
              </>
            )}
          </nav>
        </SheetContent>
      </Sheet>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  )
}
