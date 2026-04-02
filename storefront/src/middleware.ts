import { NextRequest, NextResponse } from "next/server"

const GATE_COOKIE = "vod_access"
const INVITE_COOKIE = "vod_invite_session"

// ─── Platform mode cache (5-min TTL) ───────────────────────────────────────

interface SiteModeCache {
  platform_mode: string
  apply_page_visible: boolean
  invite_mode_active: boolean
  fetched_at: number
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
let siteModeCache: SiteModeCache | null = null

async function getSiteMode(): Promise<SiteModeCache | null> {
  // Return cached value if fresh
  if (siteModeCache && Date.now() - siteModeCache.fetched_at < CACHE_TTL) {
    return siteModeCache
  }

  const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || process.env.MEDUSA_BACKEND_URL
  if (!backendUrl) return null

  try {
    const apiKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""
    const res = await fetch(`${backendUrl}/store/site-mode`, {
      headers: { "x-publishable-api-key": apiKey },
      next: { revalidate: 300 }, // Next.js fetch cache hint
    })
    if (!res.ok) return null

    const data = await res.json()
    siteModeCache = {
      platform_mode: data.platform_mode || "pre_launch",
      apply_page_visible: data.apply_page_visible ?? true,
      invite_mode_active: data.invite_mode_active ?? true,
      fetched_at: Date.now(),
    }
    return siteModeCache
  } catch {
    // Backend unreachable — fall back to env-var behavior
    return null
  }
}

// ─── Public paths (always accessible without gate) ─────────────────────────

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/gate" ||
    pathname === "/api/gate" ||
    pathname === "/apply" ||
    pathname === "/apply/confirm" ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/revalidate") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/reset-password" ||
    pathname === "/verify" ||
    pathname === "/agb" ||
    pathname === "/impressum" ||
    pathname === "/datenschutz" ||
    pathname === "/cookies" ||
    pathname.startsWith("/gallery/gallery-") ||
    pathname === "/monitoring"
  )
}

// ─── Middleware ─────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Fetch platform mode from backend (cached 5 min)
  const siteMode = await getSiteMode()

  if (siteMode) {
    // platform_mode controls gate behavior
    switch (siteMode.platform_mode) {
      case "live":
        // No gate — public access
        return NextResponse.next()

      case "beta_test":
        // Password gate only — no invite system, no /apply page
        break

      case "maintenance":
        // Block everyone — redirect to gate with maintenance hint
        const maintUrl = new URL("/gate", request.url)
        maintUrl.searchParams.set("reason", "maintenance")
        return NextResponse.redirect(maintUrl)

      case "pre_launch":
      case "preview":
      default:
        // Gate active — check cookies
        break
    }
  } else {
    // Backend unreachable — fall back to GATE_PASSWORD env var
    const gatePassword = process.env.GATE_PASSWORD
    if (!gatePassword) {
      // No gate configured at all → allow through
      return NextResponse.next()
    }
  }

  // Gate is active — check access cookies
  const hasAccess = request.cookies.get(GATE_COOKIE)?.value === "granted"
  const hasInvite = !!request.cookies.get(INVITE_COOKIE)?.value

  if (hasAccess || hasInvite) {
    return NextResponse.next()
  }

  // No valid session → redirect to gate
  const gateUrl = new URL("/gate", request.url)
  return NextResponse.redirect(gateUrl)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
}
