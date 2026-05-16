// VOD Community — shared presentational components.
// Ported from the approved Vinyl-Culture mockup (docs/Community/community).
// Server-safe: pure presentational, no client state. Styling: community.css.

import Link from "next/link"
import type {
  CommunityAuthor,
  CommunityPost,
  CommunityTier,
  ReleaseCard,
} from "@/lib/community-api"

// ─── Relative time ───────────────────────────────────────────────────────
export function timeAgo(iso: string | null): string {
  if (!iso) return ""
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (s < 60) return "just now"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`
  return new Date(iso).toLocaleDateString("en-US")
}

// ─── Reading time ──────────────────────────────────────────────────────────
// Rough estimate from the rendered HTML — ~200 words per minute, min 1.
export function readingTime(html: string | null | undefined): number {
  if (!html) return 1
  const words = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

// ─── Avatar ───────────────────────────────────────────────────────────────
function monogramHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % 360
}

export function MemberAvatar({
  name,
  tier,
  avatarUrl,
  size = 48,
}: {
  name: string
  tier: CommunityTier
  avatarUrl?: string | null
  size?: number
}) {
  const isCurator = tier === "curator"
  const initials = name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/(?=[A-Z])|\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("")
  const hue = monogramHue(name || "member")
  const a = isCurator ? "#3a2e16" : `hsl(${(hue % 30) + 25}, 18%, 22%)`
  const b = isCurator ? "#1c1915" : `hsl(${(hue % 30) + 25}, 14%, 14%)`
  const showPin =
    tier === "platinum" || tier === "gold" || tier === "silver" || tier === "curator"
  const pinChar = tier === "platinum" ? "◆" : "★"

  return (
    <span className={`cm-avatar cm-avatar-${size} tier-${tier || "bronze"}`}>
      <span className="cm-avatar-inner">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={name} className="cm-avatar-img" />
        ) : (
          <span
            className={"cm-avatar-mono" + (isCurator ? " is-curator" : "")}
            style={{ "--mono-a": a, "--mono-b": b } as React.CSSProperties}
          >
            {initials}
          </span>
        )}
      </span>
      {showPin && <span className={`cm-avatar-pin ${tier}`}>{pinChar}</span>}
    </span>
  )
}

// ─── Tier label ───────────────────────────────────────────────────────────
export function TierLabel({ tier }: { tier: CommunityTier }) {
  if (tier === "curator") {
    return (
      <span className="cm-tier-label is-curator">
        <span className="star">🎙</span> VOD Curator
      </span>
    )
  }
  if (tier === "bronze" || tier === "standard") {
    return null
  }
  const star = tier === "platinum" ? "◆" : "★"
  return (
    <span className={`cm-tier-label is-${tier}`}>
      <span className="star">{star}</span> {tier[0].toUpperCase() + tier.slice(1)}
    </span>
  )
}

// ─── Tag chip ─────────────────────────────────────────────────────────────
// Tag — plain span, safe inside Link-wrapped cards (no nested anchors).
export function Tag({ name }: { name: string }) {
  return <span className="cm-tag">#{name}</span>
}

// TagLink — clickable variant for contexts that are not already a Link
// (post detail, tag pages, trending strips).
export function TagLink({ name, count }: { name: string; count?: number }) {
  return (
    <Link href={`/community/tag/${encodeURIComponent(name)}`} className="cm-tag" prefetch={false}>
      #{name}
      {count != null && <span className="cm-tag-count">{count}</span>}
    </Link>
  )
}

// ─── Inline release card ──────────────────────────────────────────────────
export function ReleaseCardInline({ release }: { release: ReleaseCard }) {
  return (
    <Link
      href={`/catalog/${release.id}`}
      className="cm-release-inline"
      prefetch={false}
    >
      <div
        className="cm-release-cover is-vinyl"
        style={
          release.cover_image
            ? {
                backgroundImage: `url(${release.cover_image})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      />
      <div className="cm-release-info">
        <div className="cm-release-fmt">Release</div>
        <div className="cm-release-title">{release.title || "Untitled"}</div>
        <div className="cm-release-artist">{release.artist_name || ""}</div>
      </div>
    </Link>
  )
}

// ─── Release reference pill ───────────────────────────────────────────────
// Compact "linked article" indicator inside a post — small cover + title.
// A plain span (no anchor): the whole post card is already a Link.
export function ReleaseRef({ release }: { release: ReleaseCard }) {
  return (
    <span className="cm-release-ref">
      <span
        className="cm-release-ref-cv"
        style={
          release.cover_image
            ? { backgroundImage: `url(${release.cover_image})` }
            : undefined
        }
      />
      <span className="cm-release-ref-title">{release.title || "Untitled"}</span>
      {release.artist_name && (
        <span className="cm-release-ref-artist">· {release.artist_name}</span>
      )}
      <span className="cm-release-ref-arrow">→</span>
    </span>
  )
}

// ─── Author byline ────────────────────────────────────────────────────────
// Dense single-line meta: avatar 36 · name · tier · time.
function Byline({ author, time }: { author: CommunityAuthor; time: string }) {
  return (
    <div className="cm-post-head">
      <MemberAvatar
        name={author.display_name}
        tier={author.tier}
        avatarUrl={author.avatar_url}
        size={36}
      />
      <div className="cm-post-meta">
        <span className="cm-post-name">{author.display_name}</span>
        <TierLabel tier={author.tier} />
        <span className="cm-post-dot">·</span>
        <span className="cm-post-time">{time}</span>
      </div>
    </div>
  )
}

// ─── Standard post card — dense hairline row ──────────────────────────────
export function PostCard({ post }: { post: CommunityPost }) {
  // The right-hand square thumbnail shows the linked release cover, or the
  // post's own uploaded image when there is no release.
  const thumb = post.release?.cover_image || post.cover_image_url
  const longBody = (post.excerpt?.length || 0) > 180
  return (
    <Link
      href={`/community/post/${post.slug || post.id}`}
      className="cm-post"
      prefetch={false}
    >
      <Byline author={post.author} time={timeAgo(post.published_at || post.created_at)} />
      <div className="cm-post-bodyflex">
        <div className="cm-post-bodycol">
          {post.kind === "acquired" && (
            <div className="cm-acquired-tag">✦ Acquired</div>
          )}
          {post.title && <h3 className="cm-post-title">{post.title}</h3>}
          {post.excerpt && (
            <div className="cm-post-body">
              {post.excerpt}
              {longBody && <span className="cm-post-more-link"> … more</span>}
            </div>
          )}
          {post.release && <ReleaseRef release={post.release} />}
        </div>
        {thumb && (
          <span className="cm-post-cover-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb} alt="" />
          </span>
        )}
      </div>
      {post.tags.length > 0 && (
        <div className="cm-post-tags">
          {post.tags.map((t) => (
            <Tag key={t} name={t} />
          ))}
        </div>
      )}
      <div className="cm-post-actions">
        <ReactionSummary
          reactions={post.reactions}
          total={post.reaction_count}
        />
        <span className="cm-react">💬 {post.comment_count}</span>
      </div>
    </Link>
  )
}

// ─── Read-only reaction summary (feed cards) ───────────────────────────────
const REACTION_ORDER = ["🔥", "❤️", "🤘", "👀", "💯", "🙏", "⚡"]

export function ReactionSummary({
  reactions,
  total,
}: {
  reactions?: Record<string, number>
  total: number
}) {
  const present = REACTION_ORDER.filter((e) => (reactions?.[e] || 0) > 0)
  if (present.length === 0) {
    return <span className="cm-react">🔥 {total}</span>
  }
  return (
    <>
      {present.slice(0, 4).map((e) => (
        <span key={e} className="cm-react">
          <span className="emoji">{e}</span> {reactions![e]}
        </span>
      ))}
    </>
  )
}

// ─── Editorial card (Frank — "From the Vault") ────────────────────────────
// In the feed it is a dense row, set apart only by a gold top-line and a
// serif title — same density grid as a member post. The "hero" variant
// (large card) is kept for any standalone featured placement.
export function EditorialCard({
  post,
  variant = "feed",
}: {
  post: CommunityPost
  variant?: "feed" | "hero"
}) {
  const time = timeAgo(post.published_at || post.created_at)

  if (variant === "hero") {
    return (
      <Link
        href={`/community/post/${post.slug || post.id}`}
        className="cm-editorial"
        prefetch={false}
      >
        <div className="cm-editorial-eyebrow">
          <span>From the Vault</span>
          <span
            style={{
              color: "var(--muted-foreground)",
              letterSpacing: "0.06em",
              fontWeight: 500,
            }}
          >
            · {time}
          </span>
        </div>
        {post.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.cover_image_url} alt="" className="cm-editorial-cover" />
        )}
        <div className="cm-editorial-body">
          <h2 className="cm-editorial-title">{post.title || "Untitled"}</h2>
          {post.excerpt && <p className="cm-editorial-lede">{post.excerpt}</p>}
        </div>
        <div className="cm-editorial-foot">
          <div className="cm-editorial-author">
            <MemberAvatar
              name={post.author.display_name}
              tier="curator"
              avatarUrl={post.author.avatar_url}
              size={40}
            />
            <div>
              <div className="cm-editorial-author-name">
                {post.author.display_name}
              </div>
              <div className="cm-editorial-author-role">🎙 VOD Curator</div>
            </div>
          </div>
          <div className="cm-editorial-stats">
            <span>🔥 {post.reaction_count}</span>
            <span>💬 {post.comment_count}</span>
          </div>
        </div>
      </Link>
    )
  }

  // feed — dense editorial row
  return (
    <Link
      href={`/community/post/${post.slug || post.id}`}
      className="cm-post cm-post-editorial"
      prefetch={false}
    >
      <div className="cm-post-head">
        <MemberAvatar
          name={post.author.display_name}
          tier="curator"
          avatarUrl={post.author.avatar_url}
          size={36}
        />
        <div className="cm-post-meta">
          <span className="cm-post-name">{post.author.display_name}</span>
          <TierLabel tier="curator" />
          <span className="cm-post-dot">·</span>
          <span className="cm-post-time">{time}</span>
        </div>
      </div>
      <div className="cm-post-bodyflex">
        <div className="cm-post-bodycol">
          <div className="cm-editorial-eyebrow-d">
            <span>From the Vault</span>
            <span className="num">· {time}</span>
          </div>
          <h2 className="cm-editorial-title-d">{post.title || "Untitled"}</h2>
          {post.excerpt && <p className="cm-editorial-lede-d">{post.excerpt}</p>}
        </div>
        {post.cover_image_url && (
          <span className="cm-post-cover-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.cover_image_url} alt="" />
          </span>
        )}
      </div>
      <div className="cm-post-actions">
        <span className="cm-react is-active">
          <span className="emoji">🔥</span> {post.reaction_count}
        </span>
        <span className="cm-react">💬 {post.comment_count}</span>
      </div>
    </Link>
  )
}
