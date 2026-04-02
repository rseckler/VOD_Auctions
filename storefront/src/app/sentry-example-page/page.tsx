"use client"
import * as Sentry from "@sentry/nextjs"
import { useState } from "react"

export default function SentryExamplePage() {
  const [sent, setSent] = useState(false)

  function triggerError() {
    try {
      throw new Error("Sentry Test Error — VOD Auctions integration check")
    } catch (e) {
      Sentry.captureException(e)
      setSent(true)
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 480 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Sentry Test</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Klick sendet einen Test-Error an Sentry. Nach ~10s im Sentry Issues-Feed sichtbar.
      </p>
      <button
        onClick={triggerError}
        disabled={sent}
        style={{
          background: sent ? "#22c55e" : "#7c3aed",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "10px 20px",
          fontSize: 14,
          cursor: sent ? "default" : "pointer",
        }}
      >
        {sent ? "✓ Error gesendet — check Sentry Issues" : "Test Error senden"}
      </button>
    </div>
  )
}
