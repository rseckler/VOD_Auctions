"use client"

import { useEffect } from "react"
import { trackViewItem } from "@/lib/analytics"
import { rudderTrack } from "@/lib/rudderstack"

interface CatalogViewTrackerProps {
  itemId: string
  itemName: string
  itemCategory: string
  price?: number
}

export function CatalogViewTracker({ itemId, itemName, itemCategory, price }: CatalogViewTrackerProps) {
  useEffect(() => {
    trackViewItem({ itemId, itemName, itemCategory, price })
    rudderTrack("Product Viewed", { item_id: itemId, name: itemName, category: itemCategory, price })
  }, [itemId, itemName, itemCategory, price])

  return null
}
