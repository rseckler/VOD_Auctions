"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"
import Link from "next/link"

const MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export default function VerifyPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!token) {
      setStatus("error")
      setMessage("No verification token provided.")
      return
    }

    async function verify() {
      try {
        const res = await fetch(
          `${MEDUSA_URL}/store/verify?token=${encodeURIComponent(token!)}`,
          {
            headers: { "x-publishable-api-key": PUBLISHABLE_KEY },
          }
        )
        const data = await res.json()
        if (data.success) {
          setStatus("success")
          setMessage("Your email has been verified successfully!")
        } else {
          setStatus("error")
          setMessage(data.message || "This verification link is invalid or has expired.")
        }
      } catch {
        setStatus("error")
        setMessage("Something went wrong. Please try again later.")
      }
    }

    verify()
  }, [token])

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Verifying your email...</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
            </div>
            <h1 className="text-2xl font-serif font-bold text-foreground">
              Email Verified!
            </h1>
            <p className="text-muted-foreground">{message}</p>
            <Link
              href="/account"
              className="inline-block mt-4 px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Go to My Account
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
              <XCircle className="h-10 w-10 text-red-500" />
            </div>
            <h1 className="text-2xl font-serif font-bold text-foreground">
              Verification Failed
            </h1>
            <p className="text-muted-foreground">{message}</p>
            <p className="text-sm text-muted-foreground">
              You can request a new verification email from your{" "}
              <Link href="/account/settings" className="text-primary underline">
                account settings
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
