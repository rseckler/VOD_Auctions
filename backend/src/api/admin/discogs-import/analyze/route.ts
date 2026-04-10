import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Knex } from "knex"
import { getSession, updateSession, expandRow } from "../upload/route"

// ─── Types ───────────────────────────────────────────────────────────────────

interface MatchResult {
  artist: string
  title: string
  catalog_number: string
  label: string
  format: string
  year: number | null
  discogs_id: number
  condition: number | null
  db_release_id?: string
  match_score?: number
  skip_reason?: string
  api_data?: Record<string, unknown>
}

// ─── POST /admin/discogs-import/analyze ──────────────────────────────────────

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

    await updateSession(pgConnection, session_id, { status: "analyzing" })

    // Set trigram threshold for `%` operator (pre-filter in fuzzy matching).
    // 0.3 = generous enough to catch partial title matches via GIN index.
    await pgConnection.raw(`SET pg_trgm.similarity_threshold = 0.3`)

    const compactRows = session.rows as Array<Record<string, unknown>>
    const rows = compactRows.map(expandRow)
    const allDiscogsIds = rows.map((r) => r.discogs_id)

    // ── Stufe 1: Exact match via discogs_id (Live-DB-Query) ─────────────
    const exactResult = await pgConnection.raw(
      `SELECT id, discogs_id FROM "Release" WHERE discogs_id = ANY(?)`,
      [allDiscogsIds]
    )
    const exactMap = new Map<number, string>()
    for (const r of exactResult.rows || []) {
      exactMap.set(r.discogs_id, r.id)
    }

    // ── Load API cache from DB ──────────────────────────────────────────
    const cacheResult = await pgConnection.raw(
      `SELECT discogs_id, api_data, suggested_prices, is_error, error_message
       FROM discogs_api_cache WHERE discogs_id = ANY(?)`,
      [allDiscogsIds]
    )
    const cacheMap = new Map<number, { api_data: Record<string, unknown>; suggested_prices: Record<string, unknown> | null; is_error: boolean; error_message: string | null }>()
    for (const r of cacheResult.rows || []) {
      cacheMap.set(r.discogs_id, r)
    }

    // ── Match rows ──────────────────────────────────────────────────────
    const existing: MatchResult[] = []
    const linkable: MatchResult[] = []
    const newReleases: MatchResult[] = []
    const skipped: MatchResult[] = []

    // Collect unmatched rows for batch fuzzy matching
    const unmatchedRows: Array<{ idx: number; row: typeof rows[0]; base: MatchResult }> = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const did = row.discogs_id
      const cached = cacheMap.get(did)

      const apiSummary = cached && !cached.is_error && cached.api_data
        ? {
            ...cached.api_data,
            suggested_prices: cached.suggested_prices,
          }
        : undefined

      const base: MatchResult = {
        artist: row.artist,
        title: row.title,
        catalog_number: row.catalog_number,
        label: row.label,
        format: row.format,
        year: row.year,
        discogs_id: did,
        condition: row.condition,
        api_data: apiSummary,
      }

      // Skip if API returned error (404 etc.)
      if (cached?.is_error) {
        skipped.push({ ...base, skip_reason: cached.error_message || "api_error" })
        continue
      }

      // Match 1: Exact discogs_id
      if (exactMap.has(did)) {
        existing.push({ ...base, db_release_id: exactMap.get(did), match_score: 100 })
        continue
      }

      // Collect for fuzzy matching
      unmatchedRows.push({ idx: i, row, base })
    }

    // ── Stufe 2: Trigram Fuzzy Match (BATCH mit LATERAL JOIN + % Operator) ──
    // Performance: Statt 5000 sequentieller Queries → ~12 Batches à 500.
    // Nutzt idx_release_title_trgm (GIN) via `lower(r.title) % lower(q.title)` als
    // Pre-Filter (Index-Lookup statt Sequential Scan), dann similarity() ranking.
    const BATCH_SIZE = 500
    const MIN_SCORE = 0.4
    const matchedMap = new Map<number, { db_release_id: string; match_score: number }>()

    // Filter valid rows (need artist + title + length >= 3)
    const validUnmatched = unmatchedRows.filter(({ row }) => {
      const s = `${row.artist} ${row.title}`.trim()
      return s.length >= 3
    })

    for (let batchStart = 0; batchStart < validUnmatched.length; batchStart += BATCH_SIZE) {
      const batch = validUnmatched.slice(batchStart, batchStart + BATCH_SIZE)

      // Build VALUES clause for batch
      const valuesParts: string[] = []
      const params: unknown[] = []
      batch.forEach(({ row }, i) => {
        const title = row.title || ""
        const fullStr = `${row.artist} ${row.title}`.trim()
        valuesParts.push(`(?::int, ?::text, ?::text, ?::int)`)
        params.push(batchStart + i, title, fullStr, row.discogs_id)
      })

      try {
        const batchResult = await pgConnection.raw(
          `WITH q(idx, search_title, search_full, did) AS (VALUES ${valuesParts.join(",")})
           SELECT q.idx, q.did, m.id as match_id, m.score
           FROM q
           LEFT JOIN LATERAL (
             SELECT r.id,
                    similarity(lower(COALESCE(a.name, '') || ' ' || r.title), lower(q.search_full)) as score
             FROM "Release" r
             LEFT JOIN "Artist" a ON r."artistId" = a.id
             WHERE r.discogs_id IS NULL
               AND lower(r.title) % lower(q.search_title)
             ORDER BY similarity(lower(COALESCE(a.name, '') || ' ' || r.title), lower(q.search_full)) DESC
             LIMIT 1
           ) m ON m.score >= ?`,
          [...params, MIN_SCORE]
        )

        for (const m of batchResult.rows || []) {
          if (m.match_id && m.score != null) {
            matchedMap.set(m.did, {
              db_release_id: m.match_id,
              match_score: Math.round(Number(m.score) * 100),
            })
          }
        }
      } catch (err) {
        console.error(`[discogs-analyze] Batch fuzzy match failed (batch ${batchStart}):`, err)
        // continue with other batches — failed rows fall through to "new"
      }
    }

    // Distribute unmatched rows into linkable / new based on batch results
    for (const { row, base } of unmatchedRows) {
      const searchString = `${row.artist} ${row.title}`.trim()
      if (searchString.length < 3) {
        newReleases.push(base)
        continue
      }
      const match = matchedMap.get(row.discogs_id)
      if (match) {
        linkable.push({
          ...base,
          db_release_id: match.db_release_id,
          match_score: match.match_score,
        })
      } else {
        newReleases.push(base)
      }
    }

    // ── Save analysis result in session ─────────────────────────────────
    const analysisResult = {
      summary: {
        total: rows.length,
        existing: existing.length,
        linkable: linkable.length,
        new: newReleases.length,
        skipped: skipped.length,
      },
      existing,
      linkable,
      new: newReleases,
      skipped,
    }

    await updateSession(pgConnection, session_id, {
      status: "analyzed",
      analysis_result: analysisResult,
    })

    res.json(analysisResult)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Analysis failed"
    res.status(500).json({ error: msg })
  }
}
