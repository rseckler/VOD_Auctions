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

  // Merge fragmented "Role \n – \n Name" patterns
  const merged: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^[–\-—]+$/.test(line) && merged.length > 0) {
      let next = i + 1
      while (next < lines.length && lines[next] === '') next++
      if (next < lines.length) {
        merged[merged.length - 1] += ' – ' + lines[next]
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
