import crypto from "crypto"

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

/**
 * Generate a cryptographically secure Base62 token.
 * 10 chars = 62^10 ≈ 8.4×10^17 combinations.
 */
export function generateRawToken(length = 10): string {
  const bytes = crypto.randomBytes(length * 2)
  let result = ""
  for (let i = 0; i < bytes.length && result.length < length; i++) {
    const idx = bytes[i] % 62
    result += BASE62[idx]
  }
  return result.toUpperCase()
}

/**
 * Format a raw token for display in emails: VOD-XXXXX-XXXXX
 */
export function formatToken(raw: string): string {
  return `VOD-${raw.slice(0, 5)}-${raw.slice(5, 10)}`
}

/**
 * Generate a short referral code (8 chars).
 */
export function generateRefCode(): string {
  return generateRawToken(8)
}
