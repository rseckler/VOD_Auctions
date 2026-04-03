"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, Disc3, ShoppingCart, Heart, Search, User } from "lucide-react"
import { useState, useEffect } from "react"
import { HeaderAuth } from "@/components/HeaderAuth"
import { MobileNav } from "./MobileNav"
import { useAuth } from "@/components/AuthProvider"
import { AuthModal } from "@/components/AuthModal"
import { SearchAutocomplete } from "@/components/SearchAutocomplete"

const NAV_LINKS = [
  { href: "/auctions", label: "Auctions" },
  { href: "/catalog", label: "Catalog" },
  { href: "/gallery", label: "Gallery" },
  { href: "/about", label: "About" },
]

export function Header() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { isAuthenticated, cartCount, savedCount, emailVerified, resendVerification } = useAuth()
  const [verifyBannerDismissed, setVerifyBannerDismissed] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const showVerifyBanner = isAuthenticated && !emailVerified && !verifyBannerDismissed

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

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
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Search catalog"
            >
              <Search className="h-5 w-5" />
              <kbd className="hidden lg:inline-flex h-5 px-1.5 items-center rounded border border-border/50 text-[10px] text-muted-foreground/60 font-mono">
                ⌘K
              </kbd>
            </button>
            <Link
              href={isAuthenticated ? "/account/saved" : "#"}
              onClick={handleAnonClick}
              className="relative text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`Saved, ${savedCount} item${savedCount !== 1 ? "s" : ""}`}
            >
              <Heart className="h-5 w-5" />
              {isAuthenticated && savedCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-[#d4a54a] text-[#1c1915] text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
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

          {/* Mobile: Profile + Hamburger */}
          <div className="md:hidden flex items-center gap-1">
            {isAuthenticated && (
              <Link
                href="/account"
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="My Account"
              >
                <User className="h-5 w-5" />
              </Link>
            )}
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>

        <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />

        {/* Email verification banner */}
        {showVerifyBanner && (
          <div className="bg-primary/10 border-b border-primary/30">
            <div className="mx-auto max-w-6xl px-6 py-2 flex items-center justify-between gap-3">
              <p className="text-sm text-primary">
                Please verify your email to place bids.{" "}
                <button
                  onClick={async () => {
                    setResendSent(true)
                    await resendVerification()
                  }}
                  className="underline hover:text-primary/80 font-medium"
                  disabled={resendSent}
                >
                  {resendSent ? "Email sent!" : "Resend verification email"}
                </button>
              </p>
              <button
                onClick={() => setVerifyBannerDismissed(true)}
                className="text-primary/60 hover:text-primary text-lg leading-none shrink-0"
                aria-label="Dismiss"
              >
                &times;
              </button>
            </div>
          </div>
        )}
      </header>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
      <SearchAutocomplete
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </>
  )
}
