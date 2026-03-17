"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, Disc3, ShoppingCart, Heart, Search } from "lucide-react"
import { useState } from "react"
import { HeaderAuth } from "@/components/HeaderAuth"
import { MobileNav } from "./MobileNav"
import { useAuth } from "@/components/AuthProvider"
import { AuthModal } from "@/components/AuthModal"

const NAV_LINKS = [
  { href: "/auctions", label: "Auctions" },
  { href: "/catalog", label: "Catalog" },
  { href: "/about", label: "About" },
]

export function Header() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const { isAuthenticated, cartCount, savedCount } = useAuth()

  function handleAnonClick(e: React.MouseEvent) {
    if (!isAuthenticated) {
      e.preventDefault()
      setAuthModalOpen(true)
    }
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-[rgba(28,25,21,0.95)] backdrop-blur-xl border-b border-[rgba(232,224,212,0.1)]">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-[#b8860b] flex items-center justify-center">
              <Disc3 className="h-5 w-5 text-[#1c1915] transition-transform group-hover:rotate-180 duration-700" />
            </div>
            <span className="text-xl font-serif text-foreground">VOD Auctions</span>
          </Link>

          {/* Desktop Nav */}
          <nav aria-label="Main navigation" className="hidden md:flex items-center gap-6 text-sm">
            {NAV_LINKS.map((link) => {
              const isActive = pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`${isActive ? "text-foreground" : "text-muted-foreground"} hover:text-foreground transition-colors`}
                >
                  {link.label}
                </Link>
              )
            })}
            <Link
              href="/catalog"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Search catalog"
            >
              <Search className="h-5 w-5" />
            </Link>
            <Link
              href={isAuthenticated ? "/account/saved" : "#"}
              onClick={handleAnonClick}
              className="relative text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`Saved, ${savedCount} item${savedCount !== 1 ? "s" : ""}`}
            >
              <Heart className="h-5 w-5" />
              {isAuthenticated && savedCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {savedCount}
                </span>
              )}
            </Link>
            <Link
              href={isAuthenticated ? "/account/cart" : "#"}
              onClick={handleAnonClick}
              className="relative text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`Cart, ${cartCount} item${cartCount !== 1 ? "s" : ""}`}
            >
              <ShoppingCart className="h-5 w-5" />
              {isAuthenticated && cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-primary text-[#1c1915] text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>
            <HeaderAuth />
          </nav>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />
      </header>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  )
}
