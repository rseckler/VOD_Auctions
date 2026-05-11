/**
 * Country-Code Normalizer — Single Source of Truth für alle Write-Pfade.
 *
 * Konvention (siehe docs/optimizing/COUNTRY_ISO_MIGRATION_PLAN.md):
 * - Output ist IMMER ISO-3166-1 alpha-2 (UPPERCASE, 2 chars) ODER null
 * - Deprecated ISO-3166-3 (YU, DD, CS, SU) bleibt erhalten für historische Releases
 * - EU = Pure-Europe (ISO-exceptionally-reserved)
 * - WO = Worldwide (VOD-intern, kein offizieller ISO-Code)
 *
 * Aufgerufen von:
 * - backend/src/api/admin/discogs-import/commit/route.ts (vor Insert)
 * - backend/src/api/admin/media/[id]/discogs-preview/route.ts (Apply + Diff)
 * - backend/src/api/admin/media/[id]/route.ts (Picker, idempotent)
 * - scripts/legacy_sync_v2.py (über country_iso.py Python-Pendant)
 */
import { findCountryByName, isValidIsoCode } from "../admin/data/country-iso"

export function normalizeCountryToIso(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Identity-Passthrough für bereits valide ISO-Codes (case-insensitive)
  if (trimmed.length === 2) {
    const upper = trimmed.toUpperCase()
    if (isValidIsoCode(upper)) return upper
  }
  // Name/Alias-Lookup über ISO_COUNTRIES (nameEn/nameDe) + Discogs/Multi-Region-Aliase
  return findCountryByName(trimmed)?.code ?? null
}
