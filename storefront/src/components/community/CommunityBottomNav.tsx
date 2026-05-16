"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/components/AuthProvider"
import { fetchNotifications } from "@/lib/community-mutations"

// Erweiterung 02 — fixed 5-slot bottom-tab bar for the community surface on
// mobile (Feed · Explore · Compose · Members · Inbox). The gold Compose
// button is centre-lifted, TikTok/Instagram style. Shown only ≤900px via
// community.css; the desktop Compose FAB takes over above that.

const ICON = {
  home: (
    <>
      <path d="M3 12 12 3l9 9" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </>
  ),
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0" />
      <circle cx="17" cy="6" r="3" />
      <path d="M22 17a5 5 0 0 0-5-5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
} as const

function Glyph({ name, size = 22 }: { name: keyof typeof ICON; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON[name]}
    </svg>
  )
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/community") return pathname === "/community"
  return pathname === href || pathname.startsWith(href + "/")
}

export function CommunityBottomNav() {
  const pathname = usePathname() || "/community"
  const { isAuthenticated } = useAuth()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!isAuthenticated) {
      setUnread(0)
      return
    }
    let cancelled = false
    fetchNotifications()
      .then((d) => {
        if (!cancelled) setUnread(d.unread || 0)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  const item = (href: string, icon: keyof typeof ICON, label: string, dot = false) => (
    <Link
      href={href}
      prefetch={false}
      className={"cm-bottomnav-item" + (isActive(pathname, href) ? " is-active" : "")}
    >
      <Glyph name={icon} />
      {dot && unread > 0 && <span className="cm-bottomnav-dot" />}
      {label}
    </Link>
  )

  return (
    <nav className="cm-bottomnav" aria-label="Community">
      {item("/community", "home", "Feed")}
      {item("/community/explore", "compass", "Explore")}
      <Link
        href="/community/compose"
        prefetch={false}
        className="cm-bottomnav-compose"
        aria-label="Compose a post"
      >
        <span className="cm-bottomnav-fab">
          <Glyph name="plus" size={22} />
        </span>
      </Link>
      {item("/community/members", "users", "Members")}
      {item("/community/notifications", "bell", "Inbox", true)}
    </nav>
  )
}
