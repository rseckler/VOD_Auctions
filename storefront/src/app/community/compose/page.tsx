"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/components/AuthProvider"
import { getToken } from "@/lib/auth"
import { medusaAuthFetch } from "@/lib/api"
import { PostEditor } from "@/components/community/PostEditor"
import { createPost, CommunityError } from "@/lib/community-mutations"

export default function CommunityComposePage() {
  const { isAuthenticated, loading } = useAuth()
  const router = useRouter()

  const [isCurator, setIsCurator] = useState(false)
  const [kind, setKind] = useState<"discussion" | "editorial">("discussion")
  const [title, setTitle] = useState("")
  const [html, setHtml] = useState("")
  const [json, setJson] = useState<unknown>(null)
  const [text, setText] = useState("")
  const [tags, setTags] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [releaseId, setReleaseId] = useState<string | null>(null)

  // Optional release anchor — set when arriving from a release page's
  // "Beitrag schreiben" link (/community/compose?release_id=…).
  useEffect(() => {
    setReleaseId(
      new URLSearchParams(window.location.search).get("release_id")
    )
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
      setError("Titel oder Text erforderlich.")
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
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        release_id: releaseId || undefined,
      })
      router.push(`/community/post/${post.slug || post.id}`)
    } catch (e) {
      setError(e instanceof CommunityError ? e.message : "Fehler — erneut versuchen.")
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="cm-container-narrow" style={{ padding: "48px 0" }}>
        Lädt…
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="cm-container-narrow" style={{ padding: "48px 0" }}>
        <div className="cm-empty">
          <Link href="/account" className="cm-link-gold">
            Melde dich an
          </Link>{" "}
          um einen Beitrag zu schreiben.
        </div>
      </div>
    )
  }

  return (
    <div
      className="cm-container-narrow"
      style={{ paddingTop: 32, paddingBottom: 64 }}
    >
      <h1 className="cm-hub-title" style={{ marginBottom: 20, fontSize: 30 }}>
        Neuer Beitrag
      </h1>

      {releaseId && (
        <p className="cm-hub-sub" style={{ marginBottom: 16 }}>
          Dieser Beitrag wird mit dem ausgewählten Release verknüpft.
        </p>
      )}

      {isCurator && (
        <div className="cm-kind-toggle">
          <button
            type="button"
            className={kind === "discussion" ? "is-active" : ""}
            onClick={() => setKind("discussion")}
          >
            Diskussion
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

      <input
        className="cm-compose-title"
        placeholder="Titel (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
      />

      <PostEditor
        placeholder="Teile deine Gedanken mit der Community…"
        onChange={(h, j, t) => {
          setHtml(h)
          setJson(j)
          setText(t)
        }}
      />

      <input
        className="cm-compose-tags"
        placeholder="Tags, kommagetrennt (optional)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />

      <div className="cm-compose-foot">
        {error && <span className="cm-composer-error">{error}</span>}
        <button
          type="button"
          className="cm-btn cm-btn-primary cm-btn-lg"
          onClick={submit}
          disabled={busy}
          style={{ marginLeft: "auto" }}
        >
          {busy ? "Veröffentlichen…" : "Veröffentlichen"}
        </button>
      </div>
    </div>
  )
}
