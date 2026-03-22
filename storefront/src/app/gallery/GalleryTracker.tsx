"use client"

import { useEffect } from "react"
import { trackGalleryView } from "@/lib/analytics"
import { brevoGalleryViewed } from "@/lib/brevo-tracking"

export function GalleryTracker() {
  useEffect(() => {
    trackGalleryView()
    brevoGalleryViewed()
  }, [])

  return null
}
