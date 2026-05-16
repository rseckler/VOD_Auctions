"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/AuthProvider"
import { getToken } from "@/lib/auth"
import { medusaAuthFetch } from "@/lib/api"
import type { CommunityPost } from "@/lib/community-api"
import { PostCard, EditorialCard } from "./CommunityUI"

// Hub feed with a Following / Latest toggle. Logged-in members default to the
// personalised "Following" feed (followed members + editorials); logged-out
// visitors see "Latest" only (server-rendered initialPosts).
export function HubFeed({
  initialPosts,
  heroId,
}: {
  initialPosts: CommunityPost[]
  heroId?: string
}) {
  const { isAuthenticated, loading } = useAuth()
  const [tab, setTab] = useState<"following" | "latest">("latest")
  const [following, setFollowing] = useState<CommunityPost[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!loading && isAuthenticated) setTab("following")
  }, [loading, isAuthenticated])

  useEffect(() => {
    if (tab !== "following" || following !== null) return
    const token = getToken()
    if (!token) return
    setBusy(true)
    medusaAuthFetch<{ posts: CommunityPost[] }>(
      "/store/community/posts?feed=following&limit=24",
      token
    )
      .then((d) => setFollowing(d?.posts ?? []))
      .finally(() => setBusy(false))
  }, [tab, following])

  const source = tab === "following" ? following ?? [] : initialPosts
  const list = source.filter((p) => p.id !== heroId)
  const isLoading = tab === "following" && following === null && busy

  return (
    <div>
      {isAuthenticated && (
        <div className="cm-feed-tabs">
          <button
            type="button"
            className={tab === "following" ? "is-active" : ""}
            onClick={() => setTab("following")}
          >
            Following
          </button>
          <button
            type="button"
            className={tab === "latest" ? "is-active" : ""}
            onClick={() => setTab("latest")}
          >
            Latest
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="cm-empty">Loading…</div>
      ) : list.length === 0 ? (
        <div className="cm-empty">
          {tab === "following" ? (
            <>
              <p style={{ marginBottom: 12 }}>
                Your following feed is quiet. Follow a few collectors to fill it.
              </p>
              <a href="/community/members" className="cm-btn cm-btn-outline">
                Browse members
              </a>
            </>
          ) : (
            <>
              <p style={{ marginBottom: 12 }}>
                No posts yet — be the first to start the conversation.
              </p>
              <a href="/community/compose" className="cm-btn cm-btn-primary">
                Write a post
              </a>
            </>
          )}
        </div>
      ) : (
        <div className="cm-feed">
          {list.map((p) =>
            p.kind === "editorial" ? (
              <EditorialCard key={p.id} post={p} />
            ) : (
              <PostCard key={p.id} post={p} />
            )
          )}
        </div>
      )}
    </div>
  )
}
