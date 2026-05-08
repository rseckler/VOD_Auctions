import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as fs from "fs"
import * as path from "path"

const FB_ARCHIVE_DIR = "/root/VOD_Auctions/data/fb_archive_2026-05-07"
const MANIFEST_MATCHES = path.join(FB_ARCHIVE_DIR, "manifest_matches_v2.jsonl")
const DECISIONS_FILE = path.join(FB_ARCHIVE_DIR, "manual_review_decisions.jsonl")

const R2_PUBLIC = "https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev"

type Decision = {
  fb_id: string
  decision: "ok" | "skip" | "edit"
  filename: string | null
  decided_at: string
  decided_by: string | null
}

type ReviewRow = {
  fb_id: string
  r2_url: string
  post_timestamp: number | null
  post_date: string
  photo_index: number | null
  photo_total: number
  post_text: string
  suggested_filename: string | null
  ai_confidence: number | null
  ai_artist_name: string | null
  ai_release_title: string | null
  ai_reason: string | null
  artist_candidates: { id: string; name: string; score: number }[]
  release_candidates: { id: string; title: string; main_artist_name: string | null; catalog_number: string | null; score: number }[]
  decision: Decision | null
}

function loadMatches(): any[] {
  if (!fs.existsSync(MANIFEST_MATCHES)) return []
  const out: any[] = []
  const raw = fs.readFileSync(MANIFEST_MATCHES, "utf-8")
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t) continue
    try {
      out.push(JSON.parse(t))
    } catch {
      /* skip */
    }
  }
  return out
}

function loadDecisions(): Map<string, Decision> {
  // Append-only log; latest entry per fb_id wins.
  const map = new Map<string, Decision>()
  if (!fs.existsSync(DECISIONS_FILE)) return map
  const raw = fs.readFileSync(DECISIONS_FILE, "utf-8")
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t) continue
    try {
      const d = JSON.parse(t) as Decision
      if (d.fb_id) map.set(d.fb_id, d)
    } catch {
      /* skip */
    }
  }
  return map
}

function appendDecision(d: Decision): void {
  fs.appendFileSync(DECISIONS_FILE, JSON.stringify(d) + "\n", "utf-8")
}

function fmtDate(ts: number | null): string {
  if (!ts) return ""
  try {
    return new Date(ts * 1000).toISOString().slice(0, 10)
  } catch {
    return ""
  }
}

function projectRow(m: any, decision: Decision | null): ReviewRow {
  const artistById = new Map<string, any>()
  for (const a of (m.artist_candidates || [])) artistById.set(a.id, a)
  const releaseById = new Map<string, any>()
  for (const r of (m.release_candidates || [])) releaseById.set(r.id, r)
  return {
    fb_id: m.fb_id,
    r2_url: `${R2_PUBLIC}/tape-mag/community-fb/${m.fb_id}.webp`,
    post_timestamp: m.post_timestamp ?? null,
    post_date: fmtDate(m.post_timestamp ?? null),
    photo_index: m.photo_index ?? null,
    photo_total: m.photo_total ?? 1,
    post_text: m.post_text_excerpt ?? "",
    suggested_filename: m.suggested_filename ?? null,
    ai_confidence: typeof m.ai_confidence === "number" ? m.ai_confidence : null,
    ai_artist_name: artistById.get(m.ai_artist_id)?.name ?? null,
    ai_release_title: releaseById.get(m.ai_release_id)?.title ?? null,
    ai_reason: m.ai_reason ?? null,
    artist_candidates: (m.artist_candidates || []).slice(0, 3),
    release_candidates: (m.release_candidates || []).slice(0, 3),
    decision,
  }
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const matches = loadMatches()
  const decisions = loadDecisions()

  // Default focus: Tier 2 nach AI = manual review needed.
  // ?filter=pending|decided|all  &  ?include_tier1=true (für Spot-Check)
  const filter = String(req.query.filter || "pending")
  const includeTier1 = String(req.query.include_tier1 || "false") === "true"
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1)
  const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || "10"), 10) || 10))

  // Filter by tier
  const inScope = matches.filter((m) => {
    const t = m.tier_after_ai ?? m.tier
    if (t === 2) return true
    if (includeTier1 && t === 1) return true
    return false
  })

  // Filter by decision-status
  const filtered = inScope.filter((m) => {
    const d = decisions.get(m.fb_id) || null
    if (filter === "pending") return !d
    if (filter === "decided") return !!d
    return true
  })

  // Sort by AI confidence DESC then post_timestamp ASC (oldest first as tiebreaker)
  filtered.sort((a, b) => {
    const ac = a.ai_confidence ?? 0
    const bc = b.ai_confidence ?? 0
    if (ac !== bc) return bc - ac
    return (a.post_timestamp ?? 0) - (b.post_timestamp ?? 0)
  })

  // Counts
  const total = inScope.length
  const decidedCount = inScope.filter((m) => decisions.has(m.fb_id)).length
  const pendingCount = total - decidedCount

  // Paginate
  const start = (page - 1) * pageSize
  const slice = filtered.slice(start, start + pageSize)
  const rows = slice.map((m) => projectRow(m, decisions.get(m.fb_id) || null))

  res.json({
    counts: { total, pending: pendingCount, decided: decidedCount },
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    filter,
    include_tier1: includeTier1,
    rows,
  })
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const body = (req.body || {}) as {
    fb_id?: string
    decision?: "ok" | "skip" | "edit"
    filename?: string | null
    decided_by?: string | null
  }

  if (!body.fb_id || !["ok", "skip", "edit"].includes(body.decision || "")) {
    res.status(400).json({ error: "invalid body — need {fb_id, decision: ok|skip|edit, filename?}" })
    return
  }

  if (body.decision === "edit" && !(body.filename && body.filename.trim())) {
    res.status(400).json({ error: "decision=edit requires non-empty filename" })
    return
  }

  const d: Decision = {
    fb_id: body.fb_id,
    decision: body.decision!,
    filename: body.decision === "edit" ? (body.filename || "").trim() : null,
    decided_at: new Date().toISOString(),
    decided_by: body.decided_by || null,
  }
  appendDecision(d)

  res.json({ ok: true, decision: d })
}
