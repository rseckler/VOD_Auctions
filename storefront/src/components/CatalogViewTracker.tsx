"use client"

import { useEffect } from "react"
import { trackViewItem } from "@/lib/analytics"

interface CatalogViewTrackerProps {
  itemId: string
  itemName: string
  itemCategory: string
  price?: number
}

export function CatalogViewTracker({ itemId, itemName, itemCategory, price }: CatalogViewTrackerProps) {
  useEffect(() => {
    trackViewItem({ itemId, itemName, itemCategory, price })
  }, [itemId, itemName, itemCategory, price])

  return null
}
