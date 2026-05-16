import type { Metadata } from "next"
import { fetchMembers } from "@/lib/community-api"
import { MembersBrowser } from "@/components/community/MembersBrowser"

export const metadata: Metadata = {
  title: "Members — VOD Community",
  description:
    "The collector directory — industrial, power-electronics and tape-underground.",
}

export default async function CommunityMembersPage() {
  const initial = await fetchMembers({ sort: "activity", limit: 48 })
  return (
    <div style={{ paddingTop: 28 }}>
      <MembersBrowser initial={initial} />
    </div>
  )
}
