/**
 * Format Mapping — Single Source of Truth
 *
 * Decisions (Frank, 2026-04-25):
 * - Internal format values are URL-safe (no quote characters): `Vinyl-7-Inch` instead of `Vinyl-7"`.
 *   Display layer renders `Vinyl 7"` via FORMAT_DISPLAY mapper.
 * - Sub-format tags (Picture Disc, Test Pressing, Limited Edition, Reissue, Stereo, Mono, …)
 *   are stored separately in `Release.format_descriptors jsonb`, NOT as separate format values.
 * - All 71 values exist in the whitelist from day one (Option A) — even those with 0 inventory —
 *   so future Discogs imports never crash on unknown formats.
 *
 * Reference: docs/architecture/FORMAT_MAPPING_ANALYSIS.md, /Users/robin/Downloads/Formate_v4_FINAL.csv
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Whitelist of all valid format values (internal, URL-safe)
// ─────────────────────────────────────────────────────────────────────────────

export const FORMAT_VALUES = [
  // Vinyl LP (12" Album)
  "Vinyl-LP", "Vinyl-LP-2", "Vinyl-LP-3", "Vinyl-LP-4", "Vinyl-LP-5",
  "Vinyl-LP-6", "Vinyl-LP-7", "Vinyl-LP-8", "Vinyl-LP-9", "Vinyl-LP-10",
  "Vinyl-LP-11", "Vinyl-LP-12",
  // Vinyl 7"
  "Vinyl-7-Inch", "Vinyl-7-Inch-2", "Vinyl-7-Inch-3", "Vinyl-7-Inch-4",
  "Vinyl-7-Inch-5", "Vinyl-7-Inch-10",
  // Vinyl 10"
  "Vinyl-10-Inch", "Vinyl-10-Inch-2", "Vinyl-10-Inch-3", "Vinyl-10-Inch-4",
  // Vinyl 12" (Maxi, kein LP) — Boxes erst durch Discogs-Cache-Analyse aufgetaucht
  "Vinyl-12-Inch", "Vinyl-12-Inch-2", "Vinyl-12-Inch-3", "Vinyl-12-Inch-4",
  "Vinyl-12-Inch-12",
  // Vinyl Sonder
  "Flexi", "Lathe-Cut", "Lathe-Cut-2", "Acetate", "Shellac",
  // Cassette
  "Tape", "Tape-2", "Tape-3", "Tape-4", "Tape-5", "Tape-6", "Tape-7",
  "Tape-8", "Tape-10", "Tape-12", "Tape-26", "Tape-32", "Tapes",
  // Reel
  "Reel", "Reel-2",
  // CD
  "CD", "CD-2", "CD-3", "CD-4", "CD-5", "CD-8", "CD-10", "CD-16",
  // CD-Sonder
  "CDr", "CDr-2", "CDV",
  // Video
  "VHS", "DVD", "DVDr", "Blu-ray",
  // Digital
  "File", "Memory-Stick",
  // Literatur
  "Magazin", "Photo", "Postcard", "Poster", "Book", "T-Shirt",
  // Catch-all
  "Other",
] as const

export type FormatValue = (typeof FORMAT_VALUES)[number]

const FORMAT_VALUE_SET = new Set<string>(FORMAT_VALUES)

export function isValidFormat(v: string | null | undefined): v is FormatValue {
  return v != null && FORMAT_VALUE_SET.has(v)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Display strings (human-readable, with `"` for inch sizes)
// ─────────────────────────────────────────────────────────────────────────────

export const FORMAT_DISPLAY: Record<FormatValue, string> = {
  "Vinyl-LP": "Vinyl LP",
  "Vinyl-LP-2": '2× Vinyl LP', "Vinyl-LP-3": '3× Vinyl LP',
  "Vinyl-LP-4": '4× Vinyl LP', "Vinyl-LP-5": '5× Vinyl LP',
  "Vinyl-LP-6": '6× Vinyl LP', "Vinyl-LP-7": '7× Vinyl LP',
  "Vinyl-LP-8": '8× Vinyl LP', "Vinyl-LP-9": '9× Vinyl LP',
  "Vinyl-LP-10": '10× Vinyl LP', "Vinyl-LP-11": '11× Vinyl LP',
  "Vinyl-LP-12": '12× Vinyl LP',
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
  "Tape-2": "2× Tape", "Tape-3": "3× Tape", "Tape-4": "4× Tape",
  "Tape-5": "5× Tape", "Tape-6": "6× Tape", "Tape-7": "7× Tape",
  "Tape-8": "8× Tape", "Tape-10": "10× Tape", "Tape-12": "12× Tape",
  "Tape-26": "26× Tape", "Tape-32": "32× Tape",
  Tapes: "Tapes (Multi)",
  Reel: "Reel-To-Reel",
  "Reel-2": "2× Reel-To-Reel",
  CD: "CD",
  "CD-2": "2× CD", "CD-3": "3× CD", "CD-4": "4× CD", "CD-5": "5× CD",
  "CD-8": "8× CD", "CD-10": "10× CD", "CD-16": "16× CD",
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

export function displayFormat(v: FormatValue | string | null | undefined): string {
  if (!v) return ""
  return isValidFormat(v) ? FORMAT_DISPLAY[v] : v
}

/**
 * Compact display for tight contexts (Brother-QL labels, Mobile, Badges).
 * Drops the "Vinyl " prefix, uses "Format×N" suffix instead of "N× Format".
 * Length goal: ≤8 characters in 95% of cases.
 */
export const FORMAT_DISPLAY_COMPACT: Record<FormatValue, string> = {
  "Vinyl-LP": "LP",
  "Vinyl-LP-2": "LP×2", "Vinyl-LP-3": "LP×3",
  "Vinyl-LP-4": "LP×4", "Vinyl-LP-5": "LP×5",
  "Vinyl-LP-6": "LP×6", "Vinyl-LP-7": "LP×7",
  "Vinyl-LP-8": "LP×8", "Vinyl-LP-9": "LP×9",
  "Vinyl-LP-10": "LP×10", "Vinyl-LP-11": "LP×11",
  "Vinyl-LP-12": "LP×12",
  "Vinyl-7-Inch": '7"',
  "Vinyl-7-Inch-2": '7"×2',
  "Vinyl-7-Inch-3": '7"×3',
  "Vinyl-7-Inch-4": '7"×4',
  "Vinyl-7-Inch-5": '7"×5',
  "Vinyl-7-Inch-10": '7"×10',
  "Vinyl-10-Inch": '10"',
  "Vinyl-10-Inch-2": '10"×2',
  "Vinyl-10-Inch-3": '10"×3',
  "Vinyl-10-Inch-4": '10"×4',
  "Vinyl-12-Inch": '12"',
  "Vinyl-12-Inch-2": '12"×2',
  "Vinyl-12-Inch-3": '12"×3',
  "Vinyl-12-Inch-4": '12"×4',
  "Vinyl-12-Inch-12": '12"×12',
  Flexi: "Flexi",
  "Lathe-Cut": "Lathe",
  "Lathe-Cut-2": "Lathe×2",
  Acetate: "Acet.",
  Shellac: "78rpm",
  Tape: "Tape",
  "Tape-2": "Tape×2", "Tape-3": "Tape×3", "Tape-4": "Tape×4",
  "Tape-5": "Tape×5", "Tape-6": "Tape×6", "Tape-7": "Tape×7",
  "Tape-8": "Tape×8", "Tape-10": "Tape×10", "Tape-12": "Tape×12",
  "Tape-26": "Tape×26", "Tape-32": "Tape×32",
  Tapes: "Tapes",
  Reel: "Reel",
  "Reel-2": "Reel×2",
  CD: "CD",
  "CD-2": "CD×2", "CD-3": "CD×3", "CD-4": "CD×4", "CD-5": "CD×5",
  "CD-8": "CD×8", "CD-10": "CD×10", "CD-16": "CD×16",
  CDr: "CDr",
  "CDr-2": "CDr×2",
  CDV: "CDV",
  VHS: "VHS",
  DVD: "DVD",
  DVDr: "DVDr",
  "Blu-ray": "BluRay",
  File: "File",
  "Memory-Stick": "USB",
  Magazin: "Magazin",
  Photo: "Photo",
  Postcard: "Postcard",
  Poster: "Poster",
  Book: "Book",
  "T-Shirt": "T-Shirt",
  Other: "Other",
}

export function displayFormatCompact(v: FormatValue | string | null | undefined): string {
  if (!v) return ""
  return isValidFormat(v) ? FORMAT_DISPLAY_COMPACT[v] : v
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Storefront filter buckets (format_group)
// ─────────────────────────────────────────────────────────────────────────────

export type FormatGroup =
  | "vinyl" | "tapes" | "cd" | "video" | "digital" | "literature" | "other"

export function toFormatGroup(v: FormatValue): FormatGroup {
  if (v.startsWith("Vinyl-") || v === "Flexi" || v === "Lathe-Cut" ||
      v === "Lathe-Cut-2" || v === "Acetate" || v === "Shellac") return "vinyl"
  if (v.startsWith("Tape") || v === "Reel" || v === "Reel-2") return "tapes"
  if (v.startsWith("CD") || v === "CDr" || v === "CDr-2" || v === "CDV") return "cd"
  if (v === "VHS" || v === "DVD" || v === "DVDr" || v === "Blu-ray") return "video"
  if (v === "File" || v === "Memory-Stick") return "digital"
  if (v === "Magazin" || v === "Photo" || v === "Postcard" || v === "Poster" ||
      v === "Book" || v === "T-Shirt") return "literature"
  return "other"
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tape-mag legacy_id → FormatValue (deterministic, from Format table)
// ─────────────────────────────────────────────────────────────────────────────

export const LEGACY_FORMAT_ID_MAP: Record<number, FormatValue> = {
  // Vinyl-Lp Familie (typ=1, kat=2)
  43: "Vinyl-LP",      // Vinyl-Lp     (1× LP)
  42: "Vinyl-LP-2",    // Vinyl-Lp-2
  44: "Vinyl-LP-3",    // Vinyl-Lp-3
  45: "Vinyl-LP-4",    // Vinyl-Lp-4
  41: "Vinyl-LP-5",    // Vinyl-Lp-5
  49: "Vinyl-LP-6",    // Vinyl-Lp-6
  50: "Vinyl-LP-7",    // Vinyl-Lp-7
  // Vinyl 7"
  46: "Vinyl-7-Inch",
  48: "Vinyl-7-Inch-2",
  51: "Vinyl-7-Inch-3",
  // Vinyl 10" / 12"
  47: "Vinyl-10-Inch",
  52: "Vinyl-10-Inch-2",
  53: "Vinyl-12-Inch",
  // Cassette Familie (typ=1, kat=1)
  5: "Tape",           // Tape (1× Cassette)
  16: "Tape-2", 18: "Tape-3", 20: "Tape-4", 21: "Tape-5",
  23: "Tape-6", 4: "Tape-7", 35: "Tape-8", 15: "Tape-10",
  17: "Tape-26", 19: "Tape-32",
  24: "Tapes",         // generic, qty unknown
  // Sonstige Tonträger
  36: "Reel",
  40: "VHS",           // tape-mag "Video" ist 100% VHS (Frank: 2026-04-25)
  54: "CD",
  // Literatur
  26: "Magazin",       // Mag/Lit typ=4 (Press-Lit)
  27: "Magazin",       // Mag/Lit typ=2 (Band-Lit)
  32: "Magazin",       // Mag/Lit typ=3 (Label-Lit)
  28: "Photo",         // Picture typ=3
  33: "Photo",         // Picture typ=4
  29: "Postcard",
  30: "Poster",        // Poster typ=3
  34: "Poster",        // Poster typ=4
  37: "Book",
  55: "T-Shirt",       // typ=4
  56: "T-Shirt",       // typ=3
}

export function classifyTapeMagFormat(formatId: number | null | undefined): FormatValue {
  if (formatId == null || formatId === 0) return "Other"
  return LEGACY_FORMAT_ID_MAP[formatId] ?? "Other"
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Discogs format → FormatValue (heuristic, with descriptions analysis)
// ─────────────────────────────────────────────────────────────────────────────

type DiscogsFormat = {
  name: string
  qty?: string | number
  descriptions?: string[]
}

export type DiscogsClassifyResult = {
  format: FormatValue
  /** Tags from descriptions that don't influence format value (Picture Disc, Test Pressing, …) */
  descriptors: string[]
  /** Reason for classification — useful for debugging the Backfill */
  reason: string
}

/**
 * Descriptions that are NOT format-relevant — they go into Release.format_descriptors jsonb.
 * Frank (2026-04-25): Picture Disc, Test Pressing, Limited Edition, Reissue etc. are tags.
 */
export const FORMAT_DESCRIPTOR_VALUES = [
  "Album", "Compilation", "Reissue", "Repress", "Limited Edition", "Numbered",
  "Stereo", "Mono", "Quadraphonic", "Picture Disc", "Test Pressing",
  "White Label", "Promo", "Remastered", "Unofficial Release", "Special Edition",
  "Misprint", "Club Edition", "Etched", "Coloured", "Gatefold", "Single Sided",
  "33 ⅓ RPM", "45 RPM", "78 RPM", "Special Cut", "Enhanced", "Copy Protected",
  "Chrome", "Metal", "Dolby B/C", "Dolby System", "Dolby HX", "Dolby HX Pro",
] as const

export type FormatDescriptor = (typeof FORMAT_DESCRIPTOR_VALUES)[number]

const DESCRIPTOR_ONLY = new Set<string>(FORMAT_DESCRIPTOR_VALUES)

export function isValidDescriptor(v: string): v is FormatDescriptor {
  return DESCRIPTOR_ONLY.has(v)
}

/**
 * Grouped format values for the FormatPickerModal — display order matters,
 * the UI renders these as collapsible sections so a long flat list of 71
 * items is browsable. Counts are intentional (LP-12, Tape-32 etc. exist
 * because Discogs has them, even when 0 inventory holds them today).
 */
export const FORMAT_GROUPS: Array<{ label: string; values: readonly FormatValue[] }> = [
  {
    label: "Vinyl LP (12\" Album)",
    values: [
      "Vinyl-LP", "Vinyl-LP-2", "Vinyl-LP-3", "Vinyl-LP-4", "Vinyl-LP-5",
      "Vinyl-LP-6", "Vinyl-LP-7", "Vinyl-LP-8", "Vinyl-LP-9", "Vinyl-LP-10",
      "Vinyl-LP-11", "Vinyl-LP-12",
    ],
  },
  {
    label: "Vinyl 7\"",
    values: [
      "Vinyl-7-Inch", "Vinyl-7-Inch-2", "Vinyl-7-Inch-3", "Vinyl-7-Inch-4",
      "Vinyl-7-Inch-5", "Vinyl-7-Inch-10",
    ],
  },
  {
    label: "Vinyl 10\"",
    values: ["Vinyl-10-Inch", "Vinyl-10-Inch-2", "Vinyl-10-Inch-3", "Vinyl-10-Inch-4"],
  },
  {
    label: "Vinyl 12\" (Maxi-Single, kein LP)",
    values: ["Vinyl-12-Inch", "Vinyl-12-Inch-2", "Vinyl-12-Inch-3", "Vinyl-12-Inch-4", "Vinyl-12-Inch-12"],
  },
  {
    label: "Vinyl Sonderformate",
    values: ["Flexi", "Lathe-Cut", "Lathe-Cut-2", "Acetate", "Shellac"],
  },
  {
    label: "Cassette",
    values: [
      "Tape", "Tape-2", "Tape-3", "Tape-4", "Tape-5", "Tape-6", "Tape-7",
      "Tape-8", "Tape-10", "Tape-12", "Tape-26", "Tape-32", "Tapes",
    ],
  },
  {
    label: "Reel-To-Reel",
    values: ["Reel", "Reel-2"],
  },
  {
    label: "CD",
    values: ["CD", "CD-2", "CD-3", "CD-4", "CD-5", "CD-8", "CD-10", "CD-16", "CDr", "CDr-2", "CDV"],
  },
  {
    label: "Video",
    values: ["VHS", "DVD", "DVDr", "Blu-ray"],
  },
  {
    label: "Digital",
    values: ["File", "Memory-Stick"],
  },
  {
    label: "Literatur / Merch",
    values: ["Magazin", "Photo", "Postcard", "Poster", "Book", "T-Shirt"],
  },
  {
    label: "Catch-all",
    values: ["Other"],
  },
]

/**
 * Format-influencing descriptions (size + sub-type indicators).
 * Order matters: 7" > 10" > 12" > LP > Album fallback.
 */
function detectVinylSize(descs: string[]): "7" | "10" | "12-Maxi" | "LP" | "unspecified" {
  const set = new Set(descs)
  if (set.has('7"')) return "7"
  if (set.has('10"')) return "10"
  // 12" — Album/LP/Mini-Album indikatoren machen es zu LP, sonst Maxi-Single
  const has12 = set.has('12"')
  const isAlbumLike = set.has("LP") || set.has("Album") || set.has("Mini-Album")
  if (has12 && isAlbumLike) return "LP"
  if (has12) return "12-Maxi"
  if (isAlbumLike) return "LP"
  // Sub-type indicators ohne explizite Größe (Frank's CSV defaults):
  if (set.has("EP") || set.has("Single")) return "7"
  if (set.has("Maxi-Single")) return "12-Maxi"
  return "unspecified"
}

function withQty(base: string, qty: number): FormatValue {
  if (qty <= 1) return base as FormatValue
  const candidate = `${base}-${qty}`
  if (FORMAT_VALUE_SET.has(candidate)) return candidate as FormatValue
  // Beyond whitelist — fallback to highest known qty for that family
  // e.g. 13× Cassette doesn't exist as Tape-13, fallback to Tape-32 if reasonable, else Other
  return "Other"
}

const DISCOGS_TOP_LEVEL: Record<string, FormatValue | "VINYL_SUB" | "BOX_CONTAINER"> = {
  Vinyl: "VINYL_SUB",
  Cassette: "Tape",
  CD: "CD",
  CDr: "CDr",
  CDV: "CDV",
  DVD: "DVD",
  DVDr: "DVDr",
  "Blu-ray": "Blu-ray",
  VHS: "VHS",
  "Reel-To-Reel": "Reel",
  "Flexi-disc": "Flexi",
  "Lathe Cut": "Lathe-Cut",
  Acetate: "Acetate",
  Shellac: "Shellac",
  File: "File",
  "Memory Stick": "Memory-Stick",
  "Box Set": "BOX_CONTAINER",
  "All Media": "BOX_CONTAINER",
}

export function classifyDiscogsFormat(formats: DiscogsFormat[]): DiscogsClassifyResult {
  if (!formats || formats.length === 0) {
    return { format: "Other", descriptors: [], reason: "no formats array" }
  }

  // Skip container slots (Box Set / All Media) — take first non-container slot
  let primary: DiscogsFormat | undefined
  let containerHint = ""
  for (const f of formats) {
    const mapped = DISCOGS_TOP_LEVEL[f.name]
    if (mapped === "BOX_CONTAINER") {
      containerHint = f.name
      continue
    }
    primary = f
    break
  }
  if (!primary) {
    return {
      format: "Other",
      descriptors: containerHint ? [containerHint] : [],
      reason: `only container formats: ${containerHint || "unknown"}`,
    }
  }

  const qty = Math.max(1, parseInt(String(primary.qty ?? "1"), 10) || 1)
  const descs = primary.descriptions ?? []
  const topMap = DISCOGS_TOP_LEVEL[primary.name]

  // Vinyl needs sub-format detection from descriptions
  if (topMap === "VINYL_SUB") {
    const size = detectVinylSize(descs)
    let base: string
    if (size === "7") base = "Vinyl-7-Inch"
    else if (size === "10") base = "Vinyl-10-Inch"
    else if (size === "12-Maxi") base = "Vinyl-12-Inch"
    else if (size === "LP") base = "Vinyl-LP"
    else base = "Vinyl-LP" // unspecified default per Frank's CSV

    const fmt = withQty(base, qty)
    const descriptors = descs.filter((d) => DESCRIPTOR_ONLY.has(d))
    return {
      format: fmt,
      descriptors,
      reason: `Vinyl size=${size}, qty=${qty}${containerHint ? `, in ${containerHint}` : ""}`,
    }
  }

  // Direct mapping (Cassette → Tape, CD → CD, etc.)
  if (typeof topMap === "string") {
    const fmt = withQty(topMap, qty)
    const descriptors = descs.filter((d) => DESCRIPTOR_ONLY.has(d))
    return {
      format: fmt,
      descriptors,
      reason: `${primary.name} → ${topMap}, qty=${qty}${containerHint ? `, in ${containerHint}` : ""}`,
    }
  }

  // Unknown Discogs format name (e.g. Microcassette, 8-Track, DAT, MiniDisc, Edison Disc)
  return {
    format: "Other",
    descriptors: descs.filter((d) => DESCRIPTOR_ONLY.has(d)),
    reason: `unknown Discogs format: ${primary.name}`,
  }
}
