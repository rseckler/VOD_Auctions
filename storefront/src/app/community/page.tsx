import type { Metadata } from "next"
import Link from "next/link"
import { fetchFeed, fetchTags } from "@/lib/community-api"
import { EditorialCard, TagLink } from "@/components/community/CommunityUI"
import { HubFeed } from "@/components/community/HubFeed"

export const metadata: Metadata = {
  title: "Community — VOD Auctions",
  description:
    "Where collectors of industrial, power-electronics and tape-underground music talk.",
}

// Hub — latest editorial pinned as hero, then the feed (Following / Latest).
export default async function CommunityHubPage() {
  const [editorialRes, feedRes, tags] = await Promise.all([
    fetchFeed({ kind: "editorial", limit: 1 }),
    fetchFeed({ limit: 24 }),
    fetchTags(12),
  ])
  const hero = editorialRes.posts[0] ?? null

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
          <Link href="/community/notifications" className="cm-btn cm-btn-ghost">
            Notifications
          </Link>
        </div>
      </header>

      {tags.length > 0 && (
        <div className="cm-post-tags" style={{ marginBottom: 20 }}>
          {tags.map((t) => (
            <TagLink key={t.tag} name={t.tag} count={t.count} />
          ))}
        </div>
      )}

      {hero && (
        <div style={{ marginBottom: 28 }}>
          <EditorialCard post={hero} variant="hero" />
        </div>
      )}

      <HubFeed initialPosts={feedRes.posts} heroId={hero?.id} />
    </div>
  )
}
