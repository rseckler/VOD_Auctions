import { NextRequest, NextResponse } from "next/server"

// LAUNCH CHECKLIST: Remove this entire gate middleware before public launch
// or set GATE_PASSWORD="" in production ENV to disable
export async function POST(req: NextRequest) {
  const gatePassword = process.env.GATE_PASSWORD
  if (!gatePassword) {
    // Gate deaktiviert → immer gewähren
    const res = NextResponse.json({ ok: true })
    res.cookies.set("vod_access", "granted", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
    return res
  }

  const { password } = await req.json()

  if (password === gatePassword) {
    const res = NextResponse.json({ ok: true })
    res.cookies.set("vod_access", "granted", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
    return res
  }

  return NextResponse.json({ error: "Invalid password" }, { status: 401 })
}
