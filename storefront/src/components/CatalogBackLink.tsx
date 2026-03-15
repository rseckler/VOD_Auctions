"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"

/**
 * Breadcrumb link back to catalog that preserves the user's last filter/page state.
 * Reads the catalog URL from sessionStorage (set by the catalog page on every state change).
 */
export function CatalogBackLink({ className, children }: { className?: string; children?: ReactNode }) {
  const [href, setHref] = useState("/catalog")

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("catalog_url")
      if (saved) setHref(saved)
    } catch {}
  }, [])

  return (
    <Link href={href} className={className}>
      {children || "Catalog"}
    </Link>
  )
}
