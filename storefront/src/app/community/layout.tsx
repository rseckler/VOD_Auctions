import Link from "next/link"
import { notFound } from "next/navigation"
import { isCommunityEnabled } from "@/lib/community-api"
import { CommunitySubNav } from "@/components/community/CommunitySubNav"
import { CommunityBottomNav } from "@/components/community/CommunityBottomNav"
import "./community.css"

// The whole /community surface is gated by the COMMUNITY feature flag.
// Flag OFF → every community page 404s ("deploy early, activate when ready").
// The layout supplies the shared shell: sub-navigation + a persistent
// "compose" floating action button.
export default async function CommunityLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!(await isCommunityEnabled())) {
    notFound()
  }
  return (
    <div className="cm-root">
      <CommunitySubNav />
      {children}
      <Link href="/community/compose" className="cm-fab" prefetch={false}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        Compose
      </Link>
      <CommunityBottomNav />
    </div>
  )
}
