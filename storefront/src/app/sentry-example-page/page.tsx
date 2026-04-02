"use client"
import * as Sentry from "@sentry/nextjs"
import { useState } from "react"

export default function SentryExamplePage() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")

  async function triggerError() {
    setStatus("sending")
    try {
      const id = Sentry.captureMessage("VOD Auctions — Sentry integration test", "error")
      Sentry.captureException(new Error("VOD Auctions Sentry Test Error"))
      await Sentry.flush(5000)
      setStatus(id ? "sent" : "error")
    } catch (e) {
      setStatus("error")
    }
  }

  const bg = status === "sent" ? "#22c55e" : status === "error" ? "#ef4444" : "#7c3aed"
  const label =
    status === "sending" ? "Sende…" :
    status === "sent" ? "✓ Gesendet — check Sentry Issues" :
    status === "error" ? "Fehler beim Senden" :
    "Test Event an Sentry senden"

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 520 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Sentry Integration Test</h1>
      <p style={{ color: "#666", marginBottom: 8 }}>
        Sendet ein Test-Event direkt via <code>captureMessage</code> + <code>captureException</code>.
        Nach ~15s in Sentry Issues sichtbar.
      </p>
      <p style={{ color: "#999", fontSize: 12, marginBottom: 24 }}>
        Tunnel: <code>/monitoring</code> → ingest.de.sentry.io
      </p>
      <button
        onClick={triggerError}
        disabled={status === "sending" || status === "sent"}
        style={{
          background: bg, color: "#fff", border: "none", borderRadius: 6,
          padding: "10px 20px", fontSize: 14,
          cursor: (status === "sending" || status === "sent") ? "default" : "pointer",
          transition: "background 0.3s",
        }}
      >
        {label}
      </button>
    </div>
  )
}
