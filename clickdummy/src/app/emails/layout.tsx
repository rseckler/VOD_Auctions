"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Mail } from "lucide-react"

const emailPages = [
  { href: "/emails/welcome", label: "Willkommen" },
  { href: "/emails/outbid", label: "Überboten" },
  { href: "/emails/won", label: "Zuschlag" },
  { href: "/emails/payment", label: "Zahlung" },
  { href: "/emails/shipping", label: "Versand" },
  { href: "/emails/feedback", label: "Feedback" },
]

export default function EmailsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center gap-2 mb-2">
        <Mail className="h-5 w-5 text-primary" />
        <h1 className="font-serif text-2xl">E-Mail Vorschauen</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Transaktionale E-Mails im Customer Journey</p>

      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {emailPages.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              pathname === p.href
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  )
}
