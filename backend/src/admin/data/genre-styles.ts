/**
 * Discogs Top-Level Genres — strict 15-value whitelist.
 * Exactly matches DISTINCT genres present in DB as of 2026-04-25 (52.788 releases).
 */
export const GENRE_VALUES = [
  "Blues",
  "Brass & Military",
  "Children's",
  "Classical",
  "Electronic",
  "Folk, World, & Country",
  "Funk / Soul",
  "Hip Hop",
  "Jazz",
  "Latin",
  "Non-Music",
  "Pop",
  "Reggae",
  "Rock",
  "Stage & Screen",
] as const

export type GenreValue = (typeof GENRE_VALUES)[number]

const GENRE_SET = new Set<string>(GENRE_VALUES)

export function isValidGenre(v: string): v is GenreValue {
  return GENRE_SET.has(v)
}
