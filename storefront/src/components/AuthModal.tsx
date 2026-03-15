"use client"

import { useState } from "react"
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

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [newsletterOptin, setNewsletterOptin] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      if (mode === "forgot") {
        await requestPasswordReset(email)
        setResetSent(true)
      } else if (mode === "login") {
        await login(email, password)
        onClose()
      } else {
        await register(email, password, firstName, lastName, newsletterOptin)
        onClose()
      }
    } catch (err: any) {
      setError(err.message || "Error")
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
              onClick={() => { setMode("login"); setResetSent(false); setError("") }}
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
          </div>
          )}

          {mode === "login" && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => { setMode("forgot"); setError("") }}
                className="text-xs text-muted-foreground hover:text-primary hover:underline"
              >
                Forgot password?
              </button>
            </div>
          )}

          {mode === "register" && (
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
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading
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
                onClick={() => { setMode("register"); setError("") }}
                className="text-primary hover:underline"
              >
                Register
              </button>
            </>
          ) : (
            <>
              Already registered?{" "}
              <button
                onClick={() => { setMode("login"); setError(""); setResetSent(false) }}
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
