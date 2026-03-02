import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import Link from "next/link"
import { AuthProvider } from "@/components/AuthProvider"
import { HeaderAuth } from "@/components/HeaderAuth"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "VOD Auctions — Rare Music Auctions",
  description:
    "Kuratierte Auktionen für seltene Industrial, Experimental & Electronic Music Tonträger.",
}

function Header() {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight">
          VOD<span className="text-zinc-500">Auctions</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/auctions"
            className="text-zinc-400 hover:text-white transition-colors"
          >
            Auktionen
          </Link>
          <Link
            href="/auctions?status=all"
            className="text-zinc-400 hover:text-white transition-colors"
          >
            Kalender
          </Link>
          <HeaderAuth />
        </nav>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 mt-auto">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col md:flex-row justify-between gap-8">
          <div>
            <p className="text-lg font-bold">
              VOD<span className="text-zinc-500">Auctions</span>
            </p>
            <p className="text-zinc-500 text-sm mt-2 max-w-xs">
              Kuratierte Auktionen für seltene Tonträger aus den Bereichen
              Industrial, Experimental und Electronic Music.
            </p>
          </div>
          <div className="flex gap-12 text-sm">
            <div className="flex flex-col gap-2">
              <p className="text-zinc-400 font-medium">Navigation</p>
              <Link href="/auctions" className="text-zinc-500 hover:text-zinc-300">
                Aktuelle Auktionen
              </Link>
              <Link href="/auctions?status=all" className="text-zinc-500 hover:text-zinc-300">
                Kalender
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-zinc-400 font-medium">Rechtliches</p>
              <span className="text-zinc-600">Impressum (folgt)</span>
              <span className="text-zinc-600">Datenschutz (folgt)</span>
              <span className="text-zinc-600">AGB (folgt)</span>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-zinc-800 text-center text-xs text-zinc-600">
          &copy; {new Date().getFullYear()} VOD Auctions. Alle Rechte vorbehalten.
        </div>
      </div>
    </footer>
  )
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="de">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-white min-h-screen flex flex-col`}
      >
        <AuthProvider>
          <Header />
          <div className="flex-1">{children}</div>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  )
}
