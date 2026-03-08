import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-revalidate-secret")
  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ message: "Invalid secret" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const path = (body as { path?: string }).path || "/"

  revalidatePath(path)

  return NextResponse.json({ revalidated: true, path })
}
