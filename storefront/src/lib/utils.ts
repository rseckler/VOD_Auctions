import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Clean up messy legacy credits text for display.
 * Handles: literal escape sequences, mixed line endings, HTML tags,
 * non-breaking spaces, excessive whitespace, blank lines, and
 * fragmented "Role – Name" patterns split across lines.
 */
export function cleanCredits(raw: string): string {
  let text = raw
    // Literal escape sequences stored as text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n')
    // Actual line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // HTML
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    // HTML entities
    .replace(/\xA0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')

  // Trim each line and collapse runs of spaces
  let lines = text.split('\n').map(line => line.replace(/\s+/g, ' ').trim())

  // Remove empty lines but keep max one blank line between sections
  lines = lines.reduce<string[]>((acc, line) => {
    if (line === '') {
      if (acc.length > 0 && acc[acc.length - 1] !== '') {
        acc.push('')
      }
    } else {
      acc.push(line)
    }
    return acc
  }, [])

  // Join fragmented "Role \n – \n Name" patterns into "Role – Name"
  const merged: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^[–\-—]+$/.test(line) && merged.length > 0) {
      // Find the next non-empty line after the dash
      let next = i + 1
      while (next < lines.length && lines[next] === '') next++
      if (next < lines.length) {
        merged[merged.length - 1] += ' – ' + lines[next]
        i = next // skip to after the name line
      }
    } else {
      merged.push(line)
    }
  }

  return merged.join('\n').trim()
}
