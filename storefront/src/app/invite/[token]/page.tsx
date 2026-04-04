"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"

const MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const API_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

type InviteState =
  | { status: "loading" }
  | { status: "valid"; email: string; tokenDisplay: string }
  | { status: "invalid"; reason: string }

export default function InviteTokenPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [invite, setInvite] = useState<InviteState>({ status: "loading" })
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch(`${MEDUSA_URL}/store/invite/${token}`, {
      headers: { "x-publishable-api-key": API_KEY },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) {
          setInvite({
            status: "valid",
            email: data.email || "",
            tokenDisplay: data.token_display || token.slice(0, 8).toUpperCase(),
          })
        } else {
          setInvite({
            status: "invalid",
            reason:
              data.reason ||
              "The link may have expired or already been used.",
          })
        }
      })
      .catch(() => {
        setInvite({
          status: "invalid",
          reason: "Could not verify invite. Please try again later.",
        })
      })
  }, [token])

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!firstName.trim()) errors.firstName = "First name is required"
    if (!lastName.trim()) errors.lastName = "Last name is required"
    if (!password) errors.password = "Password is required"
    else if (password.length < 8)
      errors.password = "Password must be at least 8 characters"
    if (password !== confirmPassword)
      errors.confirmPassword = "Passwords do not match"
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!validate()) return
    if (invite.status !== "valid") return

    setLoading(true)
    try {
      const res = await fetch(`${MEDUSA_URL}/store/invite/${token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": API_KEY,
        },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: invite.email,
          password,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(
          data.message || "Registration failed. Please try again."
        )
      }

      // Store auth token
      if (data.token) {
        localStorage.setItem("medusa_auth_token", data.token)
      }

      // Set invite session cookie
      document.cookie =
        "vod_invite_session=granted; path=/; max-age=31536000; samesite=lax; secure"

      router.push("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0b08] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-lg font-bold text-[#0d0b08]">
            V
          </div>
          <span className="text-primary text-xl font-semibold tracking-wide">
            VOD Auctions
          </span>
        </div>

        {/* Loading State */}
        {invite.status === "loading" && (
          <div className="bg-[#1c1915] rounded-2xl border border-[#2a2520] p-10 text-center">
            <div className="w-8 h-8 mx-auto mb-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-[#a39d96] text-sm">Verifying your invite...</p>
          </div>
        )}

        {/* Invalid State */}
        {invite.status === "invalid" && (
          <div className="bg-[#1c1915] rounded-2xl border border-[#2a2520] p-10 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 border-2 border-red-500/40 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h1 className="font-serif text-2xl text-[#e8e0d4] mb-3">
              This invite link is no longer valid
            </h1>
            <p className="text-[#a39d96] text-sm mb-6">{invite.reason}</p>
            <Link
              href="/apply"
              className="inline-block px-5 py-2.5 rounded-lg bg-primary text-[#0d0b08] text-sm font-semibold hover:bg-[#c49a40] transition-colors"
            >
              Apply for a new invite &rarr;
            </Link>
          </div>
        )}

        {/* Valid State — Registration Form */}
        {invite.status === "valid" && (
          <div className="bg-[#1c1915] rounded-2xl border border-[#2a2520] p-6 sm:p-8">
            <div className="text-center mb-6">
              <h1 className="font-serif text-2xl text-[#e8e0d4] mb-2">
                Welcome
              </h1>
              <p className="text-[#a39d96] text-sm mb-4">
                Your invite is valid. Create your account to get access.
              </p>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30">
                <span className="text-primary text-xs font-mono font-medium">
                  {invite.tokenDisplay}
                </span>
              </div>
            </div>

            {error && (
              <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* First Name */}
              <div>
                <label className="block text-[#e8e0d4] text-sm font-medium mb-1.5">
                  First name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0d0b08] border border-[#2a2520] rounded-lg text-[#e8e0d4] text-sm placeholder-[#6b6560] outline-none focus:border-primary transition-colors"
                />
                {fieldErrors.firstName && (
                  <p className="mt-1 text-red-500 text-xs">
                    {fieldErrors.firstName}
                  </p>
                )}
              </div>

              {/* Last Name */}
              <div>
                <label className="block text-[#e8e0d4] text-sm font-medium mb-1.5">
                  Last name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0d0b08] border border-[#2a2520] rounded-lg text-[#e8e0d4] text-sm placeholder-[#6b6560] outline-none focus:border-primary transition-colors"
                />
                {fieldErrors.lastName && (
                  <p className="mt-1 text-red-500 text-xs">
                    {fieldErrors.lastName}
                  </p>
                )}
              </div>

              {/* Email (pre-filled, read-only) */}
              <div>
                <label className="block text-[#e8e0d4] text-sm font-medium mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={invite.email}
                  readOnly
                  className="w-full px-3.5 py-2.5 bg-[#0d0b08]/50 border border-[#2a2520] rounded-lg text-[#a39d96] text-sm cursor-not-allowed outline-none"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-[#e8e0d4] text-sm font-medium mb-1.5">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3.5 py-2.5 bg-[#0d0b08] border border-[#2a2520] rounded-lg text-[#e8e0d4] text-sm placeholder-[#6b6560] outline-none focus:border-primary transition-colors"
                />
                {fieldErrors.password && (
                  <p className="mt-1 text-red-500 text-xs">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-[#e8e0d4] text-sm font-medium mb-1.5">
                  Confirm password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="w-full px-3.5 py-2.5 bg-[#0d0b08] border border-[#2a2520] rounded-lg text-[#e8e0d4] text-sm placeholder-[#6b6560] outline-none focus:border-primary transition-colors"
                />
                {fieldErrors.confirmPassword && (
                  <p className="mt-1 text-red-500 text-xs">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg bg-primary text-[#0d0b08] text-sm font-semibold hover:bg-[#c49a40] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {loading
                  ? "Creating account..."
                  : "Create Account & Get Access \u2192"}
              </button>
            </form>

            <p className="mt-4 text-center text-[#6b6560] text-xs leading-relaxed">
              By creating an account, you agree to our{" "}
              <Link href="/agb" className="text-[#a39d96] hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/datenschutz"
                className="text-[#a39d96] hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        )}

        {/* Footer text */}
        <p className="text-center text-[#4a4540] text-xs mt-6">
          Curated Music Auctions &mdash; 41,500+ Releases
        </p>
      </div>
    </div>
  )
}
