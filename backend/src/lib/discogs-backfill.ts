/**
 * Discogs-Metadaten-Backfill — Shared Lib.
 *
 * Versorgt das Review-Tool (`/admin/discogs-backfill/*`) mit dem Discogs-Fetch
 * + den Normalisierungs-Helpern. Scope: Genres, Styles, Credits, Tracklist —
 * KEINE Marktpreise (die deckt der discogs_daily_sync.py-Cron ab).
 *
 * Konzept: docs/optimizing/DISCOGS_BACKFILL_TOOL_KONZEPT.md
 */

export type BackfillTrack = { position: string; title: string; duration: string }

export type BackfillProposed = {
  genres: string[] | null
  styles: string[] | null
  credits: string | null
  tracklist: BackfillTrack[]
}

type DiscogsRelease = {
  genres?: string[]
  styles?: string[]
  extraartists?: Array<{ name?: string; role?: string }>
  tracklist?: Array<{ position?: string; type_?: string; title?: string; duration?: string }>
}

/** Baut den Credits-Text aus Discogs `extraartists` (Rolle: Namen, …). */
export function buildCreditsText(extraartists: DiscogsRelease["extraartists"]): string | null {
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

/** Normalisiert die Discogs-Tracklist; verwirft heading/index-Einträge. */
export function buildTracklist(raw: DiscogsRelease["tracklist"]): BackfillTrack[] {
  if (!raw?.length) return []
  return raw
    .filter((t) => (t.type_ ? t.type_ === "track" : true) && !!t.title?.trim())
    .map((t) => ({
      position: (t.position || "").trim(),
      title: (t.title || "").trim(),
      duration: (t.duration || "").trim(),
    }))
}

/**
 * Zieht eine Discogs-Release und gibt die backfill-relevanten Felder zurück.
 * Wirft bei HTTP-Fehler / Timeout — der Caller markiert die Zeile dann als `error`.
 */
export async function fetchDiscogsRelease(discogsId: number): Promise<BackfillProposed> {
  const token = process.env.DISCOGS_TOKEN
  if (!token) throw new Error("DISCOGS_TOKEN not configured on backend")

  const resp = await fetch(`https://api.discogs.com/releases/${discogsId}`, {
    headers: {
      Authorization: `Discogs token=${token}`,
      "User-Agent": "VODAuctions/1.0 +https://vod-auctions.com",
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) {
    throw new Error(`Discogs API ${resp.status} for release ${discogsId}`)
  }
  const data = (await resp.json()) as DiscogsRelease

  const genres =
    Array.isArray(data.genres) && data.genres.length > 0
      ? data.genres.map((g) => String(g))
      : null
  const styles =
    Array.isArray(data.styles) && data.styles.length > 0
      ? data.styles.map((s) => String(s))
      : null

  return {
    genres,
    styles,
    credits: buildCreditsText(data.extraartists),
    tracklist: buildTracklist(data.tracklist),
  }
}
