/**
 * Sentry tunnel route — bypasses ad-blockers by proxying events through our own domain.
 * Receives Sentry envelope POSTs from the client SDK and forwards them to Sentry.
 *
 * The client SDK is configured with tunnelRoute: "/monitoring" in next.config.ts,
 * so it sends to https://vod-auctions.com/monitoring instead of ingest.de.sentry.io.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.text()

    // Extract DSN from the first line of the Sentry envelope header
    const pieces = body.split("\n")
    const header = JSON.parse(pieces[0]) as { dsn?: string }
    const dsn = header.dsn

    if (!dsn) {
      return new Response("Missing DSN in envelope", { status: 400 })
    }

    // Parse DSN to build the ingest URL
    const url = new URL(dsn)
    const projectId = url.pathname.replace("/", "")
    const host = url.hostname // e.g. o4510997236940800.ingest.de.sentry.io
    const ingestUrl = `https://${host}/api/${projectId}/envelope/`

    const sentryRes = await fetch(ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body,
    })

    return new Response(null, { status: sentryRes.status })
  } catch (e) {
    return new Response("Tunnel error", { status: 500 })
  }
}
