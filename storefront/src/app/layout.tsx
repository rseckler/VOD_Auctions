import type { Metadata } from "next"
import { cookies } from "next/headers"
import { DM_Sans, DM_Serif_Display } from "next/font/google"
import { AuthProvider } from "@/components/AuthProvider"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { GoogleAnalytics } from "@/components/GoogleAnalytics"
import { BrevoTracker } from "@/components/BrevoTracker"
import { CookieConsent } from "@/components/CookieConsent"
import { BackToTop } from "@/components/BackToTop"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { HotjarProvider } from "@/components/providers/HotjarProvider"
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const hasAccess = cookieStore.get("vod_access")?.value === "granted"

  if (!hasAccess) {
    return (
      <html lang="en">
        <body
          className={`${dmSans.variable} ${dmSerif.variable} antialiased`}
        >
          {children}
        </body>
      </html>
    )
  }

  return (
    <html lang="en">
      <GoogleAnalytics />
      <body
        className={`${dmSans.variable} ${dmSerif.variable} antialiased min-h-screen flex flex-col`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-primary focus:text-black focus:px-4 focus:py-2 focus:rounded"
        >
          Skip to content
        </a>
        <AuthProvider>
          <TooltipProvider>
            <Header />
            <main id="main-content" className="flex-1">{children}</main>
            <Footer />
            <Toaster richColors position="bottom-right" />
            <BackToTop />
            <BrevoTracker />
            <CookieConsent />
            <HotjarProvider />
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
