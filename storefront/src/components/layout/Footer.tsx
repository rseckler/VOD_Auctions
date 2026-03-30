"use client"

import Link from "next/link"
import { Disc3, Mail, Instagram, Facebook, CheckCircle } from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"

export function Footer() {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleNewsletterSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email) return
    setSubmitting(true)
    try {
      const res = await fetch(`${MEDUSA_URL}/store/newsletter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.message || "Subscription failed")
      }
      toast.success("Thank you for subscribing!")
      setEmail("")
    } catch (err: any) {
      toast.error(err.message || "Failed to subscribe. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <footer className="border-t border-[rgba(232,224,212,0.08)] mt-auto">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col md:flex-row justify-between gap-8">
          {/* Brand + Newsletter */}
          <div className="max-w-xs">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/60 to-primary/20 flex items-center justify-center">
                <Disc3 className="h-4 w-4 text-primary" />
              </div>
              <span className="text-lg font-serif text-foreground">VOD Auctions</span>
            </div>
            <p className="text-muted-foreground text-sm mb-3">
              Curated auctions for rare records from the
              Industrial, Experimental and Electronic Music genres.
            </p>
            <p className="flex items-center gap-1.5 text-xs text-green-400/70 mb-4">
              <CheckCircle className="h-3 w-3 flex-shrink-0" />
              No buyer&apos;s premium — ever
            </p>

            {/* Newsletter signup */}
            <form onSubmit={handleNewsletterSubmit} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                required
                className="flex-1 min-w-0 px-3 py-1.5 text-sm rounded-md bg-[rgba(232,224,212,0.06)] border border-[rgba(232,224,212,0.12)] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                Subscribe
              </button>
            </form>
          </div>

          {/* Navigation + Legal columns */}
          <nav aria-label="Footer navigation" className="flex gap-12 text-sm">
            <div className="flex flex-col gap-2">
              <p className="text-foreground font-medium">Navigation</p>
              <Link
                href="/auctions"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Current Auctions
              </Link>
              <Link
                href="/catalog"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Catalog
              </Link>
              <Link
                href="/about"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                About VOD Records
              </Link>
              <a
                href="mailto:info@vod-records.com"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Contact
              </a>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-foreground font-medium">Gallery</p>
              <Link
                href="/gallery"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Visit the Gallery
              </Link>
              <Link
                href="/gallery#visit"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Opening Hours
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-foreground font-medium">Legal</p>
              <Link
                href="/impressum"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Legal Notice
              </Link>
              <Link
                href="/agb"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Terms &amp; Conditions
              </Link>
              <Link
                href="/datenschutz"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/widerruf"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Right of Withdrawal
              </Link>
              <Link
                href="/cookies"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Cookie Policy
              </Link>
              <button
                onClick={() => window.dispatchEvent(new Event("open-cookie-settings"))}
                className="text-muted-foreground hover:text-primary transition-colors text-left"
              >
                Cookie Settings
              </button>
            </div>
          </nav>
        </div>

        {/* Social links + Payment methods */}
        <div className="border-t border-[rgba(232,224,212,0.08)] mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Social media */}
          <div className="flex items-center gap-4">
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
              aria-label="Instagram"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href="https://www.facebook.com/vinylondemandrecords"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
              aria-label="Facebook"
            >
              <Facebook className="h-4 w-4" />
            </a>
          </div>

          {/* Payment method badges */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/60 mr-1">We accept</span>
            {["Visa", "Mastercard", "PayPal", "Klarna"].map((method) => (
              <span
                key={method}
                className="px-2 py-0.5 text-[11px] rounded border border-[rgba(232,224,212,0.12)] text-muted-foreground/80 bg-[rgba(232,224,212,0.04)]"
              >
                {method}
              </span>
            ))}
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-6">
          <p className="text-center text-xs text-muted-foreground/60">
            &copy; {new Date().getFullYear()} VOD Auctions. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
