"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useAuth } from "@/components/AuthProvider"
import { getToken } from "@/lib/auth"
import { medusaAuthFetch } from "@/lib/api"
import { updateProfile, CommunityError } from "@/lib/community-mutations"
import type { CommunityProfile } from "@/lib/community-api"

type Form = {
  display_name: string
  handle: string
  bio: string
  location: string
  pronouns: string
  collector_since: string
  avatar_url: string
  header_url: string
  bandcamp: string
  discogs: string
  soundcloud: string
  website: string
}

const EMPTY: Form = {
  display_name: "",
  handle: "",
  bio: "",
  location: "",
  pronouns: "",
  collector_since: "",
  avatar_url: "",
  header_url: "",
  bandcamp: "",
  discogs: "",
  soundcloud: "",
  website: "",
}

export default function CommunitySettingsPage() {
  const { isAuthenticated, loading } = useAuth()
  const [profile, setProfile] = useState<CommunityProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [form, setForm] = useState<Form>(EMPTY)
  const [showAcquired, setShowAcquired] = useState(false)
  const [emailNotif, setEmailNotif] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      setLoadingProfile(false)
      return
    }
    const token = getToken()
    if (!token) {
      setLoadingProfile(false)
      return
    }
    medusaAuthFetch<{ profile: CommunityProfile }>(
      "/store/community/profile",
      token
    )
      .then((d) => {
        if (d?.profile) {
          const p = d.profile
          setProfile(p)
          setForm({
            display_name: p.display_name || "",
            handle: p.handle || "",
            bio: p.bio || "",
            location: p.location || "",
            pronouns: p.pronouns || "",
            collector_since: p.collector_since ? String(p.collector_since) : "",
            avatar_url: p.avatar_url || "",
            header_url: p.header_url || "",
            bandcamp: p.links?.bandcamp || "",
            discogs: p.links?.discogs || "",
            soundcloud: p.links?.soundcloud || "",
            website: p.links?.website || "",
          })
          setShowAcquired(!!p.show_acquired_feed)
          setEmailNotif(p.email_notifications !== false)
        }
      })
      .finally(() => setLoadingProfile(false))
  }, [isAuthenticated])

  function set(key: keyof Form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  async function save() {
    if (busy) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await updateProfile({
        display_name: form.display_name,
        handle: form.handle,
        bio: form.bio || null,
        location: form.location || null,
        pronouns: form.pronouns || null,
        collector_since: form.collector_since
          ? Number(form.collector_since)
          : null,
        avatar_url: form.avatar_url || null,
        header_url: form.header_url || null,
        links: {
          bandcamp: form.bandcamp,
          discogs: form.discogs,
          soundcloud: form.soundcloud,
          website: form.website,
        },
        show_acquired_feed: showAcquired,
        email_notifications: emailNotif,
      })
      setProfile(updated)
      setSaved(true)
    } catch (e) {
      setError(
        e instanceof CommunityError
          ? e.message
          : "Something went wrong — please try again."
      )
    } finally {
      setBusy(false)
    }
  }

  if (loading || loadingProfile) {
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
          to edit your profile.
        </div>
      </div>
    )
  }

  const field = (
    key: keyof Form,
    label: string,
    opts: { placeholder?: string; type?: string } = {}
  ) => (
    <div className="cm-field">
      <label className="cm-field-label">{label}</label>
      <input
        className="cm-input"
        type={opts.type || "text"}
        value={form[key]}
        placeholder={opts.placeholder}
        onChange={(e) => set(key, e.target.value)}
      />
    </div>
  )

  return (
    <div
      className="cm-container-narrow"
      style={{ paddingTop: 32, paddingBottom: 64 }}
    >
      <h1 className="cm-hub-title" style={{ fontSize: 30, marginBottom: 6 }}>
        Edit Profile
      </h1>
      {profile && (
        <p className="cm-hub-sub" style={{ marginBottom: 24 }}>
          <Link
            href={`/community/members/${profile.handle}`}
            className="cm-link-gold"
          >
            → View your public profile
          </Link>
        </p>
      )}

      <div className="cm-form-grid">
        {field("display_name", "Display name")}
        {field("handle", "Handle", { placeholder: "3–30 chars: a–z 0–9 _ -" })}
        <div className="cm-field cm-field-full">
          <label className="cm-field-label">Bio</label>
          <textarea
            className="cm-textarea"
            value={form.bio}
            maxLength={1000}
            placeholder="Tell the community about yourself and your collection…"
            onChange={(e) => set("bio", e.target.value)}
          />
        </div>
        {field("location", "Location")}
        {field("pronouns", "Pronouns")}
        {field("collector_since", "Collecting since (year)", { type: "number" })}
        {field("avatar_url", "Avatar image (URL)")}
        {field("header_url", "Header image (URL)")}
        {field("bandcamp", "Bandcamp")}
        {field("discogs", "Discogs")}
        {field("soundcloud", "SoundCloud")}
        {field("website", "Website")}
      </div>

      <h2 className="cm-settings-section">Privacy &amp; notifications</h2>
      <label className="cm-list-visibility">
        <input
          type="checkbox"
          checked={showAcquired}
          onChange={(e) => {
            setShowAcquired(e.target.checked)
            setSaved(false)
          }}
        />
        <span>
          <strong>Share acquisitions</strong> — automatically post to the
          community when you win an auction or buy a release.
        </span>
      </label>
      <label className="cm-list-visibility">
        <input
          type="checkbox"
          checked={emailNotif}
          onChange={(e) => {
            setEmailNotif(e.target.checked)
            setSaved(false)
          }}
        />
        <span>
          <strong>Email notifications</strong> — get an email for replies,
          mentions and new editorials.
        </span>
      </label>

      <div className="cm-compose-foot">
        {error && <span className="cm-composer-error">{error}</span>}
        {saved && <span className="cm-settings-success">Saved ✓</span>}
        <button
          type="button"
          className="cm-btn cm-btn-primary cm-btn-lg"
          onClick={save}
          disabled={busy}
          style={{ marginLeft: "auto" }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  )
}
