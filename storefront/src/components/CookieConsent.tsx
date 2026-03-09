"use client"

import { useState, useEffect } from "react"

const CONSENT_KEY = "vod-cookie-consent"

interface CookiePreferences {
  analytics: boolean
  marketing: boolean
}

export function getAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false
  try {
    const stored = localStorage.getItem(CONSENT_KEY)
    if (!stored) return false
    // Support legacy format ("accepted"/"rejected")
    if (stored === "accepted") return true
    if (stored === "rejected") return false
    const prefs = JSON.parse(stored) as CookiePreferences
    return prefs.analytics === true
  } catch {
    return false
  }
}

export function getMarketingConsent(): boolean {
  if (typeof window === "undefined") return false
  try {
    const stored = localStorage.getItem(CONSENT_KEY)
    if (!stored || stored === "accepted" || stored === "rejected") return false
    const prefs = JSON.parse(stored) as CookiePreferences
    return prefs.marketing === true
  } catch {
    return false
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY)
    if (!consent) {
      setVisible(true)
    }
  }, [])

  function savePreferences(prefs: CookiePreferences) {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(prefs))
    setVisible(false)
    if (prefs.analytics || prefs.marketing) {
      window.location.reload()
    }
  }

  function handleAcceptAll() {
    savePreferences({ analytics: true, marketing: true })
  }

  function handleRejectAll() {
    savePreferences({ analytics: false, marketing: false })
  }

  function handleSaveCustom() {
    savePreferences({ analytics, marketing })
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4">
      <div className="mx-auto max-w-2xl rounded-lg border border-[rgba(232,224,212,0.15)] bg-background/95 backdrop-blur-sm p-4 shadow-lg">
        <p className="text-sm text-muted-foreground mb-3">
          We use cookies for essential site functionality (login, sessions).
          We also offer optional analytics and marketing cookies.{" "}
          <a href="/cookies" className="text-primary hover:underline">
            Learn more
          </a>
        </p>

        {showDetails && (
          <div className="mb-3 space-y-2 border-t border-[rgba(232,224,212,0.1)] pt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked
                disabled
                className="accent-primary opacity-50"
              />
              <span className="text-sm text-muted-foreground">
                <strong className="text-foreground">Essential</strong> — Required for site functionality
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="accent-primary"
              />
              <span className="text-sm text-muted-foreground">
                <strong className="text-foreground">Analytics</strong> — Google Analytics (anonymous usage data)
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                className="accent-primary"
              />
              <span className="text-sm text-muted-foreground">
                <strong className="text-foreground">Marketing</strong> — Behavior tracking and personalized recommendations (Brevo)
              </span>
            </label>
          </div>
        )}

        <div className="flex gap-3 justify-end items-center">
          {!showDetails ? (
            <>
              <button
                onClick={() => setShowDetails(true)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Customize
              </button>
              <button
                onClick={handleRejectAll}
                className="px-4 py-2 text-sm rounded-md border border-[rgba(232,224,212,0.15)] text-muted-foreground hover:text-foreground transition-colors"
              >
                Reject All
              </button>
              <button
                onClick={handleAcceptAll}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Accept All
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleRejectAll}
                className="px-4 py-2 text-sm rounded-md border border-[rgba(232,224,212,0.15)] text-muted-foreground hover:text-foreground transition-colors"
              >
                Reject All
              </button>
              <button
                onClick={handleSaveCustom}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Save Preferences
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
