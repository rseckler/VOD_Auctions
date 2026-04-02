import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Invite — VOD Auctions",
  robots: { index: false, follow: false },
}

export default function InviteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
