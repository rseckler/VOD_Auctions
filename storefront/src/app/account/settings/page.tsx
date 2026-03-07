"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/AuthProvider"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { getToken } from "@/lib/auth"

export default function SettingsPage() {
  const { customer } = useAuth()
  const [newsletterOptin, setNewsletterOptin] = useState(false)
  const [newsletterLoading, setNewsletterLoading] = useState(true)
  const [newsletterSaving, setNewsletterSaving] = useState(false)

  const fetchNewsletterStatus = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/newsletter`, {
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
      })
      if (res.ok) {
        const data = await res.json()
        setNewsletterOptin(data.newsletter_optin || false)
      }
    } catch {
      // silently fail
    } finally {
      setNewsletterLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNewsletterStatus()
  }, [fetchNewsletterStatus])

  async function toggleNewsletter() {
    const token = getToken()
    if (!token) return
    setNewsletterSaving(true)
    const newValue = !newsletterOptin
    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/newsletter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newsletter_optin: newValue }),
      })
      if (res.ok) {
        setNewsletterOptin(newValue)
      }
    } catch {
      // silently fail
    } finally {
      setNewsletterSaving(false)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Settings</h2>

      <div className="space-y-6">
        <Card className="p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">
            Profile Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">First Name</Label>
              <p className="text-sm mt-1">
                {customer?.first_name || "—"}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Last Name</Label>
              <p className="text-sm mt-1">
                {customer?.last_name || "—"}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Email</Label>
              <p className="text-sm mt-1">{customer?.email || "—"}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">
            Newsletter
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">VOD Auctions Newsletter</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auction updates, new arrivals, and exclusive offers.
              </p>
            </div>
            <button
              onClick={toggleNewsletter}
              disabled={newsletterLoading || newsletterSaving}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                newsletterOptin ? "bg-primary" : "bg-muted"
              }`}
              role="switch"
              aria-checked={newsletterOptin}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                  newsletterOptin ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          {newsletterOptin && (
            <p className="text-xs text-muted-foreground mt-3">
              You can unsubscribe at any time by toggling this off or via the unsubscribe link in any newsletter email.
            </p>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            Change Password
          </h3>
          <Separator className="my-3" />
          <p className="text-sm text-muted-foreground">
            This feature will be available soon.
          </p>
        </Card>
      </div>
    </div>
  )
}
