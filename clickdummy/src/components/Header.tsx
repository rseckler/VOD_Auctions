"use client"

import Link from "next/link"
import { useFlow } from "@/context/FlowContext"
import { Disc3, User, LogOut, ChevronDown, Menu, X } from "lucide-react"
import { useState } from "react"
import { AuthModal } from "./AuthModal"

export function Header() {
  const { isLoggedIn, logout } = useFlow()
  const [showAuth, setShowAuth] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Disc3 className="h-7 w-7 text-primary transition-transform group-hover:rotate-180 duration-700" />
            <span className="font-serif text-xl tracking-tight">
              <span className="bg-gradient-to-r from-primary to-amber-300 bg-clip-text text-transparent">
                VOD
              </span>
              <span className="text-foreground/80 ml-1">Auctions</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/auctions" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Auktionen
            </Link>
            <Link href="/emails/welcome" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              E-Mails
            </Link>

            {isLoggedIn ? (
              <div className="relative">
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80 transition-colors"
                >
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span>Max M.</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                {showDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-border bg-card p-1 shadow-xl">
                    <Link
                      href="/account"
                      onClick={() => setShowDropdown(false)}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-secondary transition-colors"
                    >
                      <User className="h-4 w-4" /> Mein Konto
                    </Link>
                    <Link
                      href="/account/bids"
                      onClick={() => setShowDropdown(false)}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-secondary transition-colors"
                    >
                      Meine Gebote
                    </Link>
                    <Link
                      href="/account/wins"
                      onClick={() => setShowDropdown(false)}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-secondary transition-colors"
                    >
                      Gewonnen
                    </Link>
                    <hr className="my-1 border-border" />
                    <button
                      onClick={() => { logout(); setShowDropdown(false) }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-secondary transition-colors"
                    >
                      <LogOut className="h-4 w-4" /> Abmelden
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Anmelden
              </button>
            )}
          </nav>

          <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-border bg-card p-4 space-y-3">
            <Link href="/auctions" onClick={() => setMobileOpen(false)} className="block text-sm py-2">Auktionen</Link>
            <Link href="/emails/welcome" onClick={() => setMobileOpen(false)} className="block text-sm py-2">E-Mails</Link>
            {isLoggedIn ? (
              <>
                <Link href="/account" onClick={() => setMobileOpen(false)} className="block text-sm py-2">Mein Konto</Link>
                <Link href="/account/bids" onClick={() => setMobileOpen(false)} className="block text-sm py-2">Meine Gebote</Link>
                <Link href="/account/wins" onClick={() => setMobileOpen(false)} className="block text-sm py-2">Gewonnen</Link>
                <button onClick={() => { logout(); setMobileOpen(false) }} className="text-sm text-destructive py-2">Abmelden</button>
              </>
            ) : (
              <button onClick={() => { setShowAuth(true); setMobileOpen(false) }} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground w-full">Anmelden</button>
            )}
          </div>
        )}
      </header>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
