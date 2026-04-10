import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Knex } from "knex"
import { getSession, updateSession, expandRow } from "../upload/route"

const DISCOGS_BASE = "https://api.discogs.com"
const MAX_REQUESTS_PER_MIN = 40
const CONDITION_KEYS: Record<string, string> = {
  "Mint (M)": "M",
  "Near Mint (NM or M-)": "NM",
  "Very Good Plus (VG+)": "VG+",
  "Very Good (VG)": "VG",
  "Good Plus (G+)": "G+",
  "Good (G)": "G",
  "Fair (F)": "F",
  "Poor (P)": "P",
}

// ─── Rate limiter ────────────────────────────────────────────────────────────

const callTimestamps: number[] = []

async function rateLimit(): Promise<void> {
  const now = Date.now()
  while (callTimestamps.length && callTimestamps[0] < now - 60000) {
    callTimestamps.shift()
  }
  if (callTimestamps.length >= MAX_REQUESTS_PER_MIN) {
    const waitMs = callTimestamps[0] + 60000 - now + 100
    await new Promise((r) => setTimeout(r, waitMs))
  }
  callTimestamps.push(Date.now())
}

// ─── POST /admin/discogs-import/fetch ────────────────────────────────────────

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const { session_id } = req.body as { session_id: string }
    if (!session_id) {
      res.status(400).json({ error: "Missing session_id" })
      return
    }

    const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

    const session = await getSession(pgConnection, session_id)
    if (!session) {
      res.status(404).json({ error: "Session not found. Please re-upload." })
      return
    }

    const token = process.env.DISCOGS_TOKEN
    if (!token) {
      res.status(500).json({ error: "DISCOGS_TOKEN not configured in backend .env" })
      return
    }

    const headers = {
      Authorization: `Discogs token=${token}`,
      "User-Agent": "VODAuctions/1.0 +https://vod-auctions.com",
    }

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()

    const send = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    // Update session status
    await updateSession(pgConnection, session_id, { status: "fetching" })

    const compactRows = session.rows as Array<Record<string, unknown>>
    const rows = compactRows.map(expandRow)
    const allDiscogsIds = rows.map((r) => r.discogs_id)

    // Check which IDs are already cached in DB (valid, non-expired, non-error)
    const cachedResult = await pgConnection.raw(
      `SELECT discogs_id FROM discogs_api_cache
       WHERE discogs_id = ANY(?) AND expires_at > NOW() AND is_error = false`,
      [allDiscogsIds]
    )
    const cachedIds = new Set((cachedResult.rows || []).map((r: { discogs_id: number }) => r.discogs_id))

    const total = rows.length
    let fetched = 0
    let skippedCached = 0
    let errors = 0
    const startTime = Date.now()

    send({ type: "start", total, cached: cachedIds.size })

    for (let i = 0; i < total; i++) {
      const did = rows[i].discogs_id

      // Skip if already cached in DB
      if (cachedIds.has(did)) {
        skippedCached++
        if (skippedCached % 50 === 0) {
          send({ type: "progress", current: i + 1, total, artist: rows[i].artist, title: rows[i].title, status: "cached" })
        }
        continue
      }

      // Fetch /releases/{id}
      await rateLimit()
      try {
        let releaseResp = await fetch(`${DISCOGS_BASE}/releases/${did}`, { headers, signal: AbortSignal.timeout(30000) })

        if (releaseResp.status === 429) {
          const retryAfter = parseInt(releaseResp.headers.get("Retry-After") || "60", 10)
          send({ type: "rate_limited", wait: retryAfter })
          await new Promise((r) => setTimeout(r, retryAfter * 1000))
          await rateLimit()
          releaseResp = await fetch(`${DISCOGS_BASE}/releases/${did}`, { headers, signal: AbortSignal.timeout(30000) })
        }

        if (releaseResp.status === 404) {
          // Store error in DB cache (7-day TTL for errors)
          await pgConnection.raw(
            `INSERT INTO discogs_api_cache (discogs_id, api_data, is_error, error_message, fetched_at, expires_at)
             VALUES (?, '{}'::jsonb, true, 'not_found', NOW(), NOW() + INTERVAL '7 days')
             ON CONFLICT (discogs_id) DO UPDATE SET api_data = '{}'::jsonb, is_error = true, error_message = 'not_found', fetched_at = NOW(), expires_at = NOW() + INTERVAL '7 days'`,
            [did]
          )
          errors++
          fetched++
          send({ type: "progress", current: i + 1, total, artist: rows[i].artist, title: rows[i].title, status: "not_found" })
          continue
        }

        if (!releaseResp.ok) {
          errors++
          continue
        }

        const data = await releaseResp.json() as Record<string, unknown>

        // Build API data entry
        const apiData: Record<string, unknown> = {
          title: data.title || "",
          year: data.year || 0,
          country: data.country || "",
          artists: ((data.artists || []) as Array<Record<string, unknown>>).map((a) => ({
            name: a.name || "", id: a.id,
          })),
          extraartists: ((data.extraartists || []) as Array<Record<string, unknown>>).map((a) => ({
            name: a.name || "", id: a.id, role: a.role || "",
          })),
          labels: ((data.labels || []) as Array<Record<string, unknown>>).map((l) => ({
            name: l.name || "", catno: l.catno || "", id: l.id,
          })),
          formats: ((data.formats || []) as Array<Record<string, unknown>>).map((f) => ({
            name: f.name || "", descriptions: f.descriptions || [], qty: f.qty || "1",
          })),
          tracklist: ((data.tracklist || []) as Array<Record<string, unknown>>).map((t) => ({
            position: t.position || "", title: t.title || "", duration: t.duration || "",
          })),
          genres: data.genres || [],
          styles: data.styles || [],
          community: {
            have: ((data.community || {}) as Record<string, unknown>).have || 0,
            want: ((data.community || {}) as Record<string, unknown>).want || 0,
          },
          lowest_price: data.lowest_price ?? null,
          num_for_sale: data.num_for_sale || 0,
          images: ((data.images || []) as Array<Record<string, unknown>>).slice(0, 10).map((img) => ({
            uri: img.uri || "", type: img.type || "",
          })),
          notes: data.notes || "",
          data_quality: data.data_quality || "",
        }

        // Fetch /marketplace/price_suggestions/{id}
        let suggestedPrices: Record<string, unknown> | null = null
        await rateLimit()
        try {
          const psResp = await fetch(`${DISCOGS_BASE}/marketplace/price_suggestions/${did}`, { headers, signal: AbortSignal.timeout(30000) })
          if (psResp.ok) {
            const psData = await psResp.json() as Record<string, Record<string, unknown>>
            const prices: Record<string, unknown> = {}
            for (const [key, val] of Object.entries(psData)) {
              const short = CONDITION_KEYS[key]
              if (short && val) prices[short] = val.value
            }
            if (Object.keys(prices).length > 0) {
              const firstVal = Object.values(psData)[0] as Record<string, unknown> | undefined
              prices.currency = firstVal?.currency || "EUR"
              suggestedPrices = prices
            }
          }
        } catch {
          // price suggestions failed — continue without them
        }

        // Store in DB cache (30-day TTL)
        await pgConnection.raw(
          `INSERT INTO discogs_api_cache (discogs_id, api_data, suggested_prices, is_error, fetched_at, expires_at)
           VALUES (?, ?::jsonb, ?::jsonb, false, NOW(), NOW() + INTERVAL '30 days')
           ON CONFLICT (discogs_id) DO UPDATE SET api_data = EXCLUDED.api_data, suggested_prices = EXCLUDED.suggested_prices, is_error = false, error_message = NULL, fetched_at = NOW(), expires_at = NOW() + INTERVAL '30 days'`,
          [did, JSON.stringify(apiData), suggestedPrices ? JSON.stringify(suggestedPrices) : null]
        )

        fetched++
      } catch {
        errors++
      }

      // Send progress
      send({
        type: "progress",
        current: i + 1,
        total,
        fetched,
        cached: skippedCached,
        errors,
        artist: rows[i].artist,
        title: rows[i].title,
        status: "fetched",
        eta_min: Math.round(((Date.now() - startTime) / Math.max(fetched, 1)) * (total - i - 1) / 60000),
      })

      // Update session fetch_progress every 25 fetched releases
      if (fetched % 25 === 0) {
        await updateSession(pgConnection, session_id, {
          fetch_progress: { current: i + 1, total, fetched, cached: skippedCached, errors },
        })
      }
    }

    // Final status update
    await updateSession(pgConnection, session_id, {
      status: "fetched",
      fetch_progress: { current: total, total, fetched, cached: skippedCached, errors },
    })

    const durationMin = Math.round((Date.now() - startTime) / 60000)
    send({ type: "done", fetched, cached: skippedCached, errors, duration_min: durationMin })
    res.end()

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Fetch failed"
    try {
      res.write(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`)
      res.end()
    } catch {
      res.status(500).json({ error: msg })
    }
  }
}
