import type { Metadata } from "next"
import { ComingSoon } from "@/components/community/ComingSoon"

export const metadata: Metadata = { title: "Members — VOD Community" }

export default function CommunityMembersPage() {
  return (
    <ComingSoon
      phase="Rebuild phase R3"
      title="Members"
      blurb="The collector directory — browse members by tier, location and activity. Individual member profiles are already live; the directory lands with the profile rebuild."
    />
  )
}
