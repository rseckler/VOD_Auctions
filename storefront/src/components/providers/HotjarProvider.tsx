"use client"

import { useEffect } from "react"

// ContentSquare (formerly Hotjar) UXA tracking
// Script: https://t.contentsquare.net/uxa/{SITE_ID}.js
export function HotjarProvider() {
  useEffect(() => {
    const siteId = process.env.NEXT_PUBLIC_CS_SITE_ID
    if (!siteId) return

    // Only load after marketing consent
    const consent = localStorage.getItem("cookie-consent")
    if (!consent) return
    try {
      const parsed = JSON.parse(consent)
      if (!parsed.marketing) return
    } catch { return }

    // Prevent double-injection
    if (document.querySelector(`script[data-cs-id="${siteId}"]`)) return

    const script = document.createElement("script")
    script.src = `https://t.contentsquare.net/uxa/${siteId}.js`
    script.async = true
    script.setAttribute("data-cs-id", siteId)
    document.head.appendChild(script)
  }, [])

  return null
}
