"use client"
// Turbopack doesn't auto-inject sentry.client.config.ts via webpack plugin.
// This client component forces it into the client bundle.
import "../../sentry.client.config"

export function SentryInit() {
  return null
}
