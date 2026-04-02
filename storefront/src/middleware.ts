import { NextRequest, NextResponse } from "next/server"

// LAUNCH CHECKLIST: Remove this entire gate middleware before public launch
// or set GATE_PASSWORD="" in production ENV to disable
const GATE_COOKIE = "vod_access"
const INVITE_COOKIE = "vod_invite_session"

// Paths that are always accessible without any gate check
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
    pathname.startsWith("/gallery/gallery-") ||
    pathname === "/monitoring"  // Sentry tunnel route
  )
}

export function middleware(request: NextRequest) {
  const gatePassword = process.env.GATE_PASSWORD
  if (!gatePassword) {
    // No gate password set → gate disabled, allow all requests
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl

  // Always allow public paths (gate, apply, invite, static assets, etc.)
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Check access: password gate cookie OR invite session cookie
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
