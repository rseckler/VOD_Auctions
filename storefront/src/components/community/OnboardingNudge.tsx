"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/components/AuthProvider"
import { getToken } from "@/lib/auth"
import { medusaAuthFetch } from "@/lib/api"

// Hub prompt for members whose community profile is still unconfigured
// (no bio). Dismissible — the choice is remembered per device.
export function OnboardingNudge() {
  const { isAuthenticated, loading } = useAuth()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (loading || !isAuthenticated) return
    if (
      typeof window !== "undefined" &&
      localStorage.getItem("cm_onboard_dismissed")
    )
      return
    const token = getToken()
    if (!token) return
    medusaAuthFetch<{ profile: { bio: string | null } }>(
      "/store/community/profile",
      token
    ).then((d) => {
      if (d?.profile && !d.profile.bio) setShow(true)
    })
  }, [loading, isAuthenticated])

  if (!show) return null

  return (
    <div className="cm-onboard-nudge">
      <div className="cm-onboard-nudge-text">
        <strong>Finish your profile</strong>
        <span>
          Add a photo and a short bio so other collectors know who you are.
        </span>
      </div>
      <div className="cm-onboard-nudge-actions">
        <Link
          href="/community/onboarding"
          className="cm-btn cm-btn-primary cm-btn-sm"
          prefetch={false}
        >
          Set up profile
        </Link>
        <button
          type="button"
          className="cm-btn cm-btn-ghost cm-btn-sm"
          onClick={() => {
            localStorage.setItem("cm_onboard_dismissed", "1")
            setShow(false)
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
