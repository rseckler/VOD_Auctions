"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/AuthProvider"
import { fetchNotifications } from "@/lib/community-mutations"

// Unread-notification indicator for the "Community" nav entry. Renders a
// small gold dot when the signed-in member has unread notifications.
// Tailwind-styled (community.css is not loaded outside /community).
export function CommunityNavDot() {
  const { isAuthenticated } = useAuth()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!isAuthenticated) {
      setUnread(0)
      return
    }
    let cancelled = false
    fetchNotifications()
      .then((d) => {
        if (!cancelled) setUnread(d.unread || 0)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  if (unread <= 0) return null
  return (
    <span
      className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-primary align-middle"
      title={`${unread} unread notification${unread === 1 ? "" : "s"}`}
      aria-label={`${unread} unread notifications`}
    />
  )
}
