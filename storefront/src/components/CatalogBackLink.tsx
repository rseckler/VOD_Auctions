"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"

/**
 * Back link that uses window.history.back() when possible so the browser
 * restores the exact scroll position on the catalog page.
 * Falls back to the stored catalog URL when there is no history entry
 * (e.g. user opened the product page directly via a link).
 */
export function CatalogBackLink({ className, children }: { className?: string; children?: ReactNode }) {
  const [fallbackHref, setFallbackHref] = useState("/catalog")
  const [hasHistory, setHasHistory] = useState(false)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("catalog_url")
      if (saved) setFallbackHref(saved)
    } catch {}
    // history.length > 1 means there is something to go back to
    setHasHistory(window.history.length > 1)
  }, [])

  if (hasHistory) {
    return (
      <button
        onClick={() => window.history.back()}
        className={className}
      >
        {children || "Catalog"}
      </button>
    )
  }

  return (
    <Link href={fallbackHref} className={className}>
      {children || "Catalog"}
    </Link>
  )
}
