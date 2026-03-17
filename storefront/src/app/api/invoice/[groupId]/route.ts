import { NextRequest, NextResponse } from "next/server"

const MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params

  // Get auth token from header or cookie
  const authHeader = req.headers.get("authorization")
  const cookieToken = req.cookies.get("medusa_token")?.value
  const token = authHeader || (cookieToken ? `Bearer ${cookieToken}` : null)

  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    )
  }

  try {
    const res = await fetch(
      `${MEDUSA_URL}/store/account/orders/${groupId}/invoice`,
      {
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: token.startsWith("Bearer") ? token : `Bearer ${token}`,
        },
      }
    )

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Failed to generate invoice")
      return NextResponse.json(
        { error: errorText },
        { status: res.status }
      )
    }

    const pdf = await res.arrayBuffer()
    const shortId = groupId.slice(-6).toUpperCase()

    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=VOD-Invoice-${shortId}.pdf`,
      },
    })
  } catch {
    return NextResponse.json(
      { error: "Failed to generate invoice" },
      { status: 500 }
    )
  }
}
