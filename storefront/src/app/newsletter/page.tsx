"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const inputClass =
  "h-auto px-3.5 py-2.5 bg-[#0d0b08] border-secondary text-foreground placeholder:text-muted-foreground rounded-lg"

const MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const API_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export default function NewsletterPage() {
  const [email, setEmail] = useState("")
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!email.trim()) errors.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.email = "Please enter a valid email"
    if (!consent) errors.consent = "Please confirm your consent to continue"
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!validate()) return

    setLoading(true)
    try {
      const res = await fetch(`${MEDUSA_URL}/store/newsletter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": API_KEY,
        },
        body: JSON.stringify({ email: email.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(
          data?.message || "Something went wrong. Please try again."
        )
      }

      setSubmittedEmail(email.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

  if (submittedEmail) {
    return (
      <div className="min-h-screen bg-[#0d0b08] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2.5 mb-10">
            <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-lg font-bold text-primary-foreground">
              V
            </div>
            <span className="text-primary text-xl font-semibold tracking-wide">
              VOD Auctions
            </span>
          </div>

          {/* Card */}
          <div className="bg-[#1c1915] rounded-2xl border border-[#2a2520] p-10">
            {/* Mail icon */}
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
              <svg
                className="w-8 h-8 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>

            <h1 className="font-serif text-2xl text-[#e8e0d4] mb-3">
              Check your inbox
            </h1>

            <p className="text-[#a39d96] text-sm leading-relaxed mb-2">
              We sent a confirmation link to
            </p>
            <p className="text-primary text-sm font-mono mb-6 break-all">
              {submittedEmail}
            </p>

            <p className="text-[#a39d96] text-xs leading-relaxed mb-6">
              Click the link in the email to confirm your subscription. The link
              expires in 24 hours.
            </p>

            <div className="border-t border-[#2a2520] pt-5">
              <p className="text-[#6b6560] text-xs leading-relaxed">
                Didn&rsquo;t get it? Check your spam folder, or{" "}
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedEmail(null)
                    setEmail("")
                    setConsent(false)
                  }}
                  className="text-primary hover:underline"
                >
                  try a different email
                </button>
                .
              </p>
            </div>
          </div>

          <Link
            href="/"
            className="inline-block mt-6 text-[#a39d96] text-xs hover:text-[#e8e0d4] transition-colors"
          >
            &larr; Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d0b08] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-lg font-bold text-primary-foreground">
            V
          </div>
          <span className="text-primary text-xl font-semibold tracking-wide">
            VOD Auctions
          </span>
        </div>

        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl sm:text-4xl text-[#e8e0d4] mb-3">
            Stay in the Loop
          </h1>
          <p className="text-[#a39d96] text-sm leading-relaxed max-w-md mx-auto">
            Progress updates as we build. New auction blocks. Curated finds from
            41,500+ industrial releases. No noise.
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-[#1c1915] rounded-2xl border border-[#2a2520] p-6 sm:p-8">
          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <Label htmlFor="newsletter_email" className="text-foreground mb-1.5">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="newsletter_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
                autoComplete="email"
              />
              {fieldErrors.email && (
                <p className="mt-1 text-red-500 text-xs">{fieldErrors.email}</p>
              )}
            </div>

            {/* What you get */}
            <div className="rounded-lg border border-secondary bg-[#0d0b08] px-4 py-3">
              <p className="text-[11px] text-primary uppercase tracking-wider font-semibold mb-2">
                What you&rsquo;ll get
              </p>
              <ul className="text-muted-foreground text-xs space-y-1.5 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-primary">&bull;</span>
                  <span>Build progress &mdash; what&rsquo;s shipping next</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">&bull;</span>
                  <span>New auction blocks (T-7 days before opening)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">&bull;</span>
                  <span>Curated previews of rare lots</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">&bull;</span>
                  <span>Unsubscribe with one click in every email</span>
                </li>
              </ul>
            </div>

            {/* DSGVO Consent */}
            <div>
              <label
                htmlFor="newsletter_consent"
                className={`flex items-start gap-2.5 px-3.5 py-3 rounded-lg border cursor-pointer transition-colors ${
                  consent
                    ? "border-primary/50 bg-primary/5"
                    : "border-secondary hover:border-muted-foreground/30"
                }`}
              >
                <input
                  id="newsletter_consent"
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="sr-only"
                />
                <span
                  className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                    consent
                      ? "bg-primary border-primary"
                      : "border-muted-foreground/40 bg-transparent"
                  }`}
                >
                  {consent && (
                    <svg
                      className="w-2.5 h-2.5 text-primary-foreground"
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
                <span className="text-muted-foreground text-xs leading-relaxed">
                  I agree to receive the VOD Auctions newsletter at the email
                  address above. My data is processed by VOD Records and our
                  email provider Brevo (EU servers). I can unsubscribe any
                  time via the link in every email. See the{" "}
                  <Link
                    href="/datenschutz"
                    target="_blank"
                    className="text-primary hover:underline"
                  >
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              {fieldErrors.consent && (
                <p className="mt-1 text-red-500 text-xs">
                  {fieldErrors.consent}
                </p>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              size="lg"
              className="w-full"
            >
              {loading ? "Sending..." : "Subscribe →"}
            </Button>
          </form>

          {/* Footer note: double opt-in */}
          <div className="mt-5 pt-4 border-t border-[#2a2520]">
            <p className="text-[#6b6560] text-[11px] leading-relaxed text-center">
              You&rsquo;ll receive a confirmation link by email. Your address is
              only added to the list after you click it.
            </p>
          </div>
        </div>

        {/* Footer text */}
        <p className="text-center text-[#4a4540] text-xs mt-6">
          <Link
            href="/apply"
            className="hover:text-[#a39d96] transition-colors"
          >
            Apply for early access
          </Link>
          <span className="mx-2">&middot;</span>
          <Link
            href="/datenschutz"
            className="hover:text-[#a39d96] transition-colors"
          >
            Privacy
          </Link>
          <span className="mx-2">&middot;</span>
          <Link
            href="/impressum"
            className="hover:text-[#a39d96] transition-colors"
          >
            Imprint
          </Link>
        </p>
      </div>
    </div>
  )
}
