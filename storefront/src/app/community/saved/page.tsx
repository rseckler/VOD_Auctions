"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/components/AuthProvider"
import { fetchSavedPosts } from "@/lib/community-mutations"
import type { CommunityPost } from "@/lib/community-api"
import { PostCard, EditorialCard } from "@/components/community/CommunityUI"

export default function CommunitySavedPage() {
  const { isAuthenticated, loading } = useAuth()
  const [posts, setPosts] = useState<CommunityPost[] | null>(null)

  useEffect(() => {
    if (loading || !isAuthenticated) return
    fetchSavedPosts()
      .then(setPosts)
      .catch(() => setPosts([]))
  }, [loading, isAuthenticated])

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
          to see your bookmarks.
        </div>
      </div>
    )
  }

  return (
    <div
      className="cm-container-narrow"
      style={{ paddingTop: 32, paddingBottom: 72 }}
    >
      <h1 className="cm-hub-title" style={{ fontSize: 28, marginBottom: 6 }}>
        Saved posts
      </h1>
      <p className="cm-hub-sub" style={{ marginBottom: 24 }}>
        Posts you bookmarked to read later.
      </p>

      {posts === null ? (
        <div className="cm-empty">Loading…</div>
      ) : posts.length === 0 ? (
        <div className="cm-empty">
          Nothing saved yet — tap “Save” on a post to bookmark it.
        </div>
      ) : (
        <div className="cm-feed">
          {posts.map((p) =>
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
