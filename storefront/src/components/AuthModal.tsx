"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { useAuth } from "./AuthProvider"
import { requestPasswordReset } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type AuthModalProps = {
  open: boolean
  onClose: () => void
}

type PasswordStrength = "weak" | "medium" | "strong"

function getPasswordStrength(pw: string): PasswordStrength | null {
  if (!pw) return null
  const hasLetters = /[a-zA-Z]/.test(pw)
  const hasNumbers = /[0-9]/.test(pw)
  const hasSpecial = /[^a-zA-Z0-9]/.test(pw)
  if (pw.length >= 8 && hasLetters && hasNumbers && hasSpecial) return "strong"
  if (pw.length >= 8 && hasLetters && hasNumbers) return "medium"
  return "weak"
}

const strengthConfig: Record<PasswordStrength, { label: string; color: string; width: string }> = {
  weak: { label: "Weak", color: "bg-red-500", width: "w-1/3" },
  medium: { label: "Medium", color: "bg-yellow-500", width: "w-2/3" },
  strong: { label: "Strong", color: "bg-green-500", width: "w-full" },
}

const RATE_LIMIT_THRESHOLD = 5
const RATE_LIMIT_COOLDOWN = 30 // seconds

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [newsletterOptin, setNewsletterOptin] = useState(false)
  const [agbAccepted, setAgbAccepted] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  // Rate limiting state
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isLocked = lockedUntil !== null && Date.now() < lockedUntil

  // Countdown timer for rate limiting
  useEffect(() => {
    if (lockedUntil === null) return
    const tick = () => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        setLockedUntil(null)
        setCountdown(0)
        if (countdownRef.current) clearInterval(countdownRef.current)
      } else {
        setCountdown(remaining)
      }
    }
    tick()
    countdownRef.current = setInterval(tick, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [lockedUntil])

  // Reset rate limit state when switching modes
  const handleModeSwitch = useCallback((newMode: "login" | "register" | "forgot") => {
    setMode(newMode)
    setError("")
    setFailedAttempts(0)
    setLockedUntil(null)
  }, [])

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (isLocked) return

    if (mode === "register") {
      if (!agbAccepted) {
        setError("Please accept the Terms & Conditions.")
        return
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.")
        return
      }
    }

    setLoading(true)

    try {
      if (mode === "forgot") {
        await requestPasswordReset(email)
        setResetSent(true)
      } else if (mode === "login") {
        await login(email, password, rememberMe)
        setFailedAttempts(0)
        onClose()
      } else {
        await register(email, password, firstName, lastName, newsletterOptin)
        onClose()
      }
    } catch (err: any) {
      if (mode === "login") {
        const newCount = failedAttempts + 1
        setFailedAttempts(newCount)
        setError("Invalid email or password.")
        if (newCount >= RATE_LIMIT_THRESHOLD) {
          setLockedUntil(Date.now() + RATE_LIMIT_COOLDOWN * 1000)
        }
      } else {
        setError(err.message || "Error")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "login" ? "Login" : mode === "register" ? "Register" : "Reset Password"}
          </DialogTitle>
          <DialogDescription>
            {mode === "login"
              ? "Log in to place bids."
              : mode === "register"
                ? "Create an account to bid."
                : "Enter your email to receive a password reset link."}
          </DialogDescription>
        </DialogHeader>

        {mode === "forgot" && resetSent ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4">
              <p className="text-sm text-green-400">
                If an account exists for <strong>{email}</strong>, you will receive a password reset email shortly. Please check your inbox.
              </p>
            </div>
            <Button
              onClick={() => { handleModeSwitch("login"); setResetSent(false) }}
              className="w-full"
            >
              Back to Login
            </Button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {mode !== "forgot" && (
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "register" && passwordStrength && (
              <div className="space-y-1 pt-1">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${strengthConfig[passwordStrength].color} ${strengthConfig[passwordStrength].width}`}
                  />
                </div>
                <p className={`text-xs ${
                  passwordStrength === "weak" ? "text-red-500" :
                  passwordStrength === "medium" ? "text-yellow-500" :
                  "text-green-500"
                }`}>
                  {strengthConfig[passwordStrength].label}
                </p>
              </div>
            )}
          </div>
          )}

          {mode === "register" && (
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}

          {mode === "login" && (
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="accent-primary"
                />
                <span className="text-xs text-muted-foreground">Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => handleModeSwitch("forgot")}
                className="text-xs text-muted-foreground hover:text-primary hover:underline"
              >
                Forgot password?
              </button>
            </div>
          )}

          {mode === "register" && (
            <>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agbAccepted}
                  onChange={(e) => setAgbAccepted(e.target.checked)}
                  className="mt-1 accent-primary"
                />
                <span className="text-xs text-muted-foreground leading-tight">
                  I have read and accept the <a href="/agb" target="_blank" className="text-primary underline">Terms &amp; Conditions</a> and <a href="/datenschutz" target="_blank" className="text-primary underline">Privacy Policy</a>. *
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newsletterOptin}
                  onChange={(e) => setNewsletterOptin(e.target.checked)}
                  className="mt-0.5 accent-primary"
                />
                <span className="text-xs text-muted-foreground leading-tight">
                  Subscribe to the VOD Auctions newsletter for auction updates, new arrivals, and exclusive offers. You can unsubscribe at any time.
                </span>
              </label>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {mode === "login" && failedAttempts >= RATE_LIMIT_THRESHOLD && isLocked && (
            <p className="text-sm text-yellow-500">
              {failedAttempts} failed attempts. Please wait {countdown}s before trying again.
            </p>
          )}

          <Button type="submit" disabled={loading || isLocked} className="w-full">
            {isLocked
              ? `Locked (${countdown}s)`
              : loading
                ? "Please wait…"
                : mode === "login"
                  ? "Login"
                  : mode === "register"
                    ? "Create Account"
                    : "Send Reset Link"}
          </Button>
        </form>
        )}

        <p className="text-center text-xs text-muted-foreground mt-2">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                onClick={() => handleModeSwitch("register")}
                className="text-primary hover:underline"
              >
                Register
              </button>
            </>
          ) : (
            <>
              Already registered?{" "}
              <button
                onClick={() => { handleModeSwitch("login"); setResetSent(false) }}
                className="text-primary hover:underline"
              >
                Login
              </button>
            </>
          )}
        </p>
      </DialogContent>
    </Dialog>
  )
}
