import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { classifyDiscogsFormat } from "../../../../../lib/format-mapping"
import { findCountryByName, isValidIsoCode } from "../../../../../admin/data/country-iso"
import { pickArtistDisplayName, type DiscogsArtistEntry } from "../../../../../lib/artist-display"

/**
 * POST /admin/media/:id/discogs-preview
 *
 * Fetches Discogs metadata for a candidate discogs_id WITHOUT writing.
 * Returns current vs proposed values for each Stammdaten field so the FE
 * can show a review modal and let Frank apply changes selectively.
 *
 * Body: { discogs_id: number }
 *
 * Frank-Workflow (rc51.9.2): when correcting a wrong discogs_id link, fetch
 * fresh data, review what would change, then confirm. Avoids silent
 * overwrites of manually-edited title/year/country/etc.
 */

type ProposedFields = {
  discogs_id: number | null
  title: string | null
  artist_display_name: string | null
  year: number | null
  country: string | null
  catalogNumber: string | null
  barcode: string | null
  description: string | null
  format_v2: string | null
  format_descriptors: string[] | null
  genres: string[] | null
  styles: string[] | null
  credits: string | null
  coverImage: string | null
  discogs_lowest_price: number | null
  discogs_median_price: number | null
  discogs_highest_price: number | null
  discogs_num_for_sale: number | null
}

type DiscogsApiData = {
  title?: string
  year?: number
  country?: string
  notes?: string
  genres?: string[]
  styles?: string[]
  formats?: Array<{ name?: string; descriptions?: string[]; qty?: string }>
  identifiers?: Array<{ type?: string; value?: string }>
  labels?: Array<{ name?: string; catno?: string }>
  artists?: DiscogsArtistEntry[]
  artists_sort?: string
  extraartists?: Array<{ name?: string; role?: string }>
  images?: Array<{ type?: string; uri?: string; uri150?: string }>
}

/** Picks the Discogs primary image URL (first `type:primary`, fallback first image). */
function pickPrimaryImage(images: DiscogsApiData["images"]): string | null {
  if (!images?.length) return null
  const primary = images.find((i) => i.type === "primary")
  return primary?.uri || images[0]?.uri || null
}

function buildCreditsText(extraartists: DiscogsApiData["extraartists"]): string | null {
  if (!extraartists?.length) return null
  const byRole = new Map<string, string[]>()
  for (const ea of extraartists) {
    if (!ea.name || !ea.role) continue
    const name = ea.name.replace(/\s*\(\d+\)$/, "")
    if (!byRole.has(ea.role)) byRole.set(ea.role, [])
    byRole.get(ea.role)!.push(name)
  }
  if (byRole.size === 0) return null
  return Array.from(byRole.entries())
    .map(([role, names]) => `${role}: ${names.join(", ")}`)
    .join("\n")
}

function extractBarcode(identifiers: DiscogsApiData["identifiers"]): string | null {
  if (!identifiers?.length) return null
  const barcode = identifiers.find((i) => i.type?.toLowerCase() === "barcode")
  if (!barcode?.value) return null
  // Strip non-digits — Discogs sometimes formats as "5 053760 049005"
  const digits = barcode.value.replace(/\D/g, "")
  if (![8, 12, 13].includes(digits.length)) return null
  return digits
}

function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (raw.length === 2 && isValidIsoCode(raw)) return raw.toUpperCase()
  const found = findCountryByName(raw)
  return found?.code ?? null
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params
  const body = (req.body || {}) as Record<string, unknown>

  const discogsIdRaw = body.discogs_id
  const discogsId = parseInt(String(discogsIdRaw), 10)
  if (!Number.isFinite(discogsId) || discogsId <= 0) {
    res.status(400).json({ message: "discogs_id must be a positive integer" })
    return
  }

  const release = await pg("Release")
    .where("id", id)
    .select(
      "id", "title", "artist_display_name", "year", "country", "catalogNumber", "barcode",
      "description", "format_v2", "format_descriptors", "genres", "styles",
      "credits", "coverImage", "discogs_id", "discogs_lowest_price", "discogs_median_price",
      "discogs_highest_price", "discogs_num_for_sale"
    )
    .first()

  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  const token = process.env.DISCOGS_TOKEN
  if (!token) {
    res.status(500).json({ message: "DISCOGS_TOKEN not configured on backend" })
    return
  }

  const headers = {
    Authorization: `Discogs token=${token}`,
    "User-Agent": "VODAuctions/1.0 +https://vod-auctions.com",
  }

  let apiData: DiscogsApiData
  try {
    const resp = await fetch(`https://api.discogs.com/releases/${discogsId}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) {
      res.status(resp.status).json({
        message: `Discogs API error ${resp.status}`,
        discogs_id: discogsId,
      })
      return
    }
    apiData = (await resp.json()) as DiscogsApiData
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown"
    res.status(502).json({ message: `Discogs API fetch failed: ${msg}` })
    return
  }

  // Build proposed values
  const formatResult = classifyDiscogsFormat(
    (apiData.formats || []).map((f) => ({
      name: f.name || "",
      qty: f.qty || "1",
      descriptions: f.descriptions || [],
    }))
  )

  const proposed: ProposedFields = {
    discogs_id: discogsId,
    title: apiData.title?.trim() || null,
    // RSE-320: composed display string for multi-artist releases.
    artist_display_name: pickArtistDisplayName(
      apiData.artists_sort || null,
      apiData.artists || null
    ),
    year: typeof apiData.year === "number" && apiData.year > 0 ? apiData.year : null,
    country: normalizeCountry(apiData.country),
    catalogNumber: apiData.labels?.[0]?.catno?.trim() || null,
    barcode: extractBarcode(apiData.identifiers),
    description: apiData.notes?.trim() || null,
    format_v2: formatResult.format,
    format_descriptors: formatResult.descriptors.length > 0 ? formatResult.descriptors : null,
    genres: Array.isArray(apiData.genres) && apiData.genres.length > 0 ? apiData.genres.map(String) : null,
    styles: Array.isArray(apiData.styles) && apiData.styles.length > 0 ? apiData.styles.map(String) : null,
    credits: buildCreditsText(apiData.extraartists),
    coverImage: pickPrimaryImage(apiData.images),
    discogs_lowest_price: null,
    discogs_median_price: null,
    discogs_highest_price: null,
    discogs_num_for_sale: null,
  }

  // Marketplace stats (non-critical)
  try {
    const statsResp = await fetch(`https://api.discogs.com/marketplace/stats/${discogsId}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    })
    if (statsResp.ok) {
      const stats = (await statsResp.json()) as {
        lowest_price?: number | { value?: number }
        num_for_sale?: number
      }
      const lp = stats.lowest_price
      if (lp && typeof lp === "object" && lp.value != null) {
        proposed.discogs_lowest_price = Number(lp.value)
      } else if (typeof lp === "number") {
        proposed.discogs_lowest_price = lp
      }
      proposed.discogs_num_for_sale = stats.num_for_sale ?? 0
    }
  } catch {
    // non-critical
  }

  // Price suggestions (non-critical)
  try {
    const suggResp = await fetch(`https://api.discogs.com/marketplace/price_suggestions/${discogsId}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    })
    if (suggResp.ok) {
      const sugg = (await suggResp.json()) as Record<string, { value?: number }>
      const prices: number[] = []
      for (const info of Object.values(sugg)) {
        if (info?.value != null) {
          const v = Number(info.value)
          if (!isNaN(v)) prices.push(v)
        }
      }
      if (prices.length > 0) {
        prices.sort((a, b) => a - b)
        const n = prices.length
        const median = n % 2 === 1 ? prices[(n - 1) / 2] : (prices[n / 2 - 1] + prices[n / 2]) / 2
        proposed.discogs_median_price = Number(median.toFixed(2))
        proposed.discogs_highest_price = Number(prices[n - 1].toFixed(2))
      }
    }
  } catch {
    // non-critical
  }

  // Build current snapshot in same shape
  const current: ProposedFields = {
    discogs_id: release.discogs_id ?? null,
    title: release.title ?? null,
    year: release.year ?? null,
    country: release.country ?? null,
    catalogNumber: release.catalogNumber ?? null,
    barcode: release.barcode ?? null,
    description: release.description ?? null,
    format_v2: release.format_v2 ?? null,
    format_descriptors: Array.isArray(release.format_descriptors) ? release.format_descriptors : null,
    genres: Array.isArray(release.genres) ? release.genres : null,
    styles: Array.isArray(release.styles) ? release.styles : null,
    credits: release.credits ?? null,
    coverImage: release.coverImage ?? null,
    discogs_lowest_price: release.discogs_lowest_price != null ? Number(release.discogs_lowest_price) : null,
    discogs_median_price: release.discogs_median_price != null ? Number(release.discogs_median_price) : null,
    discogs_highest_price: release.discogs_highest_price != null ? Number(release.discogs_highest_price) : null,
    discogs_num_for_sale: release.discogs_num_for_sale ?? null,
  }

  // Diff: only fields where current !== proposed
  const isEqual = (a: unknown, b: unknown): boolean => {
    if (a === b) return true
    if (a == null && b == null) return true
    if (a == null || b == null) return false
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      return a.every((v, i) => v === b[i])
    }
    return JSON.stringify(a) === JSON.stringify(b)
  }

  const diff: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of Object.keys(proposed) as Array<keyof ProposedFields>) {
    if (!isEqual(current[key], proposed[key])) {
      diff[key] = { from: current[key], to: proposed[key] }
    }
  }

  res.json({
    discogs_id: discogsId,
    current,
    proposed,
    diff,
    has_changes: Object.keys(diff).length > 0,
  })
}
