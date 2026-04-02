"use client"

import Link from "next/link"

export default function ApplyConfirmPage() {
  return (
    <div className="min-h-screen bg-[#0d0b08] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-9 h-9 bg-[#d4a54a] rounded-full flex items-center justify-center text-lg font-bold text-[#0d0b08]">
            V
          </div>
          <span className="text-[#d4a54a] text-xl font-semibold tracking-wide">
            VOD Auctions
          </span>
        </div>

        {/* Card */}
        <div className="bg-[#1c1915] rounded-2xl border border-[#2a2520] p-10">
          {/* Gold checkmark */}
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#d4a54a]/10 border-2 border-[#d4a54a] flex items-center justify-center">
            <svg
              className="w-8 h-8 text-[#d4a54a]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <h1 className="font-serif text-2xl text-[#e8e0d4] mb-3">
            Application received
          </h1>

          <p className="text-[#a39d96] text-sm leading-relaxed mb-6">
            We review applications in waves. You&apos;ll hear from us within
            1&ndash;2 weeks.
          </p>

          <div className="border-t border-[#2a2520] pt-6">
            <p className="text-[#a39d96] text-xs leading-relaxed">
              Follow us on{" "}
              <a
                href="https://www.instagram.com/vod_auctions/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#d4a54a] hover:underline"
              >
                Instagram
              </a>{" "}
              for updates and behind-the-scenes previews.
            </p>
          </div>
        </div>

        <Link
          href="/apply"
          className="inline-block mt-6 text-[#a39d96] text-xs hover:text-[#e8e0d4] transition-colors"
        >
          &larr; Back to application
        </Link>
      </div>
    </div>
  )
}
