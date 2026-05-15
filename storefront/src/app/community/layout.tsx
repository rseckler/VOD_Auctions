import { notFound } from "next/navigation"
import { isCommunityEnabled } from "@/lib/community-api"
import "./community.css"

// The whole /community surface is gated by the COMMUNITY feature flag.
// Flag OFF → every community page 404s ("deploy early, activate when ready").
export default async function CommunityLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!(await isCommunityEnabled())) {
    notFound()
  }
  return <div className="cm-root">{children}</div>
}
