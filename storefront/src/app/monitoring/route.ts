/**
 * Sentry tunnel route — proxies events through our domain to bypass ad-blockers.
 * Receives Sentry envelope POSTs from the client SDK and forwards to Sentry EU.
 */

const SENTRY_INGEST_URL =
  "https://o4510997236940800.ingest.de.sentry.io/api/4510997341798480/envelope/"

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.text()

    const sentryRes = await fetch(SENTRY_INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("content-type") ?? "application/x-sentry-envelope",
        "X-Forwarded-For": request.headers.get("x-forwarded-for") ?? "",
      },
      body,
    })

    return new Response(await sentryRes.text(), {
      status: sentryRes.status,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
}
