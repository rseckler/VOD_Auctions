import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type CreditEntry = {
  role: string
  name: string
}

/**
 * Clean raw legacy credits text: fix escape sequences, line endings, HTML.
 */
function cleanRawCredits(raw: string): string[] {
  let text = raw
    .replace(/\\r\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\xA0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')

  let lines = text.split('\n').map(line => line.replace(/\s+/g, ' ').trim())

  // Remove empty lines but keep max one blank between sections
  lines = lines.reduce<string[]>((acc, line) => {
    if (line === '') {
      if (acc.length > 0 && acc[acc.length - 1] !== '') acc.push('')
    } else {
      acc.push(line)
    }
    return acc
  }, [])

  // Merge Discogs fragment suffixes (* = artist credit variant) into previous line
  // Merge / (artist separator) as joiner: prev / next
  const prefixed: string[] = []
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k]
    if (line === '*' && prefixed.length > 0) {
      let prevIdx = prefixed.length - 1
      while (prevIdx >= 0 && prefixed[prevIdx] === '') prevIdx--
      if (prevIdx >= 0) {
        prefixed[prevIdx] += ' *'
        continue
      }
    }
    if (line === '/' && prefixed.length > 0) {
      // Find last non-empty entry to join with
      let prevIdx = prefixed.length - 1
      while (prevIdx >= 0 && prefixed[prevIdx] === '') prevIdx--
      // Look ahead for next non-empty line to join
      let next = k + 1
      while (next < lines.length && lines[next] === '') next++
      if (prevIdx >= 0 && next < lines.length) {
        prefixed[prevIdx] += ' / ' + lines[next]
        k = next
        continue
      }
    }
    prefixed.push(line)
  }

  // Merge fragmented "Role \n – \n Name" patterns
  const merged: string[] = []
  for (let i = 0; i < prefixed.length; i++) {
    const line = prefixed[i]
    if (/^[–\-—]+$/.test(line) && merged.length > 0) {
      let next = i + 1
      while (next < prefixed.length && prefixed[next] === '') next++
      if (next < prefixed.length) {
        // Find last non-empty entry to merge with
        let prevIdx = merged.length - 1
        while (prevIdx >= 0 && merged[prevIdx] === '') prevIdx--
        if (prevIdx >= 0) {
          merged[prevIdx] += ' – ' + prefixed[next]
        }
        i = next
      }
    } else {
      merged.push(line)
    }
  }

  return merged.filter(Boolean)
}

/**
 * Parse credits text into structured role/name pairs.
 * Handles Discogs-style "Role – Name" and "Role by/: Name" patterns.
 * Returns null if no credits could be parsed.
 */
export function parseCredits(raw: string): CreditEntry[] | null {
  const lines = cleanRawCredits(raw)
  if (lines.length === 0) return null

  const entries: CreditEntry[] = []

  for (const line of lines) {
    // Skip empty separator lines
    if (line === '') continue

    // Discogs-style: "Role – Name" or "Role — Name" (en-dash / em-dash)
    const dashMatch = line.match(/^(.+?)\s+[–—]\s+(.+)$/)
    if (dashMatch) {
      entries.push({ role: dashMatch[1].trim(), name: dashMatch[2].trim() })
      continue
    }

    // "Role by Name" (e.g., "Written by John Smith", "Produced by Jane")
    const byMatch = line.match(/^(.+?)\s+by\s+(.+)$/i)
    if (byMatch && byMatch[1].length < 40) {
      entries.push({ role: byMatch[1].trim(), name: byMatch[2].trim() })
      continue
    }

    // "Role: Name" (e.g., "Producer: John Doe")
    const colonMatch = line.match(/^([^:]{2,40}):\s+(.+)$/)
    if (colonMatch) {
      entries.push({ role: colonMatch[1].trim(), name: colonMatch[2].trim() })
      continue
    }

    // Fallback: unstructured line — store with empty role
    entries.push({ role: '', name: line })
  }

  return entries.length > 0 ? entries : null
}

/**
 * Fallback: clean credits text for plain-text display.
 */
export function cleanCredits(raw: string): string {
  return cleanRawCredits(raw).join('\n').trim()
}

type TracklistFromText = {
  position?: string
  title: string
  duration?: string
}

// Matches vinyl-style positions: A, B, A1, B2, I, II, 1, 12
// Single letter (A/B/I) for vinyl sides or Roman numerals; optional digits for sub-tracks
const POSITION_RE = /^([A-Z]{1,2}\d{0,2}|\d{1,2})\.?$/
const DURATION_RE = /^\d{1,3}:\d{2}$/

/**
 * Detect and extract tracklist data from a text field.
 * Handles cases where the credits field actually contains tracklist data
 * (fragmented lines: position, title, duration in sequence).
 * Returns { tracks, remainingCredits } — remainingCredits is null if
 * all lines were consumed as tracklist data.
 */
export function extractTracklistFromText(raw: string): {
  tracks: TracklistFromText[]
  remainingCredits: string | null
} {
  const lines = cleanRawCredits(raw)
  if (lines.length === 0) return { tracks: [], remainingCredits: null }

  const tracks: TracklistFromText[] = []
  const creditLines: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Consume standalone duration lines that precede a position (scraped Discogs pattern)
    if (DURATION_RE.test(line)) {
      // Check if next non-empty line is a position — if so, this duration belongs to the tracklist
      let peek = i + 1
      while (peek < lines.length && lines[peek] === '') peek++
      if (peek < lines.length && POSITION_RE.test(lines[peek])) {
        // Assign duration to previous track if it has none
        if (tracks.length > 0 && !tracks[tracks.length - 1].duration) {
          tracks[tracks.length - 1].duration = line
        }
        i++
        continue
      }
    }

    // Check if this line is a track position (A1, B2, 1, etc.)
    if (POSITION_RE.test(line)) {
      const position = line
      let title: string | null = null
      let duration: string | undefined

      // Next non-empty line should be the title
      let j = i + 1
      while (j < lines.length && lines[j] === '') j++
      if (j < lines.length && !POSITION_RE.test(lines[j]) && !DURATION_RE.test(lines[j])) {
        title = lines[j]
        j++
        // Check for duration after title
        while (j < lines.length && lines[j] === '') j++
        if (j < lines.length && DURATION_RE.test(lines[j])) {
          duration = lines[j]
          j++
        }
      }

      if (title) {
        tracks.push({ position, title, duration })
        i = j
        continue
      }
    }

    // Not a tracklist line — save as credit
    if (line !== '') creditLines.push(line)
    i++
  }

  // Handle trailing duration (last track in the sequence, duration appears before a final position)
  // Also consume the very last duration if it precedes the end
  if (tracks.length > 0 && creditLines.length > 0) {
    const lastCredit = creditLines[creditLines.length - 1]
    if (DURATION_RE.test(lastCredit) && !tracks[tracks.length - 1].duration) {
      tracks[tracks.length - 1].duration = lastCredit
      creditLines.pop()
    }
  }

  // Only consider it a valid tracklist if we found >= 2 tracks (handles 7" singles)
  if (tracks.length < 2) {
    return { tracks: [], remainingCredits: raw }
  }

  return {
    tracks,
    remainingCredits: creditLines.length > 0 ? creditLines.join('\n') : null,
  }
}

/**
 * Parse a flat/unstructured JSONB tracklist where each line of the original
 * Discogs tracklist was stored as a separate entry with only a `title` field:
 *   [{title:"A1"}, {title:"E-Coli"}, {title:"11:29"}, {title:"A2"}, ...]
 *
 * Detects the repeating [position, title, duration?] pattern and regroups
 * entries into properly structured tracks.
 *
 * Returns null if the data doesn't look like this flat format (e.g. already
 * structured, or too few entries to form valid tracks).
 */
// Vinyl-style position: A, B, A1, A2, B1, AA, 1, 12 — max 4 chars, letters+digits only
const FLAT_POS_RE = /^[A-Z]{0,2}\d{0,2}$/
const FLAT_DUR_RE = /^\d{1,3}:\d{2}$/

export function parseUnstructuredTracklist(
  tracks: { position?: string | null; title?: string | null; duration?: string | null }[]
): { position: string; title: string; duration?: string }[] | null {
  if (!tracks || tracks.length < 3) return null

  const result: { position: string; title: string; duration?: string }[] = []
  let i = 0

  while (i < tracks.length) {
    const t0 = (tracks[i]?.title || tracks[i]?.position || "").trim()
    const t1 = (tracks[i + 1]?.title || tracks[i + 1]?.position || "").trim()
    const t2 = (tracks[i + 2]?.title || tracks[i + 2]?.position || "").trim()

    const t0isPos = t0.length > 0 && t0.length <= 4 && FLAT_POS_RE.test(t0)
    const t1isTitle = t1.length > 0 && !FLAT_POS_RE.test(t1) && !FLAT_DUR_RE.test(t1)
    const t2isDur = t2.length > 0 && FLAT_DUR_RE.test(t2)

    if (t0isPos && t1isTitle && t2isDur && i + 2 < tracks.length) {
      result.push({ position: t0, title: t1, duration: t2 })
      i += 3
      continue
    }

    // position + title without duration (e.g. last track or untimed)
    if (t0isPos && t1isTitle && i + 1 < tracks.length) {
      result.push({ position: t0, title: t1 })
      i += 2
      continue
    }

    // Unrecognised line — skip
    i++
  }

  return result.length >= 2 ? result : null
}
