"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"

/**
 * Client-side feature-flag provider.
 *
 * Fetches the whitelisted subset of backend feature flags from
 * `GET /store/platform-flags` exactly once per mount and exposes them
 * via the `useFeatureFlag(key)` hook. Missing or unknown keys always
 * return `false` — safe default, consistent with the backend registry.
 *
 * Only flags listed in `CLIENT_SAFE_FLAGS` in backend/src/lib/feature-flags.ts
 * are ever returned. ERP and other private flags are not accessible here.
 *
 * The fetch is best-effort: on failure (network, 503) the provider silently
 * falls back to all-false. A feature gated by a flag always degrades to its
 * pre-flag default behavior when the fetch fails — by design, so a backend
 * hiccup cannot accidentally enable an experimental feature.
 */

type FlagsMap = Record<string, boolean>

type FeatureFlagContextValue = {
  flags: FlagsMap
  loading: boolean
}

const FeatureFlagContext = createContext<FeatureFlagContextValue>({
  flags: {},
  loading: true,
})

export function FeatureFlagProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FlagsMap>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function load() {
      try {
        const res = await fetch(`${MEDUSA_URL}/store/platform-flags`, {
          headers: { "x-publishable-api-key": PUBLISHABLE_KEY },
          signal: controller.signal,
          cache: "no-store",
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { flags?: FlagsMap }
        if (!cancelled && data.flags) {
          setFlags(data.flags)
        }
      } catch {
        // Best-effort: fall through to all-false defaults.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  return (
    <FeatureFlagContext.Provider value={{ flags, loading }}>
      {children}
    </FeatureFlagContext.Provider>
  )
}

/**
 * Returns the current boolean state of a client-safe feature flag.
 * Always defaults to `false` for unknown or not-yet-loaded flags, so
 * gated features are off-by-default until proven on.
 */
export function useFeatureFlag(key: string): boolean {
  const ctx = useContext(FeatureFlagContext)
  return ctx.flags[key] === true
}
