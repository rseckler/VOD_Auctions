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
        <div className="h-16 w-16 rounded-full bg-[#1c1915] border border-[#2a2520] flex items-center justify-center mx-auto">
          <MailX className="h-8 w-8 text-[#6b6560]" />
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-[#e8e0d4]">
            You&rsquo;ve been unsubscribed
          </h1>
          <p className="text-[#a39d96] leading-relaxed">
            You&rsquo;ll no longer receive marketing emails from VOD Auctions.
            Transactional emails (order confirmations, shipping updates) will
            continue as they are required for purchases.
          </p>
        </div>

        <div className="bg-[#1c1915] border border-[#2a2520] rounded-xl p-5 text-left space-y-3">
          <p className="text-sm font-semibold text-[#e8e0d4]">Changed your mind?</p>
          <p className="text-sm text-[#6b6560] leading-relaxed">
            You can re-subscribe at any time by visiting your account settings or
            by signing up for the newsletter on our website.
          </p>
          <Link
            href="/account/settings"
            className="inline-block text-sm text-[#d4a54a] hover:text-[#e8b85a] transition-colors font-medium"
          >
            Go to Email Preferences &rsaquo;
          </Link>
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
    </div>
  )
}
