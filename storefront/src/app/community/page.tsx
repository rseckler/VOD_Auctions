import type { Metadata } from "next"
import Link from "next/link"
import { fetchFeed } from "@/lib/community-api"
import { PostCard, EditorialCard } from "@/components/community/CommunityUI"

export const metadata: Metadata = {
  title: "Community — VOD Auctions",
  description:
    "Where collectors of industrial, power-electronics and tape-underground music talk.",
}

// Hub feed — newest published posts, the latest editorial pinned as hero.
export default async function CommunityHubPage() {
  const [editorialRes, feedRes] = await Promise.all([
    fetchFeed({ kind: "editorial", limit: 1 }),
    fetchFeed({ limit: 24 }),
  ])

  const hero = editorialRes.posts[0] ?? null
  const feed = feedRes.posts.filter((p) => !hero || p.id !== hero.id)
  const isEmpty = !hero && feed.length === 0

  return (
    <div
      className="cm-container-narrow"
      style={{ paddingTop: 32, paddingBottom: 64 }}
    >
      <header className="cm-hub-head">
        <h1 className="cm-hub-title">Community</h1>
        <p className="cm-hub-sub">
          Where the industrial collector world talks.
        </p>
        <div className="cm-hub-actions" style={{ display: "flex", gap: 8 }}>
          <Link href="/community/compose" className="cm-btn cm-btn-primary">
            New Post
          </Link>
          <Link href="/community/settings" className="cm-btn cm-btn-outline">
            My Profile
          </Link>
        </div>
      </header>

      {hero && (
        <div style={{ marginBottom: 28 }}>
          <EditorialCard post={hero} variant="hero" />
        </div>
      )}

      {isEmpty ? (
        <div className="cm-empty">
          No posts yet — the community is just getting started.
        </div>
      ) : (
        <div className="cm-feed">
          {feed.map((p) =>
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
