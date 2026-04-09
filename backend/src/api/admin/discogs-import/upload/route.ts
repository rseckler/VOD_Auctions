import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as crypto from "crypto"
import * as XLSX from "xlsx"

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParsedRow {
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
  // Inventory export fields
  media_condition?: string
  sleeve_condition?: string
  listing_price?: number | null
  status?: string
}

interface Session {
  rows: ParsedRow[]
  filename: string
  collection: string
  created: number
}

// ─── In-memory session store (1h TTL) ────────────────────────────────────────

const sessions = new Map<string, Session>()

// Cleanup every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000
  for (const [id, session] of sessions) {
    if (session.created < cutoff) sessions.delete(id)
  }
}, 10 * 60 * 1000)

export { sessions }

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
      encoding?: string  // "text" for CSV (raw text), "base64" for XLSX
    }

    if (!data || !filename || !collection_name) {
      res.status(400).json({ error: "Missing data, filename, or collection_name" })
      return
    }

    // Parse based on extension
    const ext = filename.toLowerCase().split(".").pop() || ""
    let rows: ParsedRow[]

    if (ext === "csv") {
      // CSV: data is either plain text or base64-encoded
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

    // Store in session
    const sessionId = crypto.randomUUID()
    sessions.set(sessionId, {
      rows: deduped,
      filename,
      collection: collection_name,
      created: Date.now(),
    })

    // Detect if inventory export (has listing prices + conditions)
    const isInventory = deduped.some((r) => r.listing_price != null || r.media_condition)

    res.json({
      session_id: sessionId,
      row_count: rows.length,
      unique_discogs_ids: deduped.length,
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

// ─── CSV Parser (standard Discogs export with headers) ───────────────────────

function parseCsv(content: string): ParsedRow[] {
  // Clean up: strip ;; line endings and unwrap whole-line quotes (Discogs inventory export quirk)
  const cleanedLines = content.split("\n").map((line) => {
    let l = line.trimEnd()
    // Strip trailing ;; (inventory export artifact)
    while (l.endsWith(";;")) l = l.slice(0, -2)
    // Unwrap lines that are entirely quoted: "3472868133,Small Cruel..." → 3472868133,Small Cruel...
    if (l.startsWith('"') && l.endsWith('"') && !l.startsWith('""')) {
      const inner = l.slice(1, -1)
      // Only unwrap if this looks like a full CSV row wrapped in quotes (has many commas)
      if (inner.split(",").length > 5) {
        l = inner.replace(/""/g, '"') // unescape inner double-quotes
      }
    }
    return l
  })
  const cleaned = cleanedLines.join("\n")

  const lines = cleaned.split("\n")
  if (lines.length < 2) return []

  // Parse header
  const headers = parseCSVLine(lines[0])
  const colMap: Record<string, number> = {}
  headers.forEach((h, i) => (colMap[h.trim()] = i))

  // Detect format: Collection export vs Inventory export
  const isInventory = "listing_id" in colMap && "price" in colMap
  const isCollection = "Catalog#" in colMap || "Rating" in colMap

  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = parseCSVLine(line)

    const discogsId = parseInt(cols[colMap["release_id"]] || "", 10)
    if (!discogsId || isNaN(discogsId)) continue

    if (isInventory) {
      // Inventory/Listings export: listing_id, artist, title, label, catno, format, release_id, status, price, ...
      const price = parseFloat(cols[colMap["price"]] || "")
      rows.push({
        artist: (cols[colMap["artist"]] || "").trim(),
        title: (cols[colMap["title"]] || "").trim(),
        catalog_number: (cols[colMap["catno"]] || "").trim(),
        label: (cols[colMap["label"]] || "").trim(),
        format: (cols[colMap["format"]] || "").trim(),
        condition: null, // parsed from media_condition text below
        year: null, // not in inventory export
        discogs_id: discogsId,
        media_condition: (cols[colMap["media_condition"]] || "").trim(),
        sleeve_condition: (cols[colMap["sleeve_condition"]] || "").trim(),
        listing_price: isNaN(price) ? null : price,
        status: (cols[colMap["status"]] || "").trim(),
      })
    } else {
      // Collection export: Catalog#, Artist, Title, Label, Format, Rating, Released, release_id, ...
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
