import type { Metadata } from "next"
import { DM_Sans, DM_Serif_Display } from "next/font/google"
import { FlowProvider } from "@/context/FlowContext"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { FlowGuide } from "@/components/FlowGuide"
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
  title: "VOD Auctions — Clickdummy",
  description: "Interaktiver Clickdummy der VOD Auctions Plattform",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="de">
      <body className={`${dmSans.variable} ${dmSerif.variable} font-sans antialiased min-h-screen flex flex-col`}>
        <FlowProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <FlowGuide />
        </FlowProvider>
      </body>
    </html>
  )
}
