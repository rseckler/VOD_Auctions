/**
 * Sentry tunnel route — proxies events through our domain to bypass ad-blockers.
 * Receives Sentry envelope POSTs from the client SDK and forwards to Sentry EU.
 */

const SENTRY_INGEST_URL =
  "https://o4510997236940800.ingest.de.sentry.io/api/4510997341798480/envelope/"

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.text()

    const forwardHeaders: Record<string, string> = {
      "Content-Type": request.headers.get("content-type") ?? "application/x-sentry-envelope",
    }
    const encoding = request.headers.get("content-encoding")
    if (encoding) forwardHeaders["Content-Encoding"] = encoding

    const sentryRes = await fetch(SENTRY_INGEST_URL, {
      method: "POST",
      headers: forwardHeaders,
      body,
    })

    const responseText = await sentryRes.text()
    console.log(`[sentry-tunnel] forwarded to Sentry → ${sentryRes.status}: ${responseText.slice(0, 200)}`)

    return new Response(responseText, {
      status: sentryRes.status,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e: any) {
    console.error(`[sentry-tunnel] fetch error: ${e.message}`)
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
}
