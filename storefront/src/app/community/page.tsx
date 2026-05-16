import type { Metadata } from "next"
import { fetchFeed, fetchTags, fetchHubSidebar } from "@/lib/community-api"
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

// Community Hub — a two-column grid: the dense activity feed on the left
// (editorials mixed inline, set apart by a gold top-line), a discovery
// sidebar (auctions / tags / members / catalog) on the right. Mockup
// screen 01 — Erweiterung 02 density revision.
export default async function CommunityHubPage() {
  const [feedRes, tags, sidebar] = await Promise.all([
    fetchFeed({ limit: 24 }),
    fetchTags(8),
    fetchHubSidebar(),
  ])

  return (
    <div className="cm-container">
      <OnboardingNudge />

      <div className="cm-hub-grid">
        <main>
          <div className="cm-page-eyebrow">
            <span className="cm-page-eyebrow-text">The Feed</span>
            <span className="cm-page-eyebrow-rule" />
            <a
              href="/community/saved"
              className="cm-page-eyebrow-link"
            >
              Saved posts →
            </a>
          </div>
          <HubFeed initialPosts={feedRes.posts} />
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
