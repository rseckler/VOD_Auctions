import type { Metadata } from "next"
import { DM_Sans, DM_Serif_Display } from "next/font/google"
import { AuthProvider } from "@/components/AuthProvider"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
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

export const metadata: Metadata = {
  title: "VOD Auctions — Rare Music Auctions",
  description:
    "Curated auctions for rare Industrial, Experimental & Electronic Music records.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
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
