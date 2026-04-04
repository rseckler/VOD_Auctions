"use client"

import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { CheckCircle2, XCircle, Mail } from "lucide-react"
import { Suspense } from "react"

function ConfirmedContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get("error")

  if (error === "invalid") {
    return (
      <div className="space-y-6">
        <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
          <XCircle className="h-8 w-8 text-red-400" />
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-foreground">
            Link expired or invalid
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            This confirmation link is no longer valid. Confirmation links
            expire after 24 hours.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Please sign up again and we&rsquo;ll send you a fresh confirmation email.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/"
            className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-colors text-sm"
          >
            Back to Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
        <CheckCircle2 className="h-8 w-8 text-green-500" />
      </div>

      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-foreground">
          You&rsquo;re subscribed!
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          Thanks for confirming your subscription. You&rsquo;ll be the first to hear
          about new auction blocks, rare industrial music finds, and curated collections
          from VOD Records.
        </p>
      </div>

      <div className="bg-background border border-secondary rounded-xl p-5 text-left space-y-2">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">What to expect</p>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1 leading-relaxed list-disc list-inside">
          <li>New auction announcements (T-7 days before opening)</li>
          <li>Bidding-open notifications with lot previews</li>
          <li>Last chance reminders 6 hours before close</li>
        </ul>
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
  )
}

export default function NewsletterConfirmedPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        <Suspense fallback={<div className="text-muted-foreground text-sm">Loading...</div>}>
          <ConfirmedContent />
        </Suspense>
      </div>
    </div>
  )
}
