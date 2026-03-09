import { NextRequest, NextResponse } from "next/server"

const GATE_PASSWORD = process.env.GATE_PASSWORD || "vod2026"

export async function POST(req: NextRequest) {
  const { password } = await req.json()

  if (password === GATE_PASSWORD) {
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
