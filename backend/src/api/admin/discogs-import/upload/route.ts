import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as crypto from "crypto"
import * as XLSX from "xlsx"
import type { Knex } from "knex"
import {
  SSEStream,
  compactRow,
  type ParsedRow,
} from "../../../../lib/discogs-import"

// Re-export for legacy callers (other routes still import from here)
export { getSession, updateSession, expandRow, type ParsedRow } from "../../../../lib/discogs-import"

// ─── POST /admin/discogs-import/upload ───────────────────────────────────────
// Supports SSE when client sends `Accept: text/event-stream` header,
// otherwise returns a normal JSON response (backward-compat).

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
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
  const sessionId = crypto.randomUUID()
  const wantsSSE = String(req.headers.accept || "").includes("text/event-stream")

  // For SSE we need a stream instance BEFORE we insert the session (so we can
  // emit parse_start early), but the stream requires a session_id in DB for
  // event persistence. Strategy: insert a minimal session row up front,
  // then update it with results.
  let stream: SSEStream | null = null

  try {
    if (wantsSSE) {
      // Pre-insert a skeleton session so events can be persisted
      await pgConnection.raw(
        `INSERT INTO import_session (id, collection_name, filename, rows, row_count, unique_count, status)
         VALUES (?, ?, ?, '[]'::jsonb, 0, 0, 'uploading')`,
        [sessionId, collection_name, filename]
      )
      stream = new SSEStream(res, pgConnection, sessionId)
      stream.startHeartbeat(5000)
      await stream.emit("upload", "parse_start", {
        session_id: sessionId,
        filename,
        size_bytes: data.length,
      })
    }

    const ext = filename.toLowerCase().split(".").pop() || ""
    let rows: ParsedRow[]

    if (ext === "csv") {
      const content = encoding === "text"
        ? data
        : Buffer.from(data.replace(/^data:[^;]+;base64,/, ""), "base64").toString("utf-8")
      rows = await parseCsv(content, stream)
    } else if (ext === "xlsx" || ext === "xls") {
      const buffer = Buffer.from(data.replace(/^data:[^;]+;base64,/, ""), "base64")
      rows = await parseXlsx(buffer, stream)
    } else {
      if (stream) {
        await stream.error(`Unsupported format: .${ext} (expected .csv or .xlsx)`)
      } else {
        res.status(400).json({ error: `Unsupported format: .${ext} (expected .csv or .xlsx)` })
      }
      return
    }

    if (stream) {
      await stream.emit("upload", "parse_done", {
        rows: rows.length,
      })
    }

    // Deduplicate by discogs_id (keep highest condition)
    const deduped = deduplicate(rows)
    if (stream) {
      await stream.emit("upload", "dedup", {
        before: rows.length,
        after: deduped.length,
        duplicates: rows.length - deduped.length,
      })
    }

    const isInventory = deduped.some((r) => r.listing_price != null || r.media_condition)
    const compactRows = deduped.map(compactRow)

    if (wantsSSE) {
      // Update the existing skeleton session with parsed rows
      await pgConnection.raw(
        `UPDATE import_session SET
          rows = ?::jsonb,
          row_count = ?,
          unique_count = ?,
          format_detected = ?,
          export_type = ?,
          status = 'uploaded',
          updated_at = NOW(),
          last_event_at = NOW()
         WHERE id = ?`,
        [
          JSON.stringify(compactRows),
          rows.length,
          deduped.length,
          ext.toUpperCase(),
          isInventory ? "INVENTORY" : "COLLECTION",
          sessionId,
        ]
      )
    } else {
      // Plain insert
      await pgConnection.raw(
        `INSERT INTO import_session (id, collection_name, filename, rows, row_count, unique_count, format_detected, export_type, status)
         VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?, 'uploaded')`,
        [
          sessionId,
          collection_name,
          filename,
          JSON.stringify(compactRows),
          rows.length,
          deduped.length,
          ext.toUpperCase(),
          isInventory ? "INVENTORY" : "COLLECTION",
        ]
      )
    }

    if (stream) {
      await stream.emit("upload", "session_saved", { session_id: sessionId })
    }

    // Check how many are already in the DB cache
    const cacheResult = await pgConnection.raw(
      `SELECT COUNT(*) as cnt FROM discogs_api_cache
       WHERE discogs_id = ANY(?) AND expires_at > NOW() AND is_error = false`,
      [deduped.map((r) => r.discogs_id)]
    )
    const cachedCount = parseInt(cacheResult.rows?.[0]?.cnt || "0", 10)

    if (stream) {
      await stream.emit("upload", "cache_check", {
        cached: cachedCount,
        to_fetch: deduped.length - cachedCount,
      })
    }

    const result = {
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
        ...(isInventory
          ? {
              listing_price: r.listing_price,
              media_condition: r.media_condition,
              status: r.status,
            }
          : {}),
      })),
    }

    if (stream) {
      await stream.emit("upload", "done", result as unknown as Record<string, unknown>)
      stream.end()
    } else {
      res.json(result)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Upload failed"
    if (stream && !stream.isClosed) {
      await stream.error(msg)
    } else {
      res.status(500).json({ error: msg })
    }
  }
}

// ─── CSV Parser (standard Discogs export with headers) ───────────────────────

async function parseCsv(content: string, stream: SSEStream | null): Promise<ParsedRow[]> {
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
  const estimatedTotal = lines.length - 1

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

    // Emit progress every 1000 rows
    if (stream && rows.length > 0 && rows.length % 1000 === 0) {
      await stream.emit("upload", "parse_progress", {
        rows_parsed: rows.length,
        estimated_total: estimatedTotal,
      })
      // Let the event loop flush
      await new Promise((r) => setTimeout(r, 0))
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

async function parseXlsx(buffer: Buffer, stream: SSEStream | null): Promise<ParsedRow[]> {
  const wb = XLSX.read(buffer, { type: "buffer" })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  const estimatedTotal = rawRows.length

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

    if (stream && rows.length > 0 && rows.length % 1000 === 0) {
      await stream.emit("upload", "parse_progress", {
        rows_parsed: rows.length,
        estimated_total: estimatedTotal,
      })
      await new Promise((r) => setTimeout(r, 0))
    }
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
