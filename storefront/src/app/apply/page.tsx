"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

const MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const API_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

const GENRE_OPTIONS = [
  "Industrial / Power Electronics",
  "EBM / Synth",
  "Neofolk / Dark Folk",
  "Dark Ambient / Drone",
  "Post-Punk / Goth",
  "Other",
]

const CHANNEL_OPTIONS = [
  "Discogs",
  "eBay",
  "Bandcamp",
  "Record Fairs",
  "Other",
]

export default function ApplyPage() {
  const router = useRouter()
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [country, setCountry] = useState("")
  const [genres, setGenres] = useState<string[]>([])
  const [channels, setChannels] = useState<string[]>([])
  const [referrer, setReferrer] = useState("")

  useEffect(() => {
    fetch(`${MEDUSA_URL}/store/waitlist`, {
      headers: { "x-publishable-api-key": API_KEY },
    })
      .then((res) => res.json())
      .then((data) => setWaitlistCount(data.count))
      .catch(() => {})
  }, [])

  function toggleCheckbox(
    value: string,
    list: string[],
    setter: (v: string[]) => void
  ) {
    setter(
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
    )
  }

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = "Name is required"
    if (!email.trim()) errors.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.email = "Please enter a valid email"
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!validate()) return

    setLoading(true)
    try {
      const res = await fetch(`${MEDUSA_URL}/store/waitlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": API_KEY,
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          country: country.trim() || undefined,
          genres,
          buy_channels: channels,
          referrer_info: referrer.trim() || undefined,
          source: "apply_page",
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.message || "Something went wrong. Please try again.")
      }

      router.push("/apply/confirm")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0b08] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-9 h-9 bg-[#d4a54a] rounded-full flex items-center justify-center text-lg font-bold text-[#0d0b08]">
            V
          </div>
          <span className="text-[#d4a54a] text-xl font-semibold tracking-wide">
            VOD Auctions
          </span>
        </div>

        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl sm:text-4xl text-[#e8e0d4] mb-3">
            Early Access for Collectors
          </h1>
          <p className="text-[#a39d96] text-sm leading-relaxed max-w-md mx-auto">
            41,500 rare industrial releases. Our own platform. No eBay fees. No
            Discogs commissions.
          </p>
          {waitlistCount !== null && waitlistCount > 0 && (
            <div className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-full bg-[#d4a54a]/10 border border-[#d4a54a]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#d4a54a] animate-pulse" />
              <span className="text-[#d4a54a] text-xs font-medium">
                {waitlistCount.toLocaleString()} collector
                {waitlistCount !== 1 ? "s" : ""} on the waitlist
              </span>
            </div>
          )}
        </div>

        {/* Form Card */}
        <div className="bg-[#1c1915] rounded-2xl border border-[#2a2520] p-6 sm:p-8">
          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-[#e8e0d4] text-sm font-medium mb-1.5">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3.5 py-2.5 bg-[#0d0b08] border border-[#2a2520] rounded-lg text-[#e8e0d4] text-sm placeholder-[#6b6560] outline-none focus:border-[#d4a54a] transition-colors"
              />
              {fieldErrors.name && (
                <p className="mt-1 text-red-500 text-xs">{fieldErrors.name}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-[#e8e0d4] text-sm font-medium mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 bg-[#0d0b08] border border-[#2a2520] rounded-lg text-[#e8e0d4] text-sm placeholder-[#6b6560] outline-none focus:border-[#d4a54a] transition-colors"
              />
              {fieldErrors.email && (
                <p className="mt-1 text-red-500 text-xs">{fieldErrors.email}</p>
              )}
            </div>

            {/* Country */}
            <div>
              <label className="block text-[#e8e0d4] text-sm font-medium mb-1.5">
                Country
              </label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Germany"
                className="w-full px-3.5 py-2.5 bg-[#0d0b08] border border-[#2a2520] rounded-lg text-[#e8e0d4] text-sm placeholder-[#6b6560] outline-none focus:border-[#d4a54a] transition-colors"
              />
            </div>

            {/* Genres */}
            <div>
              <label className="block text-[#e8e0d4] text-sm font-medium mb-2.5">
                What do you primarily collect?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {GENRE_OPTIONS.map((genre) => (
                  <label
                    key={genre}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#2a2520] hover:border-[#3a352f] cursor-pointer transition-colors has-[:checked]:border-[#d4a54a]/50 has-[:checked]:bg-[#d4a54a]/5"
                  >
                    <input
                      type="checkbox"
                      checked={genres.includes(genre)}
                      onChange={() => toggleCheckbox(genre, genres, setGenres)}
                      className="sr-only"
                    />
                    <span
                      className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                        genres.includes(genre)
                          ? "bg-[#d4a54a] border-[#d4a54a]"
                          : "border-[#4a4540] bg-transparent"
                      }`}
                    >
                      {genres.includes(genre) && (
                        <svg
                          className="w-2.5 h-2.5 text-[#0d0b08]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="text-[#a39d96] text-sm">{genre}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Buy Channels */}
            <div>
              <label className="block text-[#e8e0d4] text-sm font-medium mb-2.5">
                Where do you usually buy?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CHANNEL_OPTIONS.map((channel) => (
                  <label
                    key={channel}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#2a2520] hover:border-[#3a352f] cursor-pointer transition-colors has-[:checked]:border-[#d4a54a]/50 has-[:checked]:bg-[#d4a54a]/5"
                  >
                    <input
                      type="checkbox"
                      checked={channels.includes(channel)}
                      onChange={() =>
                        toggleCheckbox(channel, channels, setChannels)
                      }
                      className="sr-only"
                    />
                    <span
                      className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                        channels.includes(channel)
                          ? "bg-[#d4a54a] border-[#d4a54a]"
                          : "border-[#4a4540] bg-transparent"
                      }`}
                    >
                      {channels.includes(channel) && (
                        <svg
                          className="w-2.5 h-2.5 text-[#0d0b08]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="text-[#a39d96] text-sm">{channel}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Referrer */}
            <div>
              <label className="block text-[#e8e0d4] text-sm font-medium mb-1.5">
                How did you hear about us?
              </label>
              <textarea
                value={referrer}
                onChange={(e) => setReferrer(e.target.value)}
                placeholder="Optional"
                rows={2}
                className="w-full px-3.5 py-2.5 bg-[#0d0b08] border border-[#2a2520] rounded-lg text-[#e8e0d4] text-sm placeholder-[#6b6560] outline-none focus:border-[#d4a54a] transition-colors resize-none"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-[#d4a54a] text-[#0d0b08] text-sm font-semibold hover:bg-[#c49a40] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {loading ? "Submitting..." : "Apply now \u2192"}
            </button>
          </form>

          {/* Invite link */}
          <div className="mt-6 pt-5 border-t border-[#2a2520] text-center">
            <p className="text-[#a39d96] text-xs">
              Already have an invite?{" "}
              <Link
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  const url = prompt(
                    "Paste your invite URL (e.g. https://vod-auctions.com/invite/ABC123):"
                  )
                  if (url) {
                    try {
                      const parsed = new URL(url)
                      if (parsed.pathname.startsWith("/invite/")) {
                        window.location.href = parsed.pathname
                      } else {
                        alert("Invalid invite URL format.")
                      }
                    } catch {
                      // Try treating it as just a token
                      if (url.trim().length > 0) {
                        window.location.href = `/invite/${url.trim()}`
                      }
                    }
                  }
                }}
                className="text-[#d4a54a] hover:underline"
              >
                Redeem it here
              </Link>
            </p>
          </div>
        </div>

        {/* Footer text */}
        <p className="text-center text-[#4a4540] text-xs mt-6">
          Curated Music Auctions &mdash; 41,500+ Releases
        </p>
      </div>
    </div>
  )
}
