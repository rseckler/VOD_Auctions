"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/components/AuthProvider"
import {
  createList,
  uploadCommunityImage,
  CommunityError,
} from "@/lib/community-mutations"

export default function NewListPage() {
  const { isAuthenticated, loading } = useAuth()
  const router = useRouter()

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [cover, setCover] = useState<string | null>(null)
  const [isPublic, setIsPublic] = useState(true)
  const [coverBusy, setCoverBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setCoverBusy(true)
    setError(null)
    try {
      setCover(await uploadCommunityImage(file))
    } catch (err) {
      setError(
        err instanceof CommunityError ? err.message : "Cover upload failed."
      )
    } finally {
      setCoverBusy(false)
    }
  }

  async function submit() {
    if (busy) return
    if (!title.trim()) {
      setError("Give your list a title.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const list = await createList({
        title: title.trim(),
        description: description.trim() || null,
        cover_image_url: cover,
        is_public: isPublic,
      })
      router.push(`/community/lists/${list.slug || list.id}`)
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
          to create a list.
        </div>
      </div>
    )
  }

  return (
    <div
      className="cm-container-narrow"
      style={{ paddingTop: 32, paddingBottom: 72, maxWidth: 620 }}
    >
      <h1 className="cm-hub-title" style={{ fontSize: 30, marginBottom: 6 }}>
        New list
      </h1>
      <p className="cm-hub-sub" style={{ marginBottom: 24 }}>
        Curate a set of releases. You can add records after creating it.
      </p>

      <div className="cm-cover-field">
        {cover ? (
          <div className="cm-cover-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="Cover" />
            <button
              type="button"
              className="cm-cover-remove"
              onClick={() => setCover(null)}
            >
              Remove cover
            </button>
          </div>
        ) : (
          <label className="cm-cover-upload">
            {coverBusy ? "Uploading…" : "+ Add a cover image (optional)"}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={coverBusy}
              onChange={onCover}
            />
          </label>
        )}
      </div>

      <div className="cm-compose-field">
        <label className="cm-compose-label">Title</label>
        <input
          className="cm-compose-title"
          style={{ marginTop: 0 }}
          placeholder="Essential ZKO tapes, first-pressing hunt…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
        />
      </div>

      <div className="cm-compose-field">
        <label className="cm-compose-label">Description</label>
        <textarea
          className="cm-composer-input"
          style={{ minHeight: 84 }}
          placeholder="What ties this list together…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
        />
      </div>

      <label className="cm-list-visibility">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
        />
        <span>
          <strong>Public list</strong> — visible to the whole community.
          Uncheck to keep it private.
        </span>
      </label>

      <div className="cm-compose-foot">
        {error && <span className="cm-composer-error">{error}</span>}
        <button
          type="button"
          className="cm-btn cm-btn-primary cm-btn-lg"
          onClick={submit}
          disabled={busy}
          style={{ marginLeft: "auto" }}
        >
          {busy ? "Creating…" : "Create list"}
        </button>
      </div>
    </div>
  )
}
