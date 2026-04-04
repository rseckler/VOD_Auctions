"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { resetPassword } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { KeyRound, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

export default function ResetPasswordPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  // Auto-redirect after successful reset
  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => {
      toast.success("Password reset. Please log in with your new password.")
      router.push("/")
    }, 3000)
    return () => clearTimeout(timer)
  }, [success, router])

  if (!token) {
    return (
      <div className="max-w-md mx-auto py-20 px-4 text-center">
        <KeyRound className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Invalid Reset Link</h1>
        <p className="text-muted-foreground mb-4">
          This password reset link is invalid or has expired. Please request a new one.
        </p>
        <Button variant="outline" asChild>
          <Link href="/">Go to Homepage</Link>
        </Button>
      </div>
    )
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto py-20 px-4 text-center">
        <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-6 w-6 text-green-500" />
        </div>
        <h1 className="text-xl font-semibold mb-2">Password Reset Successful</h1>
        <p className="text-muted-foreground mb-4">
          Your password has been updated. Redirecting to homepage in a few seconds...
        </p>
        <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <Link href="/">Go to Homepage</Link>
        </Button>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    try {
      await resetPassword(token!, password)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || "Password reset failed. The link may have expired.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto py-20 px-4">
      <Card className="p-6">
        <div className="text-center mb-6">
          <KeyRound className="h-10 w-10 text-primary mx-auto mb-3" />
          <h1 className="text-xl font-semibold">Choose a new password</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your new password below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>

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

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </Button>
        </form>
      </Card>
    </div>
  )
}
