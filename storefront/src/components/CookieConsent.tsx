"use client"

import { useState, useEffect } from "react"

const CONSENT_KEY = "vod-cookie-consent"

type ConsentValue = "accepted" | "rejected"

export function getAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false
  return localStorage.getItem(CONSENT_KEY) === "accepted"
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY)
    if (!consent) {
      setVisible(true)
    }
  }, [])

  function handleConsent(value: ConsentValue) {
    localStorage.setItem(CONSENT_KEY, value)
    setVisible(false)
    if (value === "accepted") {
      // Reload to trigger GA loading
      window.location.reload()
    }
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4">
      <div className="mx-auto max-w-2xl rounded-lg border border-[rgba(232,224,212,0.15)] bg-background/95 backdrop-blur-sm p-4 shadow-lg">
        <p className="text-sm text-muted-foreground mb-3">
          We use cookies for essential site functionality (login, sessions). We also use Google
          Analytics to understand how visitors use our site.{" "}
          <a href="/cookies" className="text-primary hover:underline">
            Learn more
          </a>
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => handleConsent("rejected")}
            className="px-4 py-2 text-sm rounded-md border border-[rgba(232,224,212,0.15)] text-muted-foreground hover:text-foreground transition-colors"
          >
            Reject Analytics
          </button>
          <button
            onClick={() => handleConsent("accepted")}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  )
}
