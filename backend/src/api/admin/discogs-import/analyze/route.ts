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

    // ── Stufe 2: Trigram Fuzzy Match (batch, only for unmatched) ────────
    for (const { row, base } of unmatchedRows) {
      const searchString = `${row.artist} ${row.title}`.trim()
      if (!searchString || searchString.length < 3) {
        newReleases.push(base)
        continue
      }

      try {
        const fuzzyResult = await pgConnection.raw(
          `SELECT r.id, r.title, a.name as artist_name, r."catalogNumber",
                  similarity(lower(COALESCE(a.name, '') || ' ' || r.title), lower(?)) as score
           FROM "Release" r
           LEFT JOIN "Artist" a ON r."artistId" = a.id
           WHERE r.discogs_id IS NULL
             AND similarity(lower(COALESCE(a.name, '') || ' ' || r.title), lower(?)) > 0.4
           ORDER BY score DESC
           LIMIT 1`,
          [searchString, searchString]
        )

        if (fuzzyResult.rows?.length > 0) {
          const match = fuzzyResult.rows[0]
          const score = Math.round(Number(match.score) * 100)
          linkable.push({
            ...base,
            db_release_id: match.id,
            match_score: score,
          })
        } else {
          newReleases.push(base)
        }
      } catch {
        // Fuzzy match failed for this row — treat as new
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
