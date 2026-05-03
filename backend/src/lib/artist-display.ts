/**
 * RSE-320: Display-string composition for multi-artist Discogs releases.
 *
 * Discogs models artists as an ordered list with per-link rendering hints (anv, join).
 * Our schema has Release.artistId as a single-FK ("first primary"), so the display
 * string for releases like "Paul Bley, Charlie Mingus, Art Blakey" needs to be
 * composed and stored in Release.artist_display_name (NULL when the single Artist.name
 * is sufficient).
 *
 * See: docs/operations/RSE-320_DISCOGS_MULTI_ARTIST_BRIEFING.md
 */

export type DiscogsArtistEntry = {
  name?: string | null
  id?: number | null
  anv?: string | null
  join?: string | null
}

/**
 * Compose a display string from a Discogs `artists[]` array.
 *
 * Strips Discogs's disambiguation suffix `(N)` from names. Uses `anv` (artist name
 * variant) when set — that's the form printed on this specific release cover. Joins
 * with the per-entry `join` separator. Trailing `join` on the last entry is ignored.
 *
 * Examples:
 *   [{name: "Paul Bley", join: ","}, {name: "Charles Mingus", anv: "Charlie Mingus", join: ","}, {name: "Art Blakey", join: ""}]
 *     → "Paul Bley, Charlie Mingus, Art Blakey"
 *
 *   [{name: "Coil", join: "&"}, {name: "Current 93", join: ""}]
 *     → "Coil & Current 93"
 *
 * Returns null when artists is empty or has only one entry without an anv-variant
 * (caller should fall back to Artist.name in that case — the canonical record stays
 * the source of truth).
 */
export function composeArtistDisplayName(
  artists: DiscogsArtistEntry[] | null | undefined
): string | null {
  if (!artists || artists.length === 0) return null

  // Single-artist case: only return a display string when anv differs from name.
  // Otherwise the canonical Artist.name is sufficient — keep display_name NULL.
  if (artists.length === 1) {
    const a = artists[0]
    const name = stripSuffix(a.name || "")
    const anv = stripSuffix(a.anv || "")
    if (anv && anv !== name) return anv
    return null
  }

  // Multi-artist: compose with per-entry anv + join separator.
  let out = ""
  for (let i = 0; i < artists.length; i++) {
    const a = artists[i]
    const display = stripSuffix(a.anv || a.name || "")
    if (!display) continue
    out += display
    // Use the entry's own join separator to the next entry. Last entry's join is ignored.
    if (i < artists.length - 1) {
      const sep = (a.join || "").trim()
      if (sep === "" || sep === ",") {
        out += ", "
      } else if (sep === "&" || sep === "/" || sep === "Vs." || sep === "Vs" || sep === "vs.") {
        out += ` ${sep} `
      } else {
        // Free-form joiners like "Featuring", "Pres.", "Meets" — pad with spaces.
        out += ` ${sep} `
      }
    }
  }
  const trimmed = out.trim().replace(/\s+/g, " ")
  return trimmed || null
}

/**
 * Strip Discogs disambiguation suffix `(N)`. "Conrad (3)" → "Conrad".
 */
function stripSuffix(name: string): string {
  return name.replace(/\s*\(\d+\)$/, "").trim()
}

/**
 * Pick the best display name from a Discogs API response.
 *
 * Priority:
 *   1. Composed from `artists[]` via composeArtistDisplayName (uses anv → matches release cover)
 *   2. `artists_sort` from Discogs (canonical names — fallback only when artists[] empty)
 *   3. NULL (single-artist without anv-variant — caller uses Artist.name fallback)
 *
 * Note: Discogs's `artists_sort` uses canonical Artist.name (e.g. "Charles Mingus"),
 * not the per-release anv variant (e.g. "Charlie Mingus" as printed on the cover).
 * Our composed string preserves the anv form, so it's preferred for display fidelity.
 */
export function pickArtistDisplayName(
  artistsSort: string | null | undefined,
  artists: DiscogsArtistEntry[] | null | undefined
): string | null {
  const composed = composeArtistDisplayName(artists)
  if (composed) return composed
  // Fallback: artists[] empty/unusable but artists_sort present (rare).
  if (artistsSort && artistsSort.trim()) {
    return stripSuffix(artistsSort.trim())
  }
  return null
}
