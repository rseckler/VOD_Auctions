"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/components/AuthProvider"
import { getToken } from "@/lib/auth"
import { medusaAuthFetch } from "@/lib/api"
import { MemberAvatar } from "@/components/community/CommunityUI"
import {
  updateProfile,
  uploadCommunityImage,
  CommunityError,
} from "@/lib/community-mutations"
import type { CommunityProfile, CommunityTier } from "@/lib/community-api"

// First-run profile setup. New members land here to claim a display name,
// handle and a few collector details before they post.
export default function CommunityOnboardingPage() {
  const { isAuthenticated, loading } = useAuth()
  const router = useRouter()

  const [profile, setProfile] = useState<CommunityProfile | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [handle, setHandle] = useState("")
  const [location, setLocation] = useState("")
  const [since, setSince] = useState("")
  const [bio, setBio] = useState("")
  const [avatar, setAvatar] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    const token = getToken()
    if (!token) return
    medusaAuthFetch<{ profile: CommunityProfile }>(
      "/store/community/profile",
      token
    ).then((d) => {
      const p = d?.profile
      if (!p) return
      setProfile(p)
      setDisplayName(p.display_name || "")
      setHandle(p.handle || "")
      setLocation(p.location || "")
      setSince(p.collector_since ? String(p.collector_since) : "")
      setBio(p.bio || "")
      setAvatar(p.avatar_url || null)
    })
  }, [isAuthenticated])

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setAvatarBusy(true)
    setError(null)
    try {
      setAvatar(await uploadCommunityImage(file))
    } catch (err) {
      setError(
        err instanceof CommunityError ? err.message : "Avatar upload failed."
      )
    } finally {
      setAvatarBusy(false)
    }
  }

  async function save() {
    if (busy) return
    if (!displayName.trim()) {
      setError("Pick a display name.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updateProfile({
        display_name: displayName.trim(),
        handle: handle.trim() || undefined,
        location: location.trim() || null,
        collector_since: since ? Number(since) : null,
        bio: bio.trim() || null,
        avatar_url: avatar,
      })
      router.push("/community")
    } catch (e) {
      setError(
        e instanceof CommunityError
          ? e.message
          : "Something went wrong — please try again."
      )
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="cm-container-narrow" style={{ padding: "48px 0" }}>
        Loading…
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="cm-container-narrow" style={{ padding: "48px 0" }}>
        <div className="cm-empty">
          <Link href="/account" className="cm-link-gold">
            Sign in
          </Link>{" "}
          to set up your community profile.
        </div>
      </div>
    )
  }

  const year = new Date().getFullYear()

  return (
    <div
      className="cm-container-narrow"
      style={{ paddingTop: 40, paddingBottom: 80, maxWidth: 620 }}
    >
      <div className="cm-onboard-eyebrow">Welcome to the VOD Community</div>
      <h1 className="cm-hub-title" style={{ fontSize: 32, marginBottom: 8 }}>
        Set up your collector profile
      </h1>
      <p className="cm-hub-sub" style={{ marginBottom: 28 }}>
        This is how the rest of the community will know you. You can change any
        of it later.
      </p>

      <div className="cm-onboard-avatar">
        <MemberAvatar
          name={displayName || "member"}
          tier={(profile?.tier as CommunityTier) || "standard"}
          avatarUrl={avatar}
          size={96}
        />
        <label className="cm-cover-upload" style={{ margin: 0 }}>
          {avatarBusy ? "Uploading…" : avatar ? "Change photo" : "Add a photo"}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={avatarBusy}
            onChange={onAvatar}
          />
        </label>
      </div>

      <div className="cm-compose-field">
        <label className="cm-compose-label">Display name</label>
        <input
          className="cm-compose-title"
          style={{ marginTop: 0 }}
          placeholder="How your name shows up"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={60}
        />
      </div>

      <div className="cm-compose-field">
        <label className="cm-compose-label">Handle</label>
        <input
          className="cm-compose-title"
          style={{ marginTop: 0 }}
          placeholder="your-handle"
          value={handle}
          onChange={(e) =>
            setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
          }
          maxLength={30}
        />
      </div>

      <div style={{ display: "flex", gap: 14 }}>
        <div className="cm-compose-field" style={{ flex: 1 }}>
          <label className="cm-compose-label">Location</label>
          <input
            className="cm-compose-title"
            style={{ marginTop: 0 }}
            placeholder="City, country"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={80}
          />
        </div>
        <div className="cm-compose-field" style={{ width: 150 }}>
          <label className="cm-compose-label">Collecting since</label>
          <input
            className="cm-compose-title"
            style={{ marginTop: 0 }}
            type="number"
            min={1960}
            max={year}
            placeholder={String(year)}
            value={since}
            onChange={(e) => setSince(e.target.value)}
          />
        </div>
      </div>

      <div className="cm-compose-field">
        <label className="cm-compose-label">Short bio</label>
        <textarea
          className="cm-composer-input"
          style={{ minHeight: 84 }}
          placeholder="What you collect, what you're hunting…"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={1000}
        />
      </div>

      <div className="cm-compose-foot">
        {error && <span className="cm-composer-error">{error}</span>}
        <Link
          href="/community"
          className="cm-btn cm-btn-ghost"
          style={{ marginLeft: "auto" }}
        >
          Skip for now
        </Link>
        <button
          type="button"
          className="cm-btn cm-btn-primary cm-btn-lg"
          onClick={save}
          disabled={busy}
        >
          {busy ? "Saving…" : "Enter the community"}
        </button>
      </div>
    </div>
  )
}
