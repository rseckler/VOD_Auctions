/**
 * Format Display Helper (Storefront)
 *
 * Spiegel zur Backend-Lib `backend/src/lib/format-mapping.ts`. Storefront
 * lädt nur das Display-Mapping (interner URL-safe-Wert → human-readable
 * String mit Inch-Quotes). Whitelist-Validierung findet im Backend statt.
 */

const FORMAT_DISPLAY: Record<string, string> = {
  "Vinyl-LP": "Vinyl LP",
  "Vinyl-LP-2": "2× Vinyl LP",
  "Vinyl-LP-3": "3× Vinyl LP",
  "Vinyl-LP-4": "4× Vinyl LP",
  "Vinyl-LP-5": "5× Vinyl LP",
  "Vinyl-LP-6": "6× Vinyl LP",
  "Vinyl-LP-7": "7× Vinyl LP",
  "Vinyl-LP-8": "8× Vinyl LP",
  "Vinyl-LP-9": "9× Vinyl LP",
  "Vinyl-LP-10": "10× Vinyl LP",
  "Vinyl-LP-11": "11× Vinyl LP",
  "Vinyl-LP-12": "12× Vinyl LP",
  "Vinyl-7-Inch": 'Vinyl 7"',
  "Vinyl-7-Inch-2": '2× Vinyl 7"',
  "Vinyl-7-Inch-3": '3× Vinyl 7"',
  "Vinyl-7-Inch-4": '4× Vinyl 7"',
  "Vinyl-7-Inch-5": '5× Vinyl 7"',
  "Vinyl-7-Inch-10": '10× Vinyl 7"',
  "Vinyl-10-Inch": 'Vinyl 10"',
  "Vinyl-10-Inch-2": '2× Vinyl 10"',
  "Vinyl-10-Inch-3": '3× Vinyl 10"',
  "Vinyl-10-Inch-4": '4× Vinyl 10"',
  "Vinyl-12-Inch": 'Vinyl 12"',
  "Vinyl-12-Inch-2": '2× Vinyl 12"',
  "Vinyl-12-Inch-3": '3× Vinyl 12"',
  "Vinyl-12-Inch-4": '4× Vinyl 12"',
  "Vinyl-12-Inch-12": '12× Vinyl 12"',
  Flexi: "Flexi-Disc",
  "Lathe-Cut": "Lathe Cut",
  "Lathe-Cut-2": "2× Lathe Cut",
  Acetate: "Acetate",
  Shellac: "Shellac (78 RPM)",
  Tape: "Tape",
  "Tape-2": "2× Tape",
  "Tape-3": "3× Tape",
  "Tape-4": "4× Tape",
  "Tape-5": "5× Tape",
  "Tape-6": "6× Tape",
  "Tape-7": "7× Tape",
  "Tape-8": "8× Tape",
  "Tape-10": "10× Tape",
  "Tape-12": "12× Tape",
  "Tape-26": "26× Tape",
  "Tape-32": "32× Tape",
  Tapes: "Tapes (Multi)",
  Reel: "Reel-To-Reel",
  "Reel-2": "2× Reel-To-Reel",
  CD: "CD",
  "CD-2": "2× CD",
  "CD-3": "3× CD",
  "CD-4": "4× CD",
  "CD-5": "5× CD",
  "CD-8": "8× CD",
  "CD-10": "10× CD",
  "CD-16": "16× CD",
  CDr: "CDr (Recordable)",
  "CDr-2": "2× CDr",
  CDV: "CD-Video",
  VHS: "VHS",
  DVD: "DVD",
  DVDr: "DVDr (Recordable)",
  "Blu-ray": "Blu-ray",
  File: "File (Download)",
  "Memory-Stick": "Memory Stick",
  Magazin: "Magazin",
  Photo: "Photo",
  Postcard: "Postcard",
  Poster: "Poster",
  Book: "Book",
  "T-Shirt": "T-Shirt",
  Other: "Other",
}

export function displayFormat(v: string | null | undefined): string {
  if (!v) return ""
  return FORMAT_DISPLAY[v] || v
}

/**
 * Picks the best available format string from a release object.
 * Priority: format_v2 (with display mapping) → format_name → format → empty
 */
export function pickFormatLabel(r: {
  format_v2?: string | null
  format_name?: string | null
  format?: string | null
}): string {
  if (r.format_v2) return displayFormat(r.format_v2)
  return r.format_name || r.format || ""
}
