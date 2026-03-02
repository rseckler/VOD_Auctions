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
              Kuratierte Auktionen für seltene Tonträger aus den Bereichen
              Industrial, Experimental und Electronic Music.
            </p>
          </div>
          <div className="flex gap-12 text-sm">
            <div className="flex flex-col gap-2">
              <p className="text-foreground font-medium">Navigation</p>
              <Link
                href="/auctions"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Aktuelle Auktionen
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-[rgba(232,224,212,0.08)] mt-8 pt-8">
          <p className="text-center text-xs text-muted-foreground/60">
            &copy; {new Date().getFullYear()} VOD Auctions. Alle Rechte
            vorbehalten.
          </p>
        </div>
      </div>
    </footer>
  )
}
