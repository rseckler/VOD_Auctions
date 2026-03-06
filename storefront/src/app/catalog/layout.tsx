import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Catalog",
  description:
    "Browse 30,000+ releases from our archive — Industrial, EBM, Dark Ambient, Noise, Experimental and more.",
  openGraph: {
    title: "Catalog — VOD Auctions",
    description:
      "Browse 30,000+ releases from our archive — Industrial, EBM, Dark Ambient, Noise, Experimental and more.",
  },
}

export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
