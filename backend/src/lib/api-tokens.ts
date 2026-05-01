import { createHash, randomBytes, timingSafeEqual } from "crypto"

// Bridge-API-Token: 32 Bytes random hex (256 bit). In DB nur sha256-Hash (hex)
// gespeichert — Klartext geht 1× über die Pair-Response zur Bridge zurück und
// liegt dann nur noch im plist auf dem Mac (chmod 600).

export const API_TOKEN_BYTES = 32

export function generateApiToken(): { clear: string; hash: string } {
  const clear = randomBytes(API_TOKEN_BYTES).toString("hex")
  const hash = hashApiToken(clear)
  return { clear, hash }
}

export function hashApiToken(clear: string): string {
  return createHash("sha256").update(clear, "utf8").digest("hex")
}

// Konstant-zeit-Vergleich gegen Timing-Side-Channels. Strings müssen gleich
// lang sein — sha256-hex ist immer 64 Chars, also kein Edge-Case zu erwarten,
// aber defensiv prüfen.
export function tokenMatches(clearInput: string, storedHash: string): boolean {
  if (typeof clearInput !== "string" || typeof storedHash !== "string") return false
  const inputHash = hashApiToken(clearInput)
  if (inputHash.length !== storedHash.length) return false
  try {
    return timingSafeEqual(Buffer.from(inputHash, "hex"), Buffer.from(storedHash, "hex"))
  } catch {
    return false
  }
}

// Aus dem Authorization-Header das Bearer-Token extrahieren. Liefert null wenn
// nicht im Format `Bearer <token>` oder Token leer.
export function extractBearerToken(authHeader: string | undefined | null): string | null {
  if (!authHeader || typeof authHeader !== "string") return null
  const m = authHeader.match(/^Bearer\s+([A-Za-z0-9._\-]+)\s*$/)
  return m ? m[1] : null
}

// Placeholder-Wert in bridge_host.api_token_hash für Frank/David in
// rc52-env-var-Mode (vor Stage E/F-Cutover). Bridges mit diesem Hash dürfen
// /print/bridge-config ohne Bearer abrufen — Stage-B-Compat.
export const ENV_VAR_MODE_HASH = "rc52-env-var-mode"
