"use client"

import Link from "next/link"
import { Disc3 } from "lucide-react"

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50 pb-24">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Disc3 className="h-5 w-5 text-primary" />
              <span className="font-serif text-lg">VOD Auctions</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Kuratierte Auktionen für seltene Industrial, Experimental & Electronic Music Tonträger.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-3">Navigation</h4>
            <div className="space-y-2">
              <Link href="/auctions" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Auktionen</Link>
              <Link href="/account" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Mein Konto</Link>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-3">Rechtliches</h4>
            <div className="space-y-2">
              <span className="block text-sm text-muted-foreground">Impressum</span>
              <span className="block text-sm text-muted-foreground">Datenschutz</span>
              <span className="block text-sm text-muted-foreground">AGB</span>
            </div>
          </div>
        </div>
        <div className="mt-8 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          &copy; 2026 VOD Auctions. Alle Rechte vorbehalten.
        </div>
      </div>
    </footer>
  )
}
