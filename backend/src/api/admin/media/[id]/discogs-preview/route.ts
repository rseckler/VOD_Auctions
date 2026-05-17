import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { classifyDiscogsFormat } from "../../../../../lib/format-mapping"
import { normalizeCountryToIso } from "../../../../../lib/country-normalize"
import { pickArtistDisplayName, type DiscogsArtistEntry } from "../../../../../lib/artist-display"
import { buildTracklist, type BuiltTrack, type DiscogsTracklistEntry } from "../../../../../lib/discogs-tracklist"

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

// M3 (Codex 2026-05-07): Discogs-Preise (lowest/median/highest/num_for_sale)
// sind aus dem Apply-Diff entfernt. Sie waren im Modal selectable, aber das
// Backend's allowedReleaseFields kennt sie nicht — Apply wäre silent gedroppt
// gewesen. Per Pricing-Modell sind sie sowieso nur Markt-Referenz, keine
// Stammdaten. Falls sie irgendwann persistiert werden sollen, in
// allowedReleaseFields + audit policy aufnehmen und hier wieder reinholen.
//
// rc53.18 (2026-05-10): label_name + gallery_images im Diff. Vorher hat das
// Modal nur 14 Felder gediffed; ein Wechsel zwischen Pressungen mit anderem
// Label / anderen Galerie-Bildern ließ Label und Galerie unverändert. Bei
// Apply triggert label_name den findOrCreateLabelByName-Pfad (lib/label-
// resolver.ts), gallery_images den Galerie-Replace im Apply-Pfad
// (api/admin/media/[id]/route.ts). Cover bleibt eigene Achse via coverImage.
type TrackEntry = BuiltTrack

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
  label_name: string | null
  gallery_images: string[]
  // Fix 2 (2026-05-16): Tracklist als reviewbares Feld. Vorher wurde sie vom
  // Katalog-Discogs-Fetch nie gezogen — nur discogs-import/commit schrieb Tracks.
  tracklist: TrackEntry[]
}

/** Marktpreis-Block — NICHT reviewbar, immer frisch (Markt-Referenz, kein Stammdatum). */
type MarketPrices = {
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
  tracklist?: DiscogsTracklistEntry[]
}

// buildTracklist (inkl. Per-Track-Künstler-Komposition) lebt seit rc71.4 in
// lib/discogs-tracklist.ts — geteilt mit discogs-backfill + discogs-import/commit.

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

// Lokale normalizeCountry() durch shared lib/country-normalize.ts ersetzt (rc54.0).
// Kein Verhaltens-Unterschied — selbe Logik, Single Source of Truth.

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
    .leftJoin("Label", "Release.labelId", "Label.id")
    .where("Release.id", id)
    .select(
      "Release.id",
      "Release.title",
      "Release.artist_display_name",
      "Release.year",
      "Release.country",
      "Release.catalogNumber",
      "Release.barcode",
      "Release.description",
      "Release.format_v2",
      "Release.format_descriptors",
      "Release.genres",
      "Release.styles",
      "Release.credits",
      "Release.coverImage",
      "Release.discogs_id",
      "Release.discogs_lowest_price",
      "Release.discogs_median_price",
      "Release.discogs_highest_price",
      "Release.discogs_num_for_sale",
      "Release.labelId",
      pg.raw('"Label"."name" as label_name')
    )
    .first()

  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  // rc53.18: Current Discogs-sourced gallery images (secondaries only).
  // Cover (rang 0 admin_edit OR rang 1 discogs-import primary) is handled via
  // the coverImage field — keep it on its own axis so users can review cover
  // and gallery independently. rc53.18.1 (Codex P2#1): exclude rang=1 too,
  // because discogs-import/commit places the primary image there. Including
  // it here would surface it as a "current gallery image" and the apply path
  // would then DELETE it during gallery replace — wiping the cover row.
  const currentGalleryRows = await pg("Image")
    .where({ releaseId: id, source: "discogs" })
    .andWhere("rang", ">", 1)
    .orderBy("rang", "asc")
    .select("url")
  const currentGalleryUrls = currentGalleryRows.map((r: { url: string }) => r.url)

  // Fix 2 (2026-05-16): aktuelle Tracklist aus der Track-Tabelle für den Diff.
  // rc71.6: artist_name mitlesen, damit der Diff den Per-Track-Künstler erfasst.
  const currentTrackRows = await pg("Track")
    .where({ releaseId: id })
    .orderBy("position", "asc")
    .select("position", "title", "duration", "artist_name")
  const currentTracklist: TrackEntry[] = currentTrackRows.map(
    (t: { position: string | null; title: string | null; duration: string | null; artist_name: string | null }) => ({
      position: t.position || "",
      title: t.title || "",
      duration: t.duration || "",
      artist_name: t.artist_name || null,
    })
  )

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

  // rc53.18: Strip Discogs disambiguator suffix "(N)" from the label name so
  // the find-or-create resolver matches the existing canonical row (e.g.
  // "Mute (3)" → "Mute"). Same convention as ensureLabel in
  // discogs-import/commit/route.ts.
  const rawLabelName = apiData.labels?.[0]?.name?.trim() || null
  const proposedLabelName = rawLabelName ? rawLabelName.replace(/\s*\(\d+\)$/, "").trim() : null

  // rc53.18: Galerie = secondary-Bilder. Primary läuft separat via coverImage,
  // damit Cover- und Galerie-Diff orthogonal bleiben.
  const proposedGalleryUrls = (apiData.images || [])
    .filter((im) => im.type === "secondary" && im.uri)
    .map((im) => im.uri as string)

  const proposed: ProposedFields = {
    discogs_id: discogsId,
    title: apiData.title?.trim() || null,
    // RSE-320: composed display string for multi-artist releases.
    artist_display_name: pickArtistDisplayName(
      apiData.artists_sort || null,
      apiData.artists || null
    ),
    year: typeof apiData.year === "number" && apiData.year > 0 ? apiData.year : null,
    country: normalizeCountryToIso(apiData.country),
    catalogNumber: apiData.labels?.[0]?.catno?.trim() || null,
    barcode: extractBarcode(apiData.identifiers),
    description: apiData.notes?.trim() || null,
    format_v2: formatResult.format,
    format_descriptors: formatResult.descriptors.length > 0 ? formatResult.descriptors : null,
    genres: Array.isArray(apiData.genres) && apiData.genres.length > 0 ? apiData.genres.map(String) : null,
    styles: Array.isArray(apiData.styles) && apiData.styles.length > 0 ? apiData.styles.map(String) : null,
    credits: buildCreditsText(apiData.extraartists),
    coverImage: pickPrimaryImage(apiData.images),
    label_name: proposedLabelName,
    gallery_images: proposedGalleryUrls,
    tracklist: buildTracklist(apiData.tracklist),
  }

  // Fix 1 (2026-05-16): Marketplace-Stats + Price-Suggestions wieder gefetcht.
  // 2026-05-07 ("M3", Codex) waren sie entfernt worden, weil sie im Modal als
  // selektierbares Diff-Feld lagen, das Backend's allowedReleaseFields sie aber
  // nicht kannte → silent dropped. Lösung jetzt: sie sind KEIN Diff-Feld mehr
  // (Markt-Referenz, kein Stammdatum, kein Review-Checkbox), kommen als eigenes
  // `market`-Objekt zurück und werden von allowedReleaseFields akzeptiert.
  // Ohne diesen Fetch blieben discogs_*_price bei frisch verlinkten Releases
  // bis zum nächsten discogs_daily_sync.py-Cron NULL → der Inventory-Process
  // blendete den Markt-Block aus.
  const market: MarketPrices = {
    discogs_lowest_price: null,
    discogs_median_price: null,
    discogs_highest_price: null,
    discogs_num_for_sale: null,
  }
  try {
    const statsResp = await fetch(`https://api.discogs.com/marketplace/stats/${discogsId}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    })
    if (statsResp.ok) {
      const stats = await statsResp.json()
      const lp = stats.lowest_price
      if (lp && typeof lp === "object" && lp.value != null) {
        market.discogs_lowest_price = Number(lp.value)
      } else if (lp != null) {
        market.discogs_lowest_price = Number(lp)
      }
      market.discogs_num_for_sale = stats.num_for_sale || 0
    }
  } catch {
    // non-critical
  }
  try {
    const suggResp = await fetch(`https://api.discogs.com/marketplace/price_suggestions/${discogsId}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    })
    if (suggResp.ok) {
      const sugg = await suggResp.json()
      const prices: number[] = []
      for (const info of Object.values(sugg) as Array<{ value?: number }>) {
        if (info && typeof info === "object" && info.value != null) {
          const v = Number(info.value)
          if (!isNaN(v)) prices.push(v)
        }
      }
      if (prices.length > 0) {
        prices.sort((a, b) => a - b)
        const n = prices.length
        const median = n % 2 === 1 ? prices[(n - 1) / 2] : (prices[n / 2 - 1] + prices[n / 2]) / 2
        market.discogs_median_price = Number(median.toFixed(2))
        market.discogs_highest_price = Number(prices[n - 1].toFixed(2))
      }
    }
  } catch {
    // non-critical
  }

  // Build current snapshot in same shape
  const current: ProposedFields = {
    discogs_id: release.discogs_id ?? null,
    title: release.title ?? null,
    artist_display_name: release.artist_display_name ?? null,
    year: release.year ?? null,
    // rc54.0: current ebenfalls durch Normalizer → verhindert False-Positive-
    // Diffs während der Transition. Beispiel: DB hat noch "UK" (alt), API
    // liefert "UK" → beide → "GB" → Diff korrekt als "unchanged" markiert.
    country: normalizeCountryToIso(release.country),
    catalogNumber: release.catalogNumber ?? null,
    barcode: release.barcode ?? null,
    description: release.description ?? null,
    format_v2: release.format_v2 ?? null,
    format_descriptors: Array.isArray(release.format_descriptors) ? release.format_descriptors : null,
    genres: Array.isArray(release.genres) ? release.genres : null,
    styles: Array.isArray(release.styles) ? release.styles : null,
    credits: release.credits ?? null,
    coverImage: release.coverImage ?? null,
    label_name: release.label_name ?? null,
    gallery_images: currentGalleryUrls,
    tracklist: currentTracklist,
  }

  // Diff: only fields where current !== proposed
  const isEqual = (a: unknown, b: unknown): boolean => {
    if (a === b) return true
    if (a == null && b == null) return true
    if (a == null || b == null) return false
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      // Fix 2 (2026-05-16): rekursiv vergleichen — die Tracklist ist ein Array
      // von Objekten, `v === b[i]` (Referenz-Gleichheit) würde sie IMMER als
      // geändert markieren. String-Arrays (genres/styles/gallery) bleiben
      // unverändert, da `v === b[i]` für Strings sauber greift.
      return a.every((v, i) => isEqual(v, b[i]))
    }
    return JSON.stringify(a) === JSON.stringify(b)
  }

  const diff: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of Object.keys(proposed) as Array<keyof ProposedFields>) {
    if (!isEqual(current[key], proposed[key])) {
      diff[key] = { from: current[key], to: proposed[key] }
    }
  }

  // F1 (Codex-Review 2026-05-16): eine LEERE Discogs-Tracklist NIE als Diff
  // vorschlagen. Sonst stünde im Review-Modal ein per Default angehakter
  // "12 Tracks → 0"-Diff, dessen Apply den Track-Replace-Pfad erreicht und die
  // vorhandene Tracklist löscht (DELETE + 0 Inserts). Liefert Discogs keine
  // verwertbare Tracklist (leer / nur heading/index-Einträge), ist das kein
  // Vorschlag — bestehende Tracks bleiben unangetastet.
  if (diff.tracklist && (!Array.isArray(proposed.tracklist) || proposed.tracklist.length === 0)) {
    delete diff.tracklist
  }

  res.json({
    discogs_id: discogsId,
    current,
    proposed,
    diff,
    has_changes: Object.keys(diff).length > 0,
    // Fix 1: Marktpreise — nicht im Diff, werden beim Apply immer mitgeschrieben.
    market,
  })
}
