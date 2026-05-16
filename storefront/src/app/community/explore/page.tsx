import type { Metadata } from "next"
import { fetchTags, fetchLists, fetchHubSidebar } from "@/lib/community-api"
import { ExploreBrowser } from "@/components/community/ExploreBrowser"

export const metadata: Metadata = {
  title: "Explore — VOD Community",
  description: "Search the VOD community and discover collectors, lists and tags.",
}

export default async function CommunityExplorePage() {
  const [tags, lists, sidebar] = await Promise.all([
    fetchTags(30),
    fetchLists({ sort: "popular", limit: 8 }),
    fetchHubSidebar(),
  ])
  return (
    <ExploreBrowser
      tags={tags}
      lists={lists}
      members={sidebar.suggested_members}
    />
  )
}
