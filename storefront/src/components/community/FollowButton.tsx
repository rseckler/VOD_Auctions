"use client"

import { useState } from "react"
import { toggleFollow, CommunityError } from "@/lib/community-mutations"

// Follow / unfollow toggle for a member. Optimistic, with sign-in prompt.
export function FollowButton({
  handle,
  initialFollowing,
  small = false,
}: {
  handle: string
  initialFollowing: boolean
  small?: boolean
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onClick() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await toggleFollow(handle)
      setFollowing(r.following)
    } catch (e) {
      setError(e instanceof CommunityError ? e.message : "Could not update.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={
          "cm-btn " +
          (following ? "cm-btn-outline" : "cm-btn-primary") +
          (small ? " cm-btn-sm" : "")
        }
        onClick={onClick}
        disabled={busy}
      >
        {busy ? "…" : following ? "Following" : "Follow"}
      </button>
      {error && (
        <span className="cm-composer-error" style={{ marginLeft: 8 }}>
          {error}
        </span>
      )}
    </>
  )
}
