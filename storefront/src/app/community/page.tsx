import type { Metadata } from "next"
import { fetchFeed, fetchTags, fetchHubSidebar } from "@/lib/community-api"
import { EditorialCard } from "@/components/community/CommunityUI"
import { HubFeed } from "@/components/community/HubFeed"
import { OnboardingNudge } from "@/components/community/OnboardingNudge"
import {
  ActiveBlocksWidget,
  TrendingTagsWidget,
  SuggestedMembersWidget,
  FromCatalogWidget,
} from "@/components/community/CommunityWidgets"

export const metadata: Metadata = {
  title: "Community — VOD Auctions",
  description:
    "Where collectors of industrial, power-electronics and tape-underground music talk.",
}

// Community Hub — editorial hero, then a two-column grid: the activity feed
// on the left, a discovery sidebar (auctions / tags / members / catalog) on
// the right. Mockup screen 01.
export default async function CommunityHubPage() {
  const [editorialRes, feedRes, tags, sidebar] = await Promise.all([
    fetchFeed({ kind: "editorial", limit: 1 }),
    fetchFeed({ limit: 24 }),
    fetchTags(8),
    fetchHubSidebar(),
  ])
  const hero = editorialRes.posts[0] ?? null

  return (
    <div className="cm-container">
      <OnboardingNudge />

      {hero && (
        <div style={{ padding: "32px 0 8px" }}>
          <EditorialCard post={hero} variant="hero" />
        </div>
      )}

      <div className="cm-hub-grid">
        <main>
          <div className="cm-page-eyebrow">
            <span className="cm-page-eyebrow-text">The Feed</span>
            <span className="cm-page-eyebrow-rule" />
          </div>
          <HubFeed initialPosts={feedRes.posts} heroId={hero?.id} />
        </main>

        <aside className="cm-sidebar">
          <ActiveBlocksWidget blocks={sidebar.active_blocks} />
          <TrendingTagsWidget tags={tags} />
          <SuggestedMembersWidget members={sidebar.suggested_members} />
          <FromCatalogWidget items={sidebar.catalog_picks} />
        </aside>
      </div>
    </div>
  )
}
