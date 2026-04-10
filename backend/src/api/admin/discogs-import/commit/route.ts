import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import * as crypto from "crypto"
import * as fs from "fs"
import * as path from "path"
import { getScriptsDir } from "../../../../lib/paths"
import { sessions, touchSession } from "../upload/route"

// ─── POST /admin/discogs-import/commit ───────────────────────────────────────

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const {
      session_id,
      selected_discogs_ids,
      media_condition = "VG+",
      sleeve_condition = "VG+",
      inventory = 1,
      price_markup = 1.2,
    } = req.body as {
      session_id: string
      selected_discogs_ids?: number[]
      media_condition?: string
      sleeve_condition?: string
      inventory?: number
      price_markup?: number
    }
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

    // Set up SSE for live progress
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()

    const sendEvent = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
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

    // Load matching data
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

    // Filter by selection if provided
    const selectedSet = selected_discogs_ids
      ? new Set(selected_discogs_ids)
      : null
    const totalToProcess = selectedSet ? selectedSet.size : session.rows.length
    let processedCount = 0

    for (const row of session.rows) {
      const did = row.discogs_id
      const cached = apiCache[String(did)] as Record<string, unknown> | undefined

      // Skip if not in selection
      if (selectedSet && !selectedSet.has(did)) {
        counters.skipped++
        continue
      }

      if (cached?.error) {
        counters.skipped++
        continue
      }

      const community = (cached?.community || {}) as { have?: number; want?: number }
      const suggestedPrices = (cached?.suggested_prices || null) as Record<string, unknown> | null

      // Calculate estimated_value: VG+ suggested price × markup (default 1.2)
      const vgPlusPrice = suggestedPrices?.["VG+"] as number | null
      const estimatedValue = vgPlusPrice
        ? Math.round(vgPlusPrice * price_markup * 100) / 100
        : null

      // Build price history entry
      const priceEntry = {
        date: now,
        source: "discogs_collection_import",
        lowest: (cached?.lowest_price as number) ?? null,
        median: null,
        highest: null,
        suggested_vgplus: vgPlusPrice,
        estimated_value: estimatedValue,
        num_for_sale: (cached?.num_for_sale as number) ?? 0,
        have: community.have ?? 0,
        want: community.want ?? 0,
      }

      try {
        if (existingByDiscogs[String(did)]) {
          // ── EXISTING — update prices + suggested + estimated (NEVER direct_price) ──
          const dbId = existingByDiscogs[String(did)]
          await pgConnection.raw(
            `UPDATE "Release" SET
              discogs_lowest_price = ?,
              discogs_num_for_sale = ?,
              discogs_have = ?,
              discogs_want = ?,
              discogs_last_synced = ?,
              discogs_suggested_prices = COALESCE(?::jsonb, discogs_suggested_prices),
              estimated_value = COALESCE(?, estimated_value),
              genres = COALESCE(?, genres),
              styles = COALESCE(?, styles),
              discogs_price_history = COALESCE(discogs_price_history, '[]'::jsonb) || ?::jsonb,
              "updatedAt" = NOW()
            WHERE id = ?`,
            [
              priceEntry.lowest,
              priceEntry.num_for_sale,
              priceEntry.have,
              priceEntry.want,
              now,
              suggestedPrices ? JSON.stringify({ ...suggestedPrices, fetched_at: now }) : null,
              estimatedValue,
              cached?.genres ? (cached.genres as string[]) : null,
              cached?.styles ? (cached.styles as string[]) : null,
              JSON.stringify([priceEntry]),
              dbId,
            ]
          )
          await logImport(pgConnection, runId, session, dbId, did, "updated", row, cached)
          counters.updated++

        } else {
          const key = fuzzyKey(row.artist, row.title, row.catalog_number)
          if (key && fuzzyIndex.has(key)) {
            // ── LINKABLE — add discogs_id + prices + suggested + estimated (NEVER direct_price) ──
            const dbId = fuzzyIndex.get(key)!
            await pgConnection.raw(
              `UPDATE "Release" SET
                discogs_id = ?,
                discogs_lowest_price = ?,
                discogs_num_for_sale = ?,
                discogs_have = ?,
                discogs_want = ?,
                discogs_last_synced = ?,
                discogs_suggested_prices = COALESCE(?::jsonb, discogs_suggested_prices),
                estimated_value = COALESCE(?, estimated_value),
                genres = COALESCE(?, genres),
                styles = COALESCE(?, styles),
                description = COALESCE(description, ?),
                discogs_price_history = COALESCE(discogs_price_history, '[]'::jsonb) || ?::jsonb,
                "updatedAt" = NOW()
              WHERE id = ?`,
              [
                did,
                priceEntry.lowest,
                priceEntry.num_for_sale,
                priceEntry.have,
                priceEntry.want,
                now,
                suggestedPrices ? JSON.stringify({ ...suggestedPrices, fetched_at: now }) : null,
                estimatedValue,
                cached?.genres ? (cached.genres as string[]) : null,
                cached?.styles ? (cached.styles as string[]) : null,
                (cached?.notes as string) || null,
                JSON.stringify([priceEntry]),
                dbId,
              ]
            )
            await logImport(pgConnection, runId, session, dbId, did, "linked", row, cached)
            counters.linked++

          } else {
            // ── NEW — full insert with all enriched data ──
            const releaseId = `discogs-release-${did}`
            const artistId = await ensureArtist(pgConnection, row.artist, cached)
            const labelId = await ensureLabel(pgConnection, row.label, cached)
            const formatResult = mapDiscogsFormat(cached)
            const formatDetail = getFormatDetail(cached)
            const creditsText = buildCreditsText(cached)
            const additionalLabels = getAdditionalLabels(cached)

            // NOTE: direct_price is NEVER set by the importer (see PRICING_KONZEPT.md)
            // Only estimated_value (= VG+ × markup) is set as a suggestion
            await pgConnection.raw(
              `INSERT INTO "Release" (
                id, title, slug, "artistId", "labelId",
                "catalogNumber", year, country, format_group, legacy_format_detail,
                description, credits, genres, styles,
                media_condition, sleeve_condition, inventory,
                estimated_value, discogs_suggested_prices,
                discogs_id, discogs_lowest_price, discogs_num_for_sale,
                discogs_have, discogs_want, discogs_last_synced,
                discogs_price_history, additional_labels, data_source,
                product_category, "createdAt", "updatedAt"
              ) VALUES (
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?::jsonb,
                ?, ?, ?,
                ?, ?, ?,
                ?::jsonb, ?::jsonb, 'discogs_import',
                'release', NOW(), NOW()
              )
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
                formatResult,
                formatDetail,
                (cached?.notes as string) || null,
                creditsText,
                cached?.genres ? (cached.genres as string[]) : null,
                cached?.styles ? (cached.styles as string[]) : null,
                media_condition,
                sleeve_condition,
                inventory,
                estimatedValue,
                suggestedPrices ? JSON.stringify({ ...suggestedPrices, fetched_at: now }) : null,
                did,
                priceEntry.lowest,
                priceEntry.num_for_sale,
                priceEntry.have,
                priceEntry.want,
                now,
                JSON.stringify([priceEntry]),
                additionalLabels ? JSON.stringify(additionalLabels) : null,
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

            // Credits → ReleaseArtist with roles
            const extraartists = (cached?.extraartists || []) as Array<{
              name?: string
              id?: number
              role?: string
            }>
            for (const ea of extraartists) {
              if (!ea.name || !ea.id) continue
              const eaId = await ensureArtistByDiscogs(pgConnection, ea)
              if (eaId) {
                await pgConnection.raw(
                  `INSERT INTO "ReleaseArtist" (id, "releaseId", "artistId", role, "createdAt")
                  VALUES (?, ?, ?, ?, NOW()) ON CONFLICT ("releaseId", "artistId") DO NOTHING`,
                  [`dra-${did}-${ea.id}`, releaseId, eaId, ea.role || "performer"]
                )
              }
            }

            // Images → Image table + coverImage
            const images = (cached?.images || []) as Array<{ uri?: string; type?: string }>
            const maxImages = Math.min(images.length, 5)
            for (let i = 0; i < maxImages; i++) {
              const img = images[i]
              if (!img.uri) continue
              const imageId = `discogs-image-${did}-${i + 1}`
              const rang = i + 1

              // Store Discogs URL directly (R2 upload deferred to batch process)
              await pgConnection.raw(
                `INSERT INTO "Image" (id, url, alt, "releaseId", rang, source, "createdAt")
                VALUES (?, ?, ?, ?, ?, 'discogs', NOW()) ON CONFLICT (id) DO NOTHING`,
                [
                  imageId,
                  img.uri,
                  `${row.artist} — ${row.title}`,
                  releaseId,
                  rang,
                ]
              )

              // Primary image → coverImage
              if (i === 0) {
                await pgConnection.raw(
                  `UPDATE "Release" SET "coverImage" = ? WHERE id = ? AND "coverImage" IS NULL`,
                  [img.uri, releaseId]
                )
              }
            }

            await logImport(pgConnection, runId, session, releaseId, did, "inserted", row, cached)
            counters.inserted++
          }
        }
      } catch (err) {
        console.error(`[discogs-import] Error for discogs:${did}:`, err)
        counters.errors++
      }

      // Send progress event
      processedCount++
      sendEvent({
        type: "progress",
        current: processedCount,
        total: totalToProcess,
        artist: row.artist,
        title: row.title,
      })
    }

    // Send final result
    sendEvent({
      type: "done",
      run_id: runId,
      collection: session.collection,
      ...counters,
    })
    res.end()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Commit failed"
    try {
      res.write(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`)
      res.end()
    } catch {
      // Headers may not have been sent yet
      res.status(500).json({ error: msg })
    }
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
  Shellac: "LP",
  "Lathe Cut": "LP",
  "8-Track Cartridge": "CASSETTE",
  Minidisc: "CD",
}

function mapDiscogsFormat(cached: Record<string, unknown> | undefined): string {
  if (!cached) return "OTHER"
  const formats = cached.formats as Array<{ name?: string }> | undefined
  if (!formats?.length) return "OTHER"
  return FORMAT_MAP[formats[0].name || ""] || "OTHER"
}

function getFormatDetail(cached: Record<string, unknown> | undefined): string | null {
  if (!cached) return null
  const formats = cached.formats as Array<{ name?: string; descriptions?: string[]; qty?: string }> | undefined
  if (!formats?.length) return null
  const f = formats[0]
  const parts = [f.name, ...(f.descriptions || [])].filter(Boolean)
  return parts.length ? parts.join(", ") : null
}

function buildCreditsText(cached: Record<string, unknown> | undefined): string | null {
  if (!cached) return null
  const extraartists = (cached.extraartists || []) as Array<{ name?: string; role?: string }>
  if (!extraartists.length) return null
  // Group by role
  const byRole = new Map<string, string[]>()
  for (const ea of extraartists) {
    if (!ea.name || !ea.role) continue
    const name = ea.name.replace(/\s*\(\d+\)$/, "")
    const role = ea.role
    if (!byRole.has(role)) byRole.set(role, [])
    byRole.get(role)!.push(name)
  }
  return Array.from(byRole.entries())
    .map(([role, names]) => `${role}: ${names.join(", ")}`)
    .join("\n")
}

function getAdditionalLabels(cached: Record<string, unknown> | undefined): Array<{ name: string; catno: string; discogs_id: number }> | null {
  if (!cached) return null
  const labels = (cached.labels || []) as Array<{ name?: string; catno?: string; id?: number }>
  if (labels.length <= 1) return null
  return labels.slice(1).map((l) => ({
    name: (l.name || "").replace(/\s*\(\d+\)$/, ""),
    catno: l.catno || "",
    discogs_id: l.id || 0,
  }))
}

async function ensureArtist(
  pg: Knex,
  name: string,
  cached: Record<string, unknown> | undefined
): Promise<string | null> {
  if (!name) return null
  const artists = (cached?.artists || []) as Array<{ name?: string; id?: number }>
  const discogsArtist = artists[0]
  const artistName = (discogsArtist?.name || name).replace(/\s*\(\d+\)$/, "")
  const slug = slugify(artistName)

  const existing = await pg.raw(`SELECT id FROM "Artist" WHERE slug = ? LIMIT 1`, [slug])
  if (existing.rows.length) return existing.rows[0].id

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

async function ensureArtistByDiscogs(
  pg: Knex,
  ea: { name?: string; id?: number }
): Promise<string | null> {
  if (!ea.name) return null
  const name = ea.name.replace(/\s*\(\d+\)$/, "")
  const slug = slugify(name)

  if (ea.id) {
    const byId = await pg.raw(`SELECT id FROM "Artist" WHERE id = ? LIMIT 1`, [`discogs-artist-${ea.id}`])
    if (byId.rows.length) return byId.rows[0].id
  }

  const existing = await pg.raw(`SELECT id FROM "Artist" WHERE slug = ? LIMIT 1`, [slug])
  if (existing.rows.length) return existing.rows[0].id

  const artistId = ea.id ? `discogs-artist-${ea.id}` : `import-artist-${slug}`
  await pg.raw(
    `INSERT INTO "Artist" (id, name, slug, "createdAt", "updatedAt")
    VALUES (?, ?, ?, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
    [artistId, name, slug]
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
  row: ParsedRow,
  cached?: Record<string, unknown> | null
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
        excel: { artist: row.artist, title: row.title, catalog_number: row.catalog_number, year: row.year, format: row.format },
        api: cached ? {
          title: cached.title,
          year: cached.year,
          country: cached.country,
          genres: cached.genres,
          styles: cached.styles,
          lowest_price: cached.lowest_price,
          num_for_sale: cached.num_for_sale,
          community: cached.community,
          images_count: ((cached.images || []) as unknown[]).length,
          tracks_count: ((cached.tracklist || []) as unknown[]).length,
          credits_count: ((cached.extraartists || []) as unknown[]).length,
          fetched_at: cached.fetched_at,
        } : null,
      }),
    ]
  )
}
