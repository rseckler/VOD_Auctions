import type { Metadata } from "next"
import { ComingSoon } from "@/components/community/ComingSoon"

export const metadata: Metadata = { title: "Lists — VOD Community" }

export default function CommunityListsPage() {
  return (
    <ComingSoon
      phase="Rebuild phase R5"
      title="Lists"
      blurb="Curated collections — essential ZKO tapes, first-pressing hunts, a collector's first industrial year. Member-built, public and followable."
    />
  )
}
