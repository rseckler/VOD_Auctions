import { MedusaRequest } from "@medusajs/framework/http"

// In-memory sliding-window-Rate-Limiter. Eine PM2-Instance, single Backend-Prozess
// → Memory-State ist Source-of-Truth. Bei horizontaler Skalierung später auf
// Redis umstellen (Upstash ist schon in storefront/.env.local für Bid-Locks).

interface RateBucket {
  hits: number[] // Unix-Millis pro Hit
}

const BUCKETS = new Map<string, RateBucket>()
let lastSweepAt = 0
const SWEEP_INTERVAL_MS = 60_000

function sweep(now: number): void {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return
  lastSweepAt = now
  for (const [key, bucket] of BUCKETS) {
    // Alles älter als 5min wegwerfen — länger braucht's nicht
    bucket.hits = bucket.hits.filter((t) => now - t < 300_000)
    if (bucket.hits.length === 0) BUCKETS.delete(key)
  }
}

// Liefert true wenn die Anfrage *durchgeht*, false wenn sie geblockt wird.
// Unter der Haube zählt der Aufruf den Hit — ein erlaubter Hit wird also
// gespeichert, ein geblockter nicht (verhindert Endless-Block-Lock-In).
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  sweep(now)
  let bucket = BUCKETS.get(key)
  if (!bucket) {
    bucket = { hits: [] }
    BUCKETS.set(key, bucket)
  }
  // Old hits wegtrimmen
  const cutoff = now - windowMs
  bucket.hits = bucket.hits.filter((t) => t >= cutoff)
  if (bucket.hits.length >= max) return false
  bucket.hits.push(now)
  return true
}

// Client-IP aus Request extrahieren — nginx-Reverse-Proxy schreibt
// X-Forwarded-For, sonst connection.remoteAddress. nimmt das erste IP-Element
// vor dem Komma (originale Client-IP).
export function getClientIp(req: MedusaRequest): string {
  const xff = (req.headers["x-forwarded-for"] || "") as string
  if (xff && typeof xff === "string") {
    const first = xff.split(",")[0].trim()
    if (first) return first
  }
  const realIp = req.headers["x-real-ip"]
  if (typeof realIp === "string" && realIp) return realIp
  return (req.socket?.remoteAddress as string) || "unknown"
}

// Spezialisierte Helper-Funktion für /print/bridges/pair: 5/min/IP UND 50/min global.
// Returns null wenn OK, sonst { reason, retryAfterSec } für 429-Response.
export function checkPairRateLimit(ip: string): { reason: string; retryAfterSec: number } | null {
  if (!checkRateLimit(`pair:ip:${ip}`, 5, 60_000)) {
    return { reason: "Too many pairing attempts from this IP", retryAfterSec: 60 }
  }
  if (!checkRateLimit("pair:global", 50, 60_000)) {
    return { reason: "Pairing endpoint globally rate-limited", retryAfterSec: 60 }
  }
  return null
}
