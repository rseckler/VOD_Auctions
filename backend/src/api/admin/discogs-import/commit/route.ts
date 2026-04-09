import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import * as crypto from "crypto"
import * as fs from "fs"
import * as path from "path"
import { getScriptsDir } from "../../../../lib/paths"
import { sessions } from "../upload/route"

// ─── POST /admin/discogs-import/commit ───────────────────────────────────────

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

    const pgConnection: Knex = req.scope.resolve(
      ContainerRegistrationKeys.PG_CONNECTION
    )

    // Ensure import_log table
    await pgConnection.raw(`
      CREATE TABLE IF NOT EXISTS import_log (
        id TEXT PRIMARY KEY,
        import_type TEXT NOT NULL,
        collection_name TEXT,
        import_source TEXT NOT NULL,
        run_id TEXT NOT NULL,
        release_id TEXT,
        discogs_id INTEGER,
        action TEXT NOT NULL,
        data_snapshot JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await pgConnection.raw(`CREATE INDEX IF NOT EXISTS idx_import_log_run ON import_log(run_id)`)
    await pgConnection.raw(`CREATE INDEX IF NOT EXISTS idx_import_log_release ON import_log(release_id)`)
    await pgConnection.raw(`CREATE INDEX IF NOT EXISTS idx_import_log_collection ON import_log(collection_name)`)

    // Re-run analysis to get categorized results
    const dataDir = path.join(getScriptsDir(), "data")
    const existingByDiscogs: Record<string, string> = JSON.parse(
      fs.readFileSync(path.join(dataDir, "db_discogs_ids.json"), "utf-8")
    )
    const unlinkedPath = path.join(dataDir, "db_unlinked_releases.json")
    const unlinked = fs.existsSync(unlinkedPath)
      ? JSON.parse(fs.readFileSync(unlinkedPath, "utf-8"))
      : []

    const fuzzyIndex = new Map<string, string>()
    for (const rel of unlinked) {
      const key = fuzzyKey(rel.artist_name || "", rel.title || "", rel.catalog_number || "")
      if (key) fuzzyIndex.set(key, rel.id)
    }

    const cachePath = path.join(dataDir, "discogs_import_cache.json")
    const apiCache: Record<string, Record<string, unknown>> = fs.existsSync(cachePath)
      ? JSON.parse(fs.readFileSync(cachePath, "utf-8"))
      : {}

    const runId = crypto.randomUUID()
    const now = new Date().toISOString()
    const counters = { inserted: 0, linked: 0, updated: 0, skipped: 0, errors: 0 }

    for (const row of session.rows) {
      const did = row.discogs_id
      const cached = apiCache[String(did)] as Record<string, unknown> | undefined

      if (cached?.error) {
        counters.skipped++
        continue
      }

      const community = (cached?.community || {}) as { have?: number; want?: number }

      try {
        if (existingByDiscogs[String(did)]) {
          // EXISTING — update prices
          const dbId = existingByDiscogs[String(did)]
          await pgConnection.raw(
            `UPDATE "Release" SET
              discogs_lowest_price = ?,
              discogs_num_for_sale = ?,
              discogs_have = ?,
              discogs_want = ?,
              discogs_last_synced = ?,
              "updatedAt" = NOW()
            WHERE id = ?`,
            [
              (cached?.lowest_price as number) ?? null,
              (cached?.num_for_sale as number) ?? 0,
              community.have ?? 0,
              community.want ?? 0,
              now,
              dbId,
            ]
          )
          await logImport(pgConnection, runId, session, dbId, did, "updated", row)
          counters.updated++
        } else {
          const key = fuzzyKey(row.artist, row.title, row.catalog_number)
          if (key && fuzzyIndex.has(key)) {
            // LINKABLE — add discogs_id + prices
            const dbId = fuzzyIndex.get(key)!
            await pgConnection.raw(
              `UPDATE "Release" SET
                discogs_id = ?,
                discogs_lowest_price = ?,
                discogs_num_for_sale = ?,
                discogs_have = ?,
                discogs_want = ?,
                discogs_last_synced = ?,
                "updatedAt" = NOW()
              WHERE id = ?`,
              [
                did,
                (cached?.lowest_price as number) ?? null,
                (cached?.num_for_sale as number) ?? 0,
                community.have ?? 0,
                community.want ?? 0,
                now,
                dbId,
              ]
            )
            await logImport(pgConnection, runId, session, dbId, did, "linked", row)
            counters.linked++
          } else {
            // NEW — full insert
            const releaseId = `discogs-release-${did}`
            const artistId = await ensureArtist(pgConnection, row.artist, cached)
            const labelId = await ensureLabel(pgConnection, row.label, cached)
            const formatGroup = mapDiscogsFormat(cached)

            await pgConnection.raw(
              `INSERT INTO "Release" (
                id, title, slug, "artistId", "labelId",
                "catalogNumber", year, country, format_group,
                discogs_id, discogs_lowest_price, discogs_num_for_sale,
                discogs_have, discogs_want, discogs_last_synced,
                product_category, "createdAt", "updatedAt"
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'release', NOW(), NOW())
              ON CONFLICT (id) DO NOTHING`,
              [
                releaseId,
                (cached?.title as string) || row.title,
                slugify(`${row.artist} ${row.title}`),
                artistId,
                labelId,
                row.catalog_number,
                (cached?.year as number) || row.year,
                (cached?.country as string) || "",
                formatGroup,
                did,
                (cached?.lowest_price as number) ?? null,
                (cached?.num_for_sale as number) ?? 0,
                community.have ?? 0,
                community.want ?? 0,
                now,
              ]
            )

            // Tracklist
            const tracks = (cached?.tracklist || []) as Array<{
              position?: string
              title?: string
              duration?: string
            }>
            for (const track of tracks) {
              if (!track.title) continue
              await pgConnection.raw(
                `INSERT INTO "Track" (id, "releaseId", position, title, duration, "createdAt")
                VALUES (?, ?, ?, ?, ?, NOW()) ON CONFLICT DO NOTHING`,
                [
                  `dt-${did}-${track.position || "0"}`,
                  releaseId,
                  track.position || "",
                  track.title,
                  track.duration || "",
                ]
              )
            }

            await logImport(pgConnection, runId, session, releaseId, did, "inserted", row)
            counters.inserted++
          }
        }
      } catch (err) {
        console.error(`[discogs-import] Error for discogs:${did}:`, err)
        counters.errors++
      }
    }

    res.json({
      run_id: runId,
      collection: session.collection,
      ...counters,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Commit failed"
    res.status(500).json({ error: msg })
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/['".,]/g, "").replace(/\s+/g, " ")
}

function fuzzyKey(artist: string, title: string, catno: string): string | null {
  const a = normalize(artist)
  const t = normalize(title)
  if (!a || !t) return null
  return `${a}|${t}|${normalize(catno)}`
}

function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[-\s]+/g, "-")
    .substring(0, 200)
}

const FORMAT_MAP: Record<string, string> = {
  Vinyl: "LP",
  CD: "CD",
  Cassette: "CASSETTE",
  DVD: "VHS",
  "Blu-ray": "VHS",
  "Box Set": "BOXSET",
  File: "DIGITAL",
  "Reel-To-Reel": "REEL",
}

function mapDiscogsFormat(cached: Record<string, unknown> | undefined): string {
  if (!cached) return "OTHER"
  const formats = cached.formats as Array<{ name?: string }> | undefined
  if (!formats?.length) return "OTHER"
  return FORMAT_MAP[formats[0].name || ""] || "OTHER"
}

async function ensureArtist(
  pg: Knex,
  name: string,
  cached: Record<string, unknown> | undefined
): Promise<string | null> {
  if (!name) return null

  // Try from API data first
  const artists = (cached?.artists || []) as Array<{ name?: string; id?: number }>
  const discogsArtist = artists[0]
  const artistName = (discogsArtist?.name || name).replace(/\s*\(\d+\)$/, "")
  const slug = slugify(artistName)

  // Check existing by slug
  const existing = await pg.raw(`SELECT id FROM "Artist" WHERE slug = ? LIMIT 1`, [slug])
  if (existing.rows.length) return existing.rows[0].id

  // Insert
  const artistId = discogsArtist?.id
    ? `discogs-artist-${discogsArtist.id}`
    : `import-artist-${slug}`
  await pg.raw(
    `INSERT INTO "Artist" (id, name, slug, "createdAt", "updatedAt")
    VALUES (?, ?, ?, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
    [artistId, artistName, slug]
  )
  return artistId
}

async function ensureLabel(
  pg: Knex,
  name: string,
  cached: Record<string, unknown> | undefined
): Promise<string | null> {
  if (!name) return null

  const labels = (cached?.labels || []) as Array<{ name?: string; id?: number }>
  const discogsLabel = labels[0]
  const labelName = (discogsLabel?.name || name).replace(/\s*\(\d+\)$/, "")
  const slug = slugify(labelName)

  const existing = await pg.raw(`SELECT id FROM "Label" WHERE slug = ? LIMIT 1`, [slug])
  if (existing.rows.length) return existing.rows[0].id

  const labelId = discogsLabel?.id
    ? `discogs-label-${discogsLabel.id}`
    : `import-label-${slug}`
  await pg.raw(
    `INSERT INTO "Label" (id, name, slug, "createdAt", "updatedAt")
    VALUES (?, ?, ?, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
    [labelId, labelName, slug]
  )
  return labelId
}

interface ParsedRow {
  artist: string
  title: string
  catalog_number: string
  label: string
  format: string
  condition: number | null
  year: number | null
  discogs_id: number
}

async function logImport(
  pg: Knex,
  runId: string,
  session: { filename: string; collection: string },
  releaseId: string,
  discogsId: number,
  action: string,
  row: ParsedRow
): Promise<void> {
  const logId = `ilog-${runId.substring(0, 8)}-${discogsId}`
  await pg.raw(
    `INSERT INTO import_log (id, import_type, collection_name, import_source, run_id, release_id, discogs_id, action, data_snapshot)
    VALUES (?, 'discogs_collection', ?, ?, ?, ?, ?, ?, ?::jsonb)
    ON CONFLICT (id) DO NOTHING`,
    [
      logId,
      session.collection,
      session.filename,
      runId,
      releaseId,
      discogsId,
      action,
      JSON.stringify({
        artist: row.artist,
        title: row.title,
        catalog_number: row.catalog_number,
        year: row.year,
        format: row.format,
      }),
    ]
  )
}
