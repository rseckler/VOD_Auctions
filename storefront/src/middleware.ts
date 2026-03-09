import { NextRequest, NextResponse } from "next/server"

const GATE_PASSWORD = process.env.GATE_PASSWORD || "vod2026"
const GATE_COOKIE = "vod_access"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow: gate page, gate API, static assets, API routes, health checks
  if (
    pathname === "/gate" ||
    pathname === "/api/gate" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/revalidate") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return NextResponse.next()
  }

  // Check access cookie
  const accessCookie = request.cookies.get(GATE_COOKIE)
  if (accessCookie?.value === "granted") {
    return NextResponse.next()
  }

  // Redirect to gate
  const gateUrl = new URL("/gate", request.url)
  return NextResponse.redirect(gateUrl)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
}
