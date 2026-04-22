import { MeiliSearch } from "meilisearch"

// ─── Constants ──────────────────────────────────────────────────────────────

export const COMMERCE_INDEX = "releases-commerce"
export const DISCOVERY_INDEX = "releases-discovery"

const PROBE_INTERVAL_MS = 30_000
const FAIL_THRESHOLD = 3

// ─── Singleton client ───────────────────────────────────────────────────────
//
// Lazy-init so that local dev without MEILI_ADMIN_API_KEY doesn't crash at
// import time — only when a route actually tries to use it. Returns null
// when the env is missing so callers can treat "no meili configured" as
// "feature-flag off, fall through to postgres".

let client: MeiliSearch | null = null
let clientInitTried = false

export function getMeiliClient(): MeiliSearch | null {
  if (client) return client
  if (clientInitTried) return null
  clientInitTried = true

  const apiKey = process.env.MEILI_ADMIN_API_KEY
  if (!apiKey) {
    // No-op in dev without Meili. Health-probe won't start, routes fall
    // through to Postgres via isMeiliEffective() returning false below.
    return null
  }
  const host = process.env.MEILI_URL || "http://127.0.0.1:7700"
  client = new MeiliSearch({ host, apiKey })
  return client
}

// ─── Health-probe + in-memory effective flag ────────────────────────────────
//
// The operator-facing feature flag (`SEARCH_MEILI_CATALOG` in site_config)
// is the *intent*. The effective flag here is the *runtime reality* — if
// Meili is unreachable, it flips to false after N consecutive health
// failures, and flips back on the first successful probe.
//
// Callers read via isMeiliEffective(). NEVER written to site_config — that
// stays the operator's desired state.

let effectiveOn = true
let consecutiveFailures = 0
let probeTimer: NodeJS.Timeout | null = null

export function isMeiliEffective(): boolean {
  // Lazy-start the health-probe on the first call from a request handler.
  // Idempotent (no-op if already running or no client configured).
  // Avoids requiring a Medusa loader/subscriber for the bootstrap.
  startMeiliHealthProbe()
  return effectiveOn && getMeiliClient() !== null
}

async function probe(): Promise<void> {
  const c = getMeiliClient()
  if (!c) {
    // No client configured — treat as permanently-down for health purposes.
    effectiveOn = false
    return
  }
  try {
    await c.health()
    if (!effectiveOn) {
      console.log(
        JSON.stringify({
          event: "meili_health_recovered",
          consecutive_failures_before: consecutiveFailures,
        })
      )
    }
    consecutiveFailures = 0
    effectiveOn = true
  } catch (err: any) {
    consecutiveFailures++
    if (effectiveOn && consecutiveFailures >= FAIL_THRESHOLD) {
      effectiveOn = false
      console.error(
        JSON.stringify({
          event: "meili_health_tripped",
          consecutive_failures: consecutiveFailures,
          error: err?.message,
        })
      )
    }
  }
}

/**
 * Start the recurring health-probe. Idempotent — calling twice is a no-op.
 * Auto-starts on first isMeiliEffective() call too (via ensureProbe), so the
 * explicit loader-call is optional.
 */
export function startMeiliHealthProbe(): void {
  if (probeTimer) return
  // No client → nothing to probe. Don't schedule wake-ups just to confirm
  // "still no client" every 30s.
  if (!getMeiliClient()) return

  // Fire once immediately, then on interval.
  void probe()
  probeTimer = setInterval(() => void probe(), PROBE_INTERVAL_MS)
  if (typeof probeTimer.unref === "function") probeTimer.unref()
}

/**
 * Used by tests to reset module state between runs.
 * Not part of the public runtime API.
 */
export function __resetMeiliClientForTests(): void {
  if (probeTimer) {
    clearInterval(probeTimer)
    probeTimer = null
  }
  client = null
  clientInitTried = false
  effectiveOn = true
  consecutiveFailures = 0
}
