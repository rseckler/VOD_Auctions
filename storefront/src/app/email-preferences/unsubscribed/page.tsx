import Link from "next/link"
import { MailX } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Unsubscribed — VOD Auctions",
  description: "You have been unsubscribed from VOD Auctions emails.",
  robots: { index: false },
}

export default function UnsubscribedPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="h-16 w-16 rounded-full bg-background border border-secondary flex items-center justify-center mx-auto">
          <MailX className="h-8 w-8 text-muted-foreground" />
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-foreground">
            You&rsquo;ve been unsubscribed
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            You&rsquo;ll no longer receive marketing emails from VOD Auctions.
            Transactional emails (order confirmations, shipping updates) will
            continue as they are required for purchases.
          </p>
        </div>

        <div className="bg-background border border-secondary rounded-xl p-5 text-left space-y-3">
          <p className="text-sm font-semibold text-foreground">Changed your mind?</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You can re-subscribe at any time by visiting your account settings or
            by signing up for the newsletter on our website.
          </p>
          <Link
            href="/account/settings"
            className="inline-block text-sm text-primary hover:text-primary/80 transition-colors font-medium"
          >
            Go to Email Preferences &rsaquo;
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/auctions"
            className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-colors text-sm"
          >
            Browse Auctions
          </Link>
          <Link
            href="/"
            className="px-5 py-2.5 bg-background hover:bg-secondary text-foreground font-medium rounded-lg border border-secondary transition-colors text-sm"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
