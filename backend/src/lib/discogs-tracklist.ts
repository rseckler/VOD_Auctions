/**
 * Discogs-Tracklist — Shared Builder.
 *
 * Single Source of Truth für das Übersetzen einer Discogs-`tracklist` in unsere
 * `Track`-Rows. Genutzt von:
 *   - `api/admin/media/[id]/discogs-preview` (Katalog/Inventory-Refetch)
 *   - `lib/discogs-backfill.ts`               (Backfill-Tool)
 *   - `api/admin/discogs-import/commit`       (Bulk-Import)
 *
 * **Per-Track-Künstler (rc71.4):** Bei Compilations liefert Discogs pro Track ein
 * eigenes `artists[]`-Array. Unsere `Track`-Tabelle hat KEINE Artist-Spalte — die
 * Legacy-tape-mag-Daten haben den Künstler als `"Artist – Titel"` ins `title`-Feld
 * gebacken, und die Storefront rendert `Track.title` direkt. `buildTracklist`
 * komponiert den Künstler daher in den Titel — aber NUR wenn der Track eigene
 * `artists` hat (Single-Artist-Alben bleiben bare, der Release-Künstler gilt).
 *
 * Vorher (rc69.0–rc71.3) zog `buildTracklist` nur position/title/duration → ein
 * Refetch einer Compilation überschrieb `"Algebra Suicide – Somewhat Bleecker
 * Street"` mit `"Somewhat Bleecker Street"`.
 */

export type DiscogsTrackArtist = {
  name?: string | null
  anv?: string | null
  join?: string | null
}

export type DiscogsTracklistEntry = {
  position?: string | null
  type_?: string | null
  title?: string | null
  duration?: string | null
  artists?: DiscogsTrackArtist[] | null
}

export type BuiltTrack = { position: string; title: string; duration: string }

/** En-Dash mit Spaces — exakt die Legacy-tape-mag-Konvention für "Artist – Titel". */
const TRACK_ARTIST_SEP = " – "

/** Discogs-Disambiguierungs-Suffix `(N)` strippen. "Ono (2)" → "Ono". */
function stripSuffix(name: string): string {
  return name.replace(/\s*\(\d+\)$/, "").trim()
}

/**
 * Komponiert den Per-Track-Künstler aus dem Discogs-`artists[]`-Array.
 * Anders als `composeArtistDisplayName` (lib/artist-display.ts) liefert dies auch
 * bei einem einzelnen Künstler den Namen zurück — auf Compilation-Tracks ist ein
 * einzelner Künstler der Normalfall, kein "fällt auf Release-Künstler zurück".
 * Returnt null nur, wenn `artists` leer ist (= Single-Artist-Album-Track).
 */
export function composeTrackArtist(
  artists: DiscogsTrackArtist[] | null | undefined
): string | null {
  if (!artists || artists.length === 0) return null
  let out = ""
  for (let i = 0; i < artists.length; i++) {
    const a = artists[i]
    const display = stripSuffix(a.anv || a.name || "")
    if (!display) continue
    out += display
    if (i < artists.length - 1) {
      const sep = (a.join || "").trim()
      out += sep === "" || sep === "," ? ", " : ` ${sep} `
    }
  }
  const trimmed = out.trim().replace(/\s+/g, " ")
  return trimmed || null
}

/**
 * Normalisiert eine Discogs-`tracklist` zu `Track`-Rows. Verwirft heading/index-
 * Einträge (Werk-/Akt-Überschriften). Bei Tracks mit eigenem `artists[]` wird der
 * Künstler in den Titel komponiert (`"Artist – Titel"`).
 */
export function buildTracklist(
  raw: DiscogsTracklistEntry[] | null | undefined
): BuiltTrack[] {
  if (!raw || raw.length === 0) return []
  return raw
    .filter((t) => (t.type_ ? t.type_ === "track" : true) && !!t.title?.trim())
    .map((t) => {
      const baseTitle = (t.title || "").trim()
      const artist = composeTrackArtist(t.artists)
      return {
        position: (t.position || "").trim(),
        title: artist ? `${artist}${TRACK_ARTIST_SEP}${baseTitle}` : baseTitle,
        duration: (t.duration || "").trim(),
      }
    })
}
