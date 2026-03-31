"use client"

import { useEffect } from "react"

// Microsoft Clarity — session recordings, heatmaps, rage/dead click detection
// Free, no data limits. Script loads only after marketing consent.
// Dashboard: https://clarity.microsoft.com
export function ClarityProvider() {
  useEffect(() => {
    const clarityId = process.env.NEXT_PUBLIC_CLARITY_ID
    if (!clarityId) return

    // Only load after marketing consent
    const consent = localStorage.getItem("cookie-consent")
    if (!consent) return
    try {
      const parsed = JSON.parse(consent)
      if (!parsed.marketing) return
    } catch { return }

    // Prevent double-injection
    if ((window as any).clarity) return

    // Official Clarity snippet (inline init + async script)
    ;(function (c: any, l: any, a: any, r: any, i: any) {
      c[a] = c[a] || function (...args: any[]) { (c[a].q = c[a].q || []).push(args) }
      const t = l.createElement(r)
      t.async = 1
      t.src = "https://www.clarity.ms/tag/" + i
      const y = l.getElementsByTagName(r)[0]
      y.parentNode.insertBefore(t, y)
    })(window, document, "clarity", "script", clarityId)
  }, [])

  return null
}
