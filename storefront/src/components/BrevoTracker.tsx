"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { getMarketingConsent } from "./CookieConsent"
import { useAuth } from "./AuthProvider"

declare global {
  interface Window {
    sib?: { equeue: unknown[]; client_key: string }
    sendinblue?: {
      track: (event: string, properties?: Record<string, unknown>) => void
      identify: (email: string, properties?: Record<string, unknown>) => void
      page: (name: string, properties?: Record<string, unknown>) => void
      trackLink: (selector: string, event: string) => void
    }
  }
}

const BREVO_KEY = process.env.NEXT_PUBLIC_BREVO_CLIENT_KEY

export function BrevoTracker() {
  const pathname = usePathname()
  const { customer } = useAuth()
  const scriptLoaded = useRef(false)
  const identified = useRef<string | null>(null)

  // Load Brevo tracker script (marketing consent required)
  useEffect(() => {
    if (!BREVO_KEY) return
    if (!getMarketingConsent()) return
    if (scriptLoaded.current) return

    window.sib = { equeue: [], client_key: BREVO_KEY }
    const sb: Record<string, (...args: unknown[]) => void> = {}
    for (const k of ["track", "identify", "trackLink", "page"]) {
      sb[k] = function (...args: unknown[]) {
        const sib = window.sib as any
        if (sib[k]) {
          sib[k](...args)
        } else {
          const t: Record<string, unknown[]> = {}
          t[k] = args
          sib.equeue.push(t)
        }
      }
    }
    window.sendinblue = sb as typeof window.sendinblue

    const script = document.createElement("script")
    script.type = "text/javascript"
    script.id = "sendinblue-js"
    script.async = true
    script.src = `https://sibautomation.com/sa.js?key=${BREVO_KEY}`
    document.head.appendChild(script)

    scriptLoaded.current = true
  }, [])

  // Identify user when logged in
  useEffect(() => {
    if (!window.sendinblue || !customer?.email) return
    if (identified.current === customer.email) return

    window.sendinblue.identify(customer.email, {
      FIRSTNAME: customer.first_name || "",
      LASTNAME: customer.last_name || "",
      MEDUSA_CUSTOMER_ID: customer.id,
    })
    identified.current = customer.email
  }, [customer])

  // Track page views on route change
  useEffect(() => {
    if (!window.sendinblue) return
    window.sendinblue.page(pathname)
  }, [pathname])

  return null
}
