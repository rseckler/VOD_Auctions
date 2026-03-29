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
          <h1 className="text-2xl font-bold text-[#e8e0d4]">
            Link expired or invalid
          </h1>
          <p className="text-[#a39d96] leading-relaxed">
            This confirmation link is no longer valid. Confirmation links
            expire after 24 hours.
          </p>
          <p className="text-[#a39d96] leading-relaxed">
            Please sign up again and we&rsquo;ll send you a fresh confirmation email.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/"
            className="px-5 py-2.5 bg-[#d4a54a] hover:bg-[#e8b85a] text-[#1c1915] font-semibold rounded-lg transition-colors text-sm"
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
        <h1 className="text-2xl font-bold text-[#e8e0d4]">
          You&rsquo;re subscribed!
        </h1>
        <p className="text-[#a39d96] leading-relaxed">
          Thanks for confirming your subscription. You&rsquo;ll be the first to hear
          about new auction blocks, rare industrial music finds, and curated collections
          from VOD Records.
        </p>
      </div>

      <div className="bg-[#1c1915] border border-[#2a2520] rounded-xl p-5 text-left space-y-2">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#d4a54a]" />
          <p className="text-sm font-semibold text-[#e8e0d4]">What to expect</p>
        </div>
        <ul className="text-sm text-[#6b6560] space-y-1 leading-relaxed list-disc list-inside">
          <li>New auction announcements (T-7 days before opening)</li>
          <li>Bidding-open notifications with lot previews</li>
          <li>Last chance reminders 6 hours before close</li>
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
        <Link
          href="/auctions"
          className="px-5 py-2.5 bg-[#d4a54a] hover:bg-[#e8b85a] text-[#1c1915] font-semibold rounded-lg transition-colors text-sm"
        >
          Browse Auctions
        </Link>
        <Link
          href="/"
          className="px-5 py-2.5 bg-[#1c1915] hover:bg-[#2a2520] text-[#e8e0d4] font-medium rounded-lg border border-[#2a2520] transition-colors text-sm"
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
        <Suspense fallback={<div className="text-[#6b6560] text-sm">Loading...</div>}>
          <ConfirmedContent />
        </Suspense>
      </div>
    </div>
  )
}
