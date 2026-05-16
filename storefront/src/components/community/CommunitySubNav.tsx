"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Sub-navigation for the whole /community surface (Design Brief §4.2).
// Sticky under the site header; the active tab is derived from the path.
const ITEMS: { key: string; label: string; href: string; curator?: boolean }[] = [
  { key: "feed", label: "Feed", href: "/community" },
  { key: "explore", label: "Explore", href: "/community/explore" },
  { key: "lists", label: "Lists", href: "/community/lists" },
  { key: "dispatch", label: "Dispatch", href: "/community/dispatch", curator: true },
  { key: "members", label: "Members", href: "/community/members" },
]

function isActive(pathname: string, href: string): boolean {
  if (href === "/community") return pathname === "/community"
  return pathname === href || pathname.startsWith(href + "/")
}

export function CommunitySubNav() {
  const pathname = usePathname() || "/community"
  return (
    <div className="cm-subnav">
      <div className="cm-subnav-inner">
        {ITEMS.map((it) => (
          <Link
            key={it.key}
            href={it.href}
            prefetch={false}
            className={
              "cm-subnav-link" +
              (isActive(pathname, it.href) ? " is-active" : "") +
              (it.curator ? " cm-subnav-curator" : "")
            }
          >
            {it.label}
          </Link>
        ))}
        <div className="cm-subnav-spacer" />
        <Link href="/community/explore" prefetch={false} className="cm-subnav-search">
          Search the community
        </Link>
      </div>
    </div>
  )
}
