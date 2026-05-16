import Link from "next/link"
import { fetchFeed, isCommunityEnabled } from "@/lib/community-api"
import { PostCard, EditorialCard } from "./CommunityUI"

// Community "Wall" for a catalog entity — band, label or press. Shows the
// community posts anchored to it. Rendered on the band/label/press pages,
// flag-gated. Mirrors ReleaseCommunitySection but for non-release entities.
export async function EntityWall({
  type,
  id,
  name,
}: {
  type: "artist" | "label" | "press"
  id: string
  name: string
}) {
  if (!(await isCommunityEnabled())) return null

  const param =
    type === "artist"
      ? { artist_id: id }
      : type === "label"
        ? { label_id: id }
        : { press_id: id }
  const { posts } = await fetchFeed({ ...param, limit: 12 })

  const composeHref = `/community/compose?${type}_id=${encodeURIComponent(id)}`

  return (
    <section className="cm-entity-wall">
      <div className="cm-page-eyebrow" style={{ margin: "0 0 18px" }}>
        <span className="cm-page-eyebrow-text">Community Wall</span>
        <span className="cm-page-eyebrow-rule" />
        <Link href={composeHref} className="cm-page-eyebrow-link" prefetch={false}>
          Write a post →
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="cm-empty">
          No community posts about {name} yet — start the conversation.
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
    </section>
  )
}
