import { randomInt } from "crypto"

// Crockford-Base32 ohne 0, O, I, L (Lesbarkeit) — 32 Zeichen, 5 bit/char.
// Pairing-Code: 12 Chars in 4-4-4-Gruppen mit `VOD-` Prefix
// → 32^12 ≈ 1.2 × 10^18 Möglichkeiten ≈ 60 bit Entropie.
const ALPHABET = "123456789ABCDEFGHJKMNPQRSTUVWXYZ"

if (ALPHABET.length !== 32) {
  throw new Error("pairing-codes alphabet must be exactly 32 chars")
}

export function generatePairingCode(): string {
  const groups: string[] = []
  for (let g = 0; g < 3; g++) {
    let chunk = ""
    for (let i = 0; i < 4; i++) {
      chunk += ALPHABET[randomInt(0, 32)]
    }
    groups.push(chunk)
  }
  return `VOD-${groups.join("-")}`
}

// Alphabet excludes both 0 AND O — beide sind ungültig, keine Normalisierung
// (User-Tippfehler beim Code → 400, statt fälschlich auf einen falschen Code
// zu mappen). I/L → 1 weil 1 die kanonische Wahl ist.
const NORMALIZE_MAP: Record<string, string> = { "I": "1", "L": "1" }

// User-Eingabe normalisieren: uppercase, Whitespace raus, häufige Verwechslungen
// (0↔O, I↔1, L↔1) tolerieren — Crockford-Style. Entfernt VOD-Prefix wenn da.
export function normalizePairingCode(input: string): string {
  let s = input.trim().toUpperCase().replace(/[\s-]+/g, "")
  if (s.startsWith("VOD")) s = s.slice(3)
  let out = ""
  for (const ch of s) {
    out += NORMALIZE_MAP[ch] ?? ch
  }
  return out
}

// Vergleicht user-input mit gespeichertem Code. Beide werden normalisiert.
export function matchesPairingCode(input: string, stored: string): boolean {
  return normalizePairingCode(input) === normalizePairingCode(stored)
}

export function isValidPairingCodeFormat(code: string): boolean {
  const normalized = normalizePairingCode(code)
  if (normalized.length !== 12) return false
  for (const ch of normalized) {
    if (!ALPHABET.includes(ch)) return false
  }
  return true
}
