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

// ─── Relative time (German) ──────────────────────────────────────────────
export function timeAgo(iso: string | null): string {
  if (!iso) return ""
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (s < 60) return "gerade eben"
  const m = Math.floor(s / 60)
  if (m < 60) return `vor ${m} Minute${m === 1 ? "" : "n"}`
  const h = Math.floor(m / 60)
  if (h < 24) return `vor ${h} Stunde${h === 1 ? "" : "n"}`
  const d = Math.floor(h / 24)
  if (d < 30) return `vor ${d} Tag${d === 1 ? "" : "en"}`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `vor ${mo} Monat${mo === 1 ? "" : "en"}`
  return new Date(iso).toLocaleDateString("de-DE")
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
export function Tag({ name }: { name: string }) {
  return <span className="cm-tag">#{name}</span>
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

// ─── Author byline ────────────────────────────────────────────────────────
function Byline({ author, time }: { author: CommunityAuthor; time: string }) {
  return (
    <div className="cm-post-head">
      <MemberAvatar
        name={author.display_name}
        tier={author.tier}
        avatarUrl={author.avatar_url}
        size={48}
      />
      <div className="cm-post-meta">
        <div className="cm-post-author">
          <span className="cm-post-name">{author.display_name}</span>
          <TierLabel tier={author.tier} />
        </div>
        <div className="cm-post-time">{time}</div>
      </div>
    </div>
  )
}

// ─── Standard post card ───────────────────────────────────────────────────
export function PostCard({ post }: { post: CommunityPost }) {
  return (
    <Link
      href={`/community/post/${post.slug || post.id}`}
      className="cm-post"
      prefetch={false}
    >
      <Byline author={post.author} time={timeAgo(post.published_at || post.created_at)} />
      {post.title && <h3 className="cm-post-title">{post.title}</h3>}
      {post.excerpt && <div className="cm-post-body">{post.excerpt}</div>}
      {post.release && <ReleaseCardInline release={post.release} />}
      {post.tags.length > 0 && (
        <div className="cm-post-tags">
          {post.tags.map((t) => (
            <Tag key={t} name={t} />
          ))}
        </div>
      )}
      <div className="cm-post-actions">
        <span className="cm-react">🔥 {post.reaction_count}</span>
        <span className="cm-react">💬 {post.comment_count}</span>
      </div>
    </Link>
  )
}

// ─── Editorial card (Frank — "From the Vault") ────────────────────────────
export function EditorialCard({
  post,
  variant = "feed",
}: {
  post: CommunityPost
  variant?: "feed" | "hero"
}) {
  return (
    <Link
      href={`/community/post/${post.slug || post.id}`}
      className={"cm-editorial" + (variant === "feed" ? " is-feed" : "")}
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
          · {timeAgo(post.published_at || post.created_at)}
        </span>
      </div>
      <div className="cm-editorial-body">
        <h2 className="cm-editorial-title">{post.title || "Untitled"}</h2>
        {post.excerpt && <p className="cm-editorial-lede">{post.excerpt}</p>}
      </div>
      <div className="cm-editorial-foot">
        <div className="cm-editorial-author">
          <MemberAvatar
            name={post.author.display_name}
            tier={post.author.tier}
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
