import { createClient, SupabaseClient } from "@supabase/supabase-js"

let _client: SupabaseClient | null = null

/**
 * Returns a lazy-initialized Supabase service-role client for server-side use.
 * Used primarily for Realtime broadcasts (e.g. lot extension events).
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (_client) return _client

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key || key === "your_service_role_key_here") {
    console.warn("[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured — Realtime broadcasts disabled")
    return null
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
  })

  return _client
}
