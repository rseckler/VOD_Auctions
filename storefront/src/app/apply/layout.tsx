import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Early Access — VOD Auctions",
  description: "Apply for early access to VOD Auctions — 41,500 rare industrial music releases. No eBay fees, no Discogs commissions.",
}

export default function ApplyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
