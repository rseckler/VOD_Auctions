import type { Metadata } from "next"
import { DM_Sans, DM_Serif_Display } from "next/font/google"
import { AuthProvider } from "@/components/AuthProvider"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { GoogleAnalytics } from "@/components/GoogleAnalytics"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
})

const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  weight: "400",
  subsets: ["latin"],
})

const SITE_URL = "https://vod-auctions.com"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "VOD Auctions — Rare Music Auctions",
    template: "%s — VOD Auctions",
  },
  description:
    "Curated auctions for rare Industrial, Experimental & Electronic Music vinyl, cassettes and CDs. Discover rarities and first pressings.",
  keywords: [
    "vinyl auctions",
    "rare records",
    "industrial music",
    "EBM",
    "dark ambient",
    "experimental music",
    "record collecting",
    "music auctions",
  ],
  authors: [{ name: "VOD Auctions" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "VOD Auctions",
    title: "VOD Auctions — Rare Music Auctions",
    description:
      "Curated auctions for rare Industrial, Experimental & Electronic Music vinyl, cassettes and CDs.",
  },
  twitter: {
    card: "summary_large_image",
    title: "VOD Auctions — Rare Music Auctions",
    description:
      "Curated auctions for rare Industrial, Experimental & Electronic Music vinyl, cassettes and CDs.",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: SITE_URL,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <GoogleAnalytics />
      <body
        className={`${dmSans.variable} ${dmSerif.variable} antialiased min-h-screen flex flex-col`}
      >
        <AuthProvider>
          <TooltipProvider>
            <Header />
            <div className="flex-1">{children}</div>
            <Footer />
            <Toaster richColors position="bottom-right" />
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
