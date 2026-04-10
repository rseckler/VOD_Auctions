import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as fs from "fs"
import * as path from "path"
import { getScriptsDir } from "../../../../lib/paths"
import { sessions, touchSession } from "../upload/route"

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
  skip_reason?: string
  api_data?: {
    country?: string
    genres?: string[]
    styles?: string[]
    community?: { have: number; want: number }
    lowest_price?: number | null
    num_for_sale?: number
  }
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

    const session = sessions.get(session_id)
    if (!session) {
      res.status(404).json({ error: "Session not found or expired. Please re-upload." })
      return
    }
    touchSession(session_id)

    const dataDir = path.join(getScriptsDir(), "data")

    // Load DB snapshot: discogs_id → release_id
    const discogsIdsPath = path.join(dataDir, "db_discogs_ids.json")
    if (!fs.existsSync(discogsIdsPath)) {
      res.status(500).json({
        error: "Snapshot file db_discogs_ids.json not found. Run the Python export script first.",
      })
      return
    }
    const existingByDiscogs: Record<string, string> = JSON.parse(
      fs.readFileSync(discogsIdsPath, "utf-8")
    )

    // Load unlinked releases for fuzzy matching
    const unlinkedPath = path.join(dataDir, "db_unlinked_releases.json")
    let unlinked: Array<{
      id: string
      title: string
      catalog_number: string
      artist_name: string
    }> = []
    if (fs.existsSync(unlinkedPath)) {
      unlinked = JSON.parse(fs.readFileSync(unlinkedPath, "utf-8"))
    }

    // Build fuzzy index
    const fuzzyIndex = new Map<string, { id: string; title: string }>()
    for (const rel of unlinked) {
      const key = fuzzyKey(
        rel.artist_name || "",
        rel.title || "",
        rel.catalog_number || ""
      )
      if (key) fuzzyIndex.set(key, { id: rel.id, title: rel.title })
    }

    // Load API cache (optional)
    const cachePath = path.join(dataDir, "discogs_import_cache.json")
    let apiCache: Record<string, Record<string, unknown>> = {}
    if (fs.existsSync(cachePath)) {
      apiCache = JSON.parse(fs.readFileSync(cachePath, "utf-8"))
    }

    // Match
    const existing: MatchResult[] = []
    const linkable: MatchResult[] = []
    const newReleases: MatchResult[] = []
    const skipped: MatchResult[] = []

    for (const row of session.rows) {
      const did = row.discogs_id
      const cached = apiCache[String(did)] as Record<string, unknown> | undefined
      const apiSummary = cached && !cached.error
        ? {
            country: cached.country as string,
            genres: cached.genres as string[],
            styles: cached.styles as string[],
            community: cached.community as { have: number; want: number },
            lowest_price: cached.lowest_price as number | null,
            num_for_sale: cached.num_for_sale as number,
            notes: cached.notes as string,
            images: (cached.images as Array<{ uri: string; type: string }>) || [],
            tracklist: (cached.tracklist as Array<{ position: string; title: string; duration: string }>) || [],
            extraartists: (cached.extraartists as Array<{ name: string; id: number; role: string }>) || [],
            labels: (cached.labels as Array<{ name: string; catno: string; id: number }>) || [],
            formats: (cached.formats as Array<{ name: string; descriptions: string[]; qty: string }>) || [],
            data_quality: cached.data_quality as string,
            fetched_at: cached.fetched_at as string,
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

      if (cached && (cached as Record<string, unknown>).error) {
        skipped.push({ ...base, skip_reason: String((cached as Record<string, unknown>).error) })
        continue
      }

      // Match 1: Exact discogs_id
      if (existingByDiscogs[String(did)]) {
        existing.push({ ...base, db_release_id: existingByDiscogs[String(did)] })
        continue
      }

      // Match 2: Fuzzy
      const key = fuzzyKey(row.artist, row.title, row.catalog_number)
      if (key && fuzzyIndex.has(key)) {
        const match = fuzzyIndex.get(key)!
        linkable.push({ ...base, db_release_id: match.id })
        continue
      }

      // Match 3: New
      newReleases.push(base)
    }

    res.json({
      summary: {
        total: session.rows.length,
        existing: existing.length,
        linkable: linkable.length,
        new: newReleases.length,
        skipped: skipped.length,
        has_api_cache: Object.keys(apiCache).length > 0,
        cached_count: Object.keys(apiCache).length,
      },
      existing,
      linkable,
      new: newReleases,
      skipped,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Analysis failed"
    res.status(500).json({ error: msg })
  }
}

// ─── Fuzzy matching helpers ──────────────────────────────────────────────────

function normalize(s: string): string {
  if (!s) return ""
  return s
    .toLowerCase()
    .trim()
    .replace(/['".,]/g, "")
    .replace(/\s+/g, " ")
}

function fuzzyKey(artist: string, title: string, catno: string): string | null {
  const a = normalize(artist)
  const t = normalize(title)
  const c = normalize(catno)
  if (!a || !t) return null
  return `${a}|${t}|${c}`
}
