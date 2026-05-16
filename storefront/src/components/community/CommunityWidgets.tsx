// VOD Community — Hub sidebar widgets.
// Server-safe presentational components for the right rail of the hub:
// active auction blocks, trending tags, suggested members, catalog picks.
// Styling: community.css (ported Vinyl-Culture mockup).

import Link from "next/link"
import type {
  HubBlock,
  SuggestedMember,
  TrendingTag,
  ReleaseCard,
} from "@/lib/community-api"
import { MemberAvatar, TierLabel, TagLink, ReleaseCardInline } from "./CommunityUI"
import { FollowButton } from "./FollowButton"

// ─── Relative "ends in …" label for a future timestamp ─────────────────────
function endsLabel(iso: string | null): string {
  if (!iso) return "soon"
  const ms = new Date(iso).getTime() - Date.now()
  if (Number.isNaN(ms)) return "soon"
  if (ms <= 0) return "now"
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `in ${Math.max(1, Math.floor(ms / 60_000))} min`
  if (h < 24) return `in ${h}h`
  const d = Math.floor(h / 24)
  return `in ${d} day${d === 1 ? "" : "s"}`
}

function WidgetHead({ title, href }: { title: string; href?: string }) {
  return (
    <div className="cm-widget-head">
      <div className="cm-widget-title">{title}</div>
      {href && (
        <Link href={href} className="cm-widget-link" prefetch={false}>
          All →
        </Link>
      )}
    </div>
  )
}

// ─── Active auction blocks ──────────────────────────────────────────────────
export function ActiveBlocksWidget({ blocks }: { blocks: HubBlock[] }) {
  if (blocks.length === 0) return null
  return (
    <div className="cm-widget">
      <WidgetHead title="Active in Auctions" href="/auctions" />
      {blocks.map((b) => (
        <Link
          key={b.id}
          href={b.slug ? `/auctions/${b.slug}` : "/auctions"}
          className="cm-block-mini"
          prefetch={false}
        >
          <div className="cm-block-mini-tag">
            <span className="dot" />
            {b.status === "active" ? "Live" : "Upcoming"} · ends {endsLabel(b.end_time)}
          </div>
          <div className="cm-block-mini-title">{b.title || "Auction block"}</div>
          <div className="cm-block-mini-foot">
            <span>{b.lots} Lots</span>
            {b.from_price != null && (
              <span className="price">From €{Math.round(b.from_price)}</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

// ─── Trending tags ──────────────────────────────────────────────────────────
export function TrendingTagsWidget({ tags }: { tags: TrendingTag[] }) {
  if (tags.length === 0) return null
  return (
    <div className="cm-widget">
      <WidgetHead title="Trending Tags" href="/community/explore" />
      <div className="cm-post-tags" style={{ marginTop: 0 }}>
        {tags.map((t) => (
          <TagLink key={t.tag} name={t.tag} count={t.count} />
        ))}
      </div>
    </div>
  )
}

// ─── Suggested members ──────────────────────────────────────────────────────
export function SuggestedMembersWidget({
  members,
}: {
  members: SuggestedMember[]
}) {
  if (members.length === 0) return null
  return (
    <div className="cm-widget">
      <WidgetHead title="Suggested Members" href="/community/members" />
      <div className="cm-suggested">
        {members.map((m) => (
          <div key={m.handle} className="cm-suggested-row">
            <Link href={`/community/members/${m.handle}`} prefetch={false}>
              <MemberAvatar
                name={m.display_name}
                tier={m.tier}
                avatarUrl={m.avatar_url}
                size={40}
              />
            </Link>
            <div className="cm-suggested-meta">
              <Link
                href={`/community/members/${m.handle}`}
                className="cm-suggested-name"
                prefetch={false}
              >
                {m.display_name}
              </Link>
              <div className="cm-suggested-sub">
                <TierLabel tier={m.tier} />
                {m.location && (
                  <>
                    <span style={{ opacity: 0.5 }}>·</span>
                    <span>{m.location}</span>
                  </>
                )}
              </div>
            </div>
            <FollowButton handle={m.handle} initialFollowing={false} small />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── From the catalog ───────────────────────────────────────────────────────
export function FromCatalogWidget({ items }: { items: ReleaseCard[] }) {
  if (items.length === 0) return null
  return (
    <div className="cm-widget">
      <WidgetHead title="From the Catalog" href="/catalog" />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((r) => (
          <ReleaseCardInline key={r.id} release={r} />
        ))}
      </div>
    </div>
  )
}
