import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as crypto from "crypto"
import * as XLSX from "xlsx"
import type { Knex } from "knex"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedRow {
  artist: string
  title: string
  catalog_number: string
  label: string
  format: string
  condition: number | null
  year: number | null
  discogs_id: number
  collection_folder?: string
  date_added?: string
  media_condition?: string
  sleeve_condition?: string
  listing_price?: number | null
  status?: string
}

// ─── DB Session helpers (replaces in-memory Map) ────────────────────────────

export async function getSession(pg: Knex, id: string) {
  const rows = await pg.raw(
    `SELECT * FROM import_session WHERE id = ?`,
    [id]
  )
  return rows.rows?.[0] || null
}

export async function updateSession(
  pg: Knex,
  id: string,
  updates: Record<string, unknown>
) {
  const setClauses: string[] = []
  const values: unknown[] = []
  for (const [key, val] of Object.entries(updates)) {
    setClauses.push(`${key} = ?`)
    values.push(typeof val === "object" && val !== null ? JSON.stringify(val) : val)
  }
  setClauses.push(`updated_at = NOW()`)
  values.push(id)
  await pg.raw(
    `UPDATE import_session SET ${setClauses.join(", ")} WHERE id = ?`,
    values
  )
}

// ─── POST /admin/discogs-import/upload ───────────────────────────────────────

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const { data, filename, collection_name, encoding } = req.body as {
      data: string
      filename: string
      collection_name: string
      encoding?: string
    }

    if (!data || !filename || !collection_name) {
      res.status(400).json({ error: "Missing data, filename, or collection_name" })
      return
    }

    const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

    // Parse based on extension
    const ext = filename.toLowerCase().split(".").pop() || ""
    let rows: ParsedRow[]

    if (ext === "csv") {
      const content = encoding === "text" ? data : Buffer.from(data.replace(/^data:[^;]+;base64,/, ""), "base64").toString("utf-8")
      rows = parseCsv(content)
    } else if (ext === "xlsx" || ext === "xls") {
      const buffer = Buffer.from(data.replace(/^data:[^;]+;base64,/, ""), "base64")
      rows = parseXlsx(buffer)
    } else {
      res.status(400).json({ error: `Unsupported format: .${ext} (expected .csv or .xlsx)` })
      return
    }

    // Deduplicate by discogs_id (keep highest condition)
    const deduped = deduplicate(rows)

    // Detect if inventory export
    const isInventory = deduped.some((r) => r.listing_price != null || r.media_condition)

    // Store session in DB (replaces in-memory Map)
    const sessionId = crypto.randomUUID()

    // Store only essential fields per row to keep JSONB small
    const compactRows = deduped.map((r) => ({
      a: r.artist,
      t: r.title,
      cn: r.catalog_number,
      l: r.label,
      f: r.format,
      c: r.condition,
      y: r.year,
      d: r.discogs_id,
      ...(r.media_condition ? { mc: r.media_condition } : {}),
      ...(r.sleeve_condition ? { sc: r.sleeve_condition } : {}),
      ...(r.listing_price != null ? { lp: r.listing_price } : {}),
      ...(r.status ? { s: r.status } : {}),
      ...(r.collection_folder ? { cf: r.collection_folder } : {}),
      ...(r.date_added ? { da: r.date_added } : {}),
    }))

    await pgConnection.raw(
      `INSERT INTO import_session (id, collection_name, filename, rows, row_count, unique_count, format_detected, export_type, status)
       VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?, 'uploaded')`,
      [sessionId, collection_name, filename, JSON.stringify(compactRows), rows.length, deduped.length, ext.toUpperCase(), isInventory ? "INVENTORY" : "COLLECTION"]
    )

    // Check how many are already in the DB cache (replaces JSON file check)
    const cacheResult = await pgConnection.raw(
      `SELECT COUNT(*) as cnt FROM discogs_api_cache
       WHERE discogs_id = ANY(?) AND expires_at > NOW() AND is_error = false`,
      [deduped.map((r) => r.discogs_id)]
    )
    const cachedCount = parseInt(cacheResult.rows?.[0]?.cnt || "0", 10)

    res.json({
      session_id: sessionId,
      row_count: rows.length,
      unique_discogs_ids: deduped.length,
      already_cached: cachedCount,
      to_fetch: deduped.length - cachedCount,
      format_detected: ext.toUpperCase(),
      export_type: isInventory ? "INVENTORY" : "COLLECTION",
      sample_rows: deduped.slice(0, 5).map((r) => ({
        artist: r.artist,
        title: r.title,
        year: r.year,
        format: r.format,
        discogs_id: r.discogs_id,
        ...(isInventory ? {
          listing_price: r.listing_price,
          media_condition: r.media_condition,
          status: r.status,
        } : {}),
      })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Upload failed"
    res.status(500).json({ error: msg })
  }
}

// ─── Expand compact row back to ParsedRow ───────────────────────────────────

export function expandRow(compact: Record<string, unknown>): ParsedRow {
  return {
    artist: (compact.a as string) || "",
    title: (compact.t as string) || "",
    catalog_number: (compact.cn as string) || "",
    label: (compact.l as string) || "",
    format: (compact.f as string) || "",
    condition: compact.c as number | null,
    year: compact.y as number | null,
    discogs_id: compact.d as number,
    ...(compact.mc ? { media_condition: compact.mc as string } : {}),
    ...(compact.sc ? { sleeve_condition: compact.sc as string } : {}),
    ...(compact.lp != null ? { listing_price: compact.lp as number } : {}),
    ...(compact.s ? { status: compact.s as string } : {}),
    ...(compact.cf ? { collection_folder: compact.cf as string } : {}),
    ...(compact.da ? { date_added: compact.da as string } : {}),
  }
}

// ─── CSV Parser (standard Discogs export with headers) ───────────────────────

function parseCsv(content: string): ParsedRow[] {
  // Clean up: strip ;; line endings and unwrap whole-line quotes (Discogs inventory export quirk)
  const cleanedLines = content.split("\n").map((line) => {
    let l = line.trimEnd()
    while (l.endsWith(";;")) l = l.slice(0, -2)
    if (l.startsWith('"') && l.endsWith('"') && !l.startsWith('""')) {
      const inner = l.slice(1, -1)
      if (inner.split(",").length > 5) {
        l = inner.replace(/""/g, '"')
      }
    }
    return l
  })
  const cleaned = cleanedLines.join("\n")

  const lines = cleaned.split("\n")
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0])
  const colMap: Record<string, number> = {}
  headers.forEach((h, i) => (colMap[h.trim()] = i))

  const isInventory = "listing_id" in colMap && "price" in colMap

  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = parseCSVLine(line)

    const discogsId = parseInt(cols[colMap["release_id"]] || "", 10)
    if (!discogsId || isNaN(discogsId)) continue

    if (isInventory) {
      const price = parseFloat(cols[colMap["price"]] || "")
      rows.push({
        artist: (cols[colMap["artist"]] || "").trim(),
        title: (cols[colMap["title"]] || "").trim(),
        catalog_number: (cols[colMap["catno"]] || "").trim(),
        label: (cols[colMap["label"]] || "").trim(),
        format: (cols[colMap["format"]] || "").trim(),
        condition: null,
        year: null,
        discogs_id: discogsId,
        media_condition: (cols[colMap["media_condition"]] || "").trim(),
        sleeve_condition: (cols[colMap["sleeve_condition"]] || "").trim(),
        listing_price: isNaN(price) ? null : price,
        status: (cols[colMap["status"]] || "").trim(),
      })
    } else {
      const rating = parseInt(cols[colMap["Rating"]] || "", 10)
      rows.push({
        artist: (cols[colMap["Artist"]] || "").trim(),
        title: (cols[colMap["Title"]] || "").trim(),
        catalog_number: (cols[colMap["Catalog#"]] || "").trim(),
        label: (cols[colMap["Label"]] || "").trim(),
        format: (cols[colMap["Format"]] || "").trim(),
        condition: isNaN(rating) ? null : rating,
        year: parseYear(cols[colMap["Released"]]),
        discogs_id: discogsId,
        collection_folder: (cols[colMap["CollectionFolder"]] || "").trim(),
        date_added: (cols[colMap["Date Added"]] || "").trim(),
      })
    }
  }
  return rows
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ─── XLSX Parser (no headers, fixed column order) ────────────────────────────

function parseXlsx(buffer: Buffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

  const rows: ParsedRow[] = []
  for (const raw of rawRows) {
    if (!raw || raw.length < 8) continue
    const discogsId = parseInt(String(raw[7] || ""), 10)
    if (!discogsId || isNaN(discogsId)) continue

    const condition = raw[5] != null ? parseInt(String(raw[5]), 10) : null

    rows.push({
      artist: String(raw[0] || "").trim(),
      title: String(raw[1] || "").trim(),
      catalog_number: String(raw[2] || "").trim(),
      label: String(raw[3] || "").trim(),
      format: String(raw[4] || "").trim(),
      condition: condition != null && !isNaN(condition) ? condition : null,
      year: parseYear(raw[6]),
      discogs_id: discogsId,
    })
  }
  return rows
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseYear(val: unknown): number | null {
  if (val == null) return null
  const y = parseInt(String(val).trim(), 10)
  return y >= 1900 && y <= 2100 ? y : null
}

function deduplicate(rows: ParsedRow[]): ParsedRow[] {
  const seen = new Map<number, ParsedRow>()
  for (const row of rows) {
    const existing = seen.get(row.discogs_id)
    if (!existing) {
      seen.set(row.discogs_id, row)
    } else if ((row.condition || 0) > (existing.condition || 0)) {
      seen.set(row.discogs_id, row)
    }
  }
  return Array.from(seen.values())
}
