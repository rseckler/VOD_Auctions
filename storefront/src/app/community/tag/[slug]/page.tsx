import type { Metadata } from "next"
import { fetchFeed, fetchTags } from "@/lib/community-api"
import {
  PostCard,
  EditorialCard,
  TagLink,
} from "@/components/community/CommunityUI"

type Params = { slug: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  return { title: `#${decodeURIComponent(slug)} — VOD Community` }
}

export default async function CommunityTagPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const tag = decodeURIComponent(slug).toLowerCase()

  const [feed, tags] = await Promise.all([
    fetchFeed({ tag, limit: 30 }),
    fetchTags(20),
  ])

  return (
    <div
      className="cm-container-narrow"
      style={{ paddingTop: 32, paddingBottom: 64 }}
    >
      <header className="cm-hub-head">
        <h1 className="cm-hub-title">#{tag}</h1>
        <p className="cm-hub-sub">
          {feed.count} {feed.count === 1 ? "post" : "posts"}
        </p>
      </header>

      {feed.posts.length === 0 ? (
        <div className="cm-empty">No posts tagged #{tag} yet.</div>
      ) : (
        <div className="cm-feed">
          {feed.posts.map((p) =>
            p.kind === "editorial" ? (
              <EditorialCard key={p.id} post={p} />
            ) : (
              <PostCard key={p.id} post={p} />
            )
          )}
        </div>
      )}

      {tags.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <div className="cm-section-title" style={{ fontSize: 18 }}>
            Popular tags
          </div>
          <div className="cm-post-tags">
            {tags.map((t) => (
              <TagLink key={t.tag} name={t.tag} count={t.count} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
