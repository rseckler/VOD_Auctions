import type { Metadata } from "next"
import { ComingSoon } from "@/components/community/ComingSoon"

export const metadata: Metadata = { title: "Explore — VOD Community" }

export default function CommunityExplorePage() {
  return (
    <ComingSoon
      phase="Rebuild phase R7"
      title="Explore"
      blurb="A tag browser, trending discussions and full-text search across the community. Arriving with the search-and-discovery release."
    />
  )
}
