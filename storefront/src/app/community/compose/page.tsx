"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/components/AuthProvider"
import { getToken } from "@/lib/auth"
import { medusaAuthFetch } from "@/lib/api"
import { PostEditor } from "@/components/community/PostEditor"
import { TagInput } from "@/components/community/TagInput"
import { ReleasePicker, type PickedRelease } from "@/components/community/ReleasePicker"
import {
  createPost,
  uploadCommunityImage,
  CommunityError,
} from "@/lib/community-mutations"

export default function CommunityComposePage() {
  const { isAuthenticated, loading } = useAuth()
  const router = useRouter()

  const [isCurator, setIsCurator] = useState(false)
  const [kind, setKind] = useState<"discussion" | "editorial">("discussion")
  const [title, setTitle] = useState("")
  const [html, setHtml] = useState("")
  const [json, setJson] = useState<unknown>(null)
  const [text, setText] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [release, setRelease] = useState<PickedRelease | null>(null)
  const [entityAnchor, setEntityAnchor] = useState<{
    type: "artist" | "label" | "press"
    id: string
  } | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [coverBusy, setCoverBusy] = useState(false)

  async function onCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setCoverBusy(true)
    setError(null)
    try {
      setCoverUrl(await uploadCommunityImage(file))
    } catch (err) {
      setError(
        err instanceof CommunityError ? err.message : "Cover upload failed."
      )
    } finally {
      setCoverBusy(false)
    }
  }

  // Optional anchors — pre-filled when arriving from a release page's
  // "Write a post" link, or from a band/label/press "Community Wall".
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const releaseId = params.get("release_id")
    if (releaseId) setRelease({ id: releaseId, title: null })
    for (const type of ["artist", "label", "press"] as const) {
      const id = params.get(`${type}_id`)
      if (id) {
        setEntityAnchor({ type, id })
        break
      }
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    const token = getToken()
    if (!token) return
    medusaAuthFetch<{ profile: { is_curator: boolean } }>(
      "/store/community/profile",
      token
    ).then((d) => {
      if (d?.profile?.is_curator) setIsCurator(true)
    })
  }, [isAuthenticated])

  async function submit() {
    if (busy) return
    if (!text.trim() && !title.trim()) {
      setError("Title or body required.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const post = await createPost({
        title: title.trim() || undefined,
        body_html: html,
        body_json: json,
        kind: isCurator ? kind : "discussion",
        tags,
        release_id: release?.id || undefined,
        artist_id: entityAnchor?.type === "artist" ? entityAnchor.id : undefined,
        label_id: entityAnchor?.type === "label" ? entityAnchor.id : undefined,
        press_id: entityAnchor?.type === "press" ? entityAnchor.id : undefined,
        cover_image_url: coverUrl || undefined,
      })
      router.push(`/community/post/${post.slug || post.id}`)
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
          to write a post.
        </div>
      </div>
    )
  }

  return (
    <div
      className="cm-container-narrow"
      style={{ paddingTop: 32, paddingBottom: 72 }}
    >
      <h1 className="cm-hub-title" style={{ marginBottom: 24, fontSize: 30 }}>
        New Post
      </h1>

      {entityAnchor && (
        <p className="cm-hub-sub" style={{ marginBottom: 16 }}>
          This post will appear on the {entityAnchor.type} wall.
        </p>
      )}

      {isCurator && (
        <div className="cm-kind-toggle">
          <button
            type="button"
            className={kind === "discussion" ? "is-active" : ""}
            onClick={() => setKind("discussion")}
          >
            Discussion
          </button>
          <button
            type="button"
            className={kind === "editorial" ? "is-active" : ""}
            onClick={() => setKind("editorial")}
          >
            Editorial
          </button>
        </div>
      )}

      <div className="cm-cover-field">
        {coverUrl ? (
          <div className="cm-cover-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt="Cover" />
            <button
              type="button"
              className="cm-cover-remove"
              onClick={() => setCoverUrl(null)}
            >
              Remove cover
            </button>
          </div>
        ) : (
          <label className="cm-cover-upload">
            {coverBusy ? "Uploading…" : "+ Add cover image (optional)"}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={coverBusy}
              onChange={onCoverFile}
            />
          </label>
        )}
      </div>

      <input
        className="cm-compose-title"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
      />

      <PostEditor
        placeholder="Share your thoughts with the community…"
        onChange={(h, j, t) => {
          setHtml(h)
          setJson(j)
          setText(t)
        }}
      />

      <div className="cm-compose-field">
        <label className="cm-compose-label">Link a release</label>
        <ReleasePicker value={release} onChange={setRelease} />
      </div>

      <div className="cm-compose-field">
        <label className="cm-compose-label">Tags</label>
        <TagInput value={tags} onChange={setTags} />
      </div>

      <div className="cm-compose-foot">
        {error && <span className="cm-composer-error">{error}</span>}
        <button
          type="button"
          className="cm-btn cm-btn-primary cm-btn-lg"
          onClick={submit}
          disabled={busy}
          style={{ marginLeft: "auto" }}
        >
          {busy ? "Publishing…" : "Publish"}
        </button>
      </div>
    </div>
  )
}
