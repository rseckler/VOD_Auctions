/**
 * Discogs-Tracklist — Shared Builder.
 *
 * Single Source of Truth für das Übersetzen einer Discogs-`tracklist` in unsere
 * `Track`-Rows. Genutzt von:
 *   - `api/admin/media/[id]/discogs-preview` (Katalog/Inventory-Refetch)
 *   - `lib/discogs-backfill.ts`               (Backfill-Tool)
 *   - `api/admin/discogs-import/commit`       (Bulk-Import)
 *
 * **Per-Track-Künstler (rc71.6):** Bei Compilations liefert Discogs pro Track ein
 * eigenes `artists[]`-Array. `buildTracklist` gibt den Künstler **strukturiert**
 * als `artist_name` zurück (`title` bleibt der reine Songtitel) — geschrieben in
 * die `Track.artist_name`-Spalte. Damit ist der Künstler suchbar (Meili-Index)
 * und klickbar (Storefront-Link, slug read-time aufgelöst).
 *
 * Historie: rc71.4 hatte den Künstler noch als `"Artist – Titel"` in `title`
 * gebacken — das machte ihn zwar sichtbar, aber nicht suchbar/verlinkbar.
 * rc71.6 macht ihn zu einem eigenen Feld. Konzept:
 * docs/optimizing/TRACK_ARTIST_STRUKTURIERT_KONZEPT.md
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

export type BuiltTrack = {
  position: string
  title: string
  duration: string
  /** Per-Track-Künstler (Compilations) — null bei Single-Artist-Alben. */
  artist_name: string | null
}

/** En-Dash mit Spaces — Anzeige-Separator "Artist – Titel" (Storefront/Modal). */
export const TRACK_ARTIST_SEP = " – "

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
 * Einträge (Werk-/Akt-Überschriften). `title` ist der reine Songtitel; der
 * Per-Track-Künstler kommt strukturiert in `artist_name` (null bei Tracks ohne
 * eigene `artists` = Single-Artist-Album, dort gilt der Release-Künstler).
 */
export function buildTracklist(
  raw: DiscogsTracklistEntry[] | null | undefined
): BuiltTrack[] {
  if (!raw || raw.length === 0) return []
  return raw
    .filter((t) => (t.type_ ? t.type_ === "track" : true) && !!t.title?.trim())
    .map((t) => ({
      position: (t.position || "").trim(),
      title: (t.title || "").trim(),
      duration: (t.duration || "").trim(),
      artist_name: composeTrackArtist(t.artists),
    }))
}
