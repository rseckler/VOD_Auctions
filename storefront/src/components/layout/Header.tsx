"use client"

import Link from "next/link"
import { Menu, Disc3 } from "lucide-react"
import { useState } from "react"
import { HeaderAuth } from "@/components/HeaderAuth"
import { MobileNav } from "./MobileNav"

const NAV_LINKS = [
  { href: "/auctions", label: "Auctions" },
  { href: "/catalog", label: "Catalog" },
]

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-[rgba(28,25,21,0.95)] backdrop-blur-xl border-b border-[rgba(232,224,212,0.1)]">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="group flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-[#b8860b] flex items-center justify-center">
            <Disc3 className="h-5 w-5 text-[#1c1915] transition-transform group-hover:rotate-180 duration-700" />
          </div>
          <span className="text-xl font-serif text-foreground">VOD Auctions</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
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
  )
}
