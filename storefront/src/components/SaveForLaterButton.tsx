"use client"

import { useState, useEffect } from "react"
import { Heart } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { getToken } from "@/lib/auth"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { toast } from "sonner"
import { rudderTrack } from "@/lib/rudderstack"

type Props = {
  releaseId: string
  /** "icon" = standalone heart icon (top-right), "button" = text button with heart */
  variant?: "icon" | "button"
}

export function SaveForLaterButton({ releaseId, variant = "icon" }: Props) {
  const { isAuthenticated, refreshStatus } = useAuth()
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [savedItemId, setSavedItemId] = useState<string | null>(null)

  // Check if item is already saved on mount
  useEffect(() => {
    if (!isAuthenticated) return

    const token = getToken()
    if (!token) return

    fetch(`${MEDUSA_URL}/store/account/saved`, {
      headers: {
        "x-publishable-api-key": PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
    })
      .then((r) => r.json())
      .then((data) => {
        const found = (data.items || []).find(
          (item: any) => item.release_id === releaseId
        )
        if (found) {
          setSaved(true)
          setSavedItemId(found.id)
        }
      })
      .catch(() => {})
  }, [isAuthenticated, releaseId])

  if (!isAuthenticated) return null

  async function handleToggle() {
    const token = getToken()
    if (!token) return

    setLoading(true)
    try {
      if (saved && savedItemId) {
        // Remove
        const res = await fetch(
          `${MEDUSA_URL}/store/account/saved/${savedItemId}`,
          {
            method: "DELETE",
            headers: {
              "x-publishable-api-key": PUBLISHABLE_KEY,
              Authorization: `Bearer ${token}`,
            },
          }
        )
        if (res.ok) {
          setSaved(false)
          setSavedItemId(null)
          await refreshStatus()
          toast.success("Removed from saved")
        }
      } else {
        // Save
        const res = await fetch(`${MEDUSA_URL}/store/account/saved`, {
          method: "POST",
          headers: {
            "x-publishable-api-key": PUBLISHABLE_KEY,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ release_id: releaseId }),
        })
        const data = await res.json()
        if (res.ok) {
          setSaved(true)
          setSavedItemId(data.item?.id || null)
          await refreshStatus()
          rudderTrack("Item Saved", { release_id: releaseId })
          toast.success("Saved for later!")
        } else if (res.status === 409) {
          setSaved(true)
        } else {
          toast.error(data.message || "Failed to save")
        }
      }
    } catch {
      toast.error("Failed to update saved items")
    } finally {
      setLoading(false)
    }
  }

  if (variant === "button") {
    return (
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`flex items-center gap-1.5 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
          saved
            ? "bg-primary/20 border border-primary/50 text-primary"
            : "bg-primary/8 border border-primary/25 text-primary hover:bg-primary/15"
        }`}
      >
        <Heart
          className={`w-4 h-4 ${saved ? "fill-primary" : ""}`}
        />
        {loading ? "..." : saved ? "Saved" : "Save"}
      </button>
    )
  }

  // Icon variant (default)
  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      title={saved ? "Remove from saved" : "Save for later"}
      className={`w-11 h-11 rounded-[10px] border flex items-center justify-center transition-all flex-shrink-0 ${
        saved
          ? "bg-primary/20 border-primary/50"
          : "bg-primary/8 border-primary/25 hover:bg-primary/15 hover:border-primary/40"
      }`}
    >
      <Heart
        className={`w-[22px] h-[22px] text-primary ${
          saved ? "fill-primary" : ""
        }`}
      />
    </button>
  )
}
