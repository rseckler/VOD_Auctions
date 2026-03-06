import Link from "next/link"
import { Disc3 } from "lucide-react"

export function Footer() {
  return (
    <footer className="border-t border-[rgba(232,224,212,0.08)] mt-auto">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col md:flex-row justify-between gap-8">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/60 to-primary/20 flex items-center justify-center">
                <Disc3 className="h-4 w-4 text-primary" />
              </div>
              <span className="text-lg font-serif text-foreground">VOD Auctions</span>
            </div>
            <p className="text-muted-foreground text-sm max-w-xs">
              Curated auctions for rare records from the
              Industrial, Experimental and Electronic Music genres.
            </p>
          </div>
          <div className="flex gap-12 text-sm">
            <div className="flex flex-col gap-2">
              <p className="text-foreground font-medium">Navigation</p>
              <Link
                href="/auctions"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Current Auctions
              </Link>
              <Link
                href="/catalog"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Catalog
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-foreground font-medium">Legal</p>
              <Link
                href="/impressum"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Impressum
              </Link>
              <Link
                href="/agb"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                AGB
              </Link>
              <Link
                href="/datenschutz"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Datenschutz
              </Link>
              <Link
                href="/widerruf"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Widerrufsbelehrung
              </Link>
              <Link
                href="/cookies"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Cookie-Richtlinie
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-[rgba(232,224,212,0.08)] mt-8 pt-8">
          <p className="text-center text-xs text-muted-foreground/60">
            &copy; {new Date().getFullYear()} VOD Auctions. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
