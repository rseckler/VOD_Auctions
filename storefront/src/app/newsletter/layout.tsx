import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Newsletter — VOD Auctions",
  description: "Subscribe to the VOD Auctions newsletter — progress updates, new auction blocks, and rare industrial music finds from VOD Records.",
}

export default function NewsletterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
