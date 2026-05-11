/**
 * Dual-tolerant Country-Filter-Resolver — KRITISCH für rc54.0 Variante A.
 *
 * Während der Migration (Phase 1+2 deployed, Phase 4 Backfill noch nicht durch):
 *   - DB-`country`-Feld enthält gemixt English Names ("Germany", "UK") + ISO ("DE")
 *   - Storefront-User tippen alles: "Germany", "Deutschland", "DE", "uk"
 *   - WHERE-Klausel muss BEIDE Encodings matchen
 *
 * Strategie: User-Input → resolveCountryForFilter() → Liste aller potentiell
 * matchenden DB-Werte (ISO + alle bekannten English-Variants für diesen ISO).
 * Storefront-Filter macht WHERE country = ANY([...]).
 *
 * Nach Phase 4+5 (Backfill + Constraint) sind alle DB-Werte ISO. Phase 6
 * vereinfacht diese Funktion auf single-value (siehe Implementation-Plan §6.2).
 */
import { findCountry, findCountryByName } from "../admin/data/country-iso"

/**
 * Bekannte DB-Strings die historisch auf einen ISO-Code mappten. Aus
 * COUNTRY_ISO_MIGRATION_PLAN.md §7. Nur Multi-Word/Compound-Cases — Single-
 * Word-Names (z.B. „Germany" → DE) sind durch `findCountry().nameEn`
 * abgedeckt und müssen hier nicht doppelt rein.
 *
 * Nach Phase 6 Cleanup entfernen.
 */
const DB_HISTORICAL_NAMES_BY_ISO: Record<string, string[]> = {
  GB: [
    "UK",
    "UK & Europe",
    "UK & US",
    "UK & Ireland",
    "UK & Germany",
    "UK & France",
    "UK, Europe & US",
  ],
  US: [
    "USA",
    "USA & Europe",
    "USA & Canada",
    "USA, Canada & Europe",
    "USA, Canada & UK",
  ],
  DE: [
    "Germany, Austria, & Switzerland",
    "Germany & Switzerland",
  ],
  EU: ["Europe", "European Union"],
  WO: ["Worldwide"],
  NL: ["Netherlands", "Benelux"],
  SE: ["Sweden", "Scandinavia"],
  FR: ["France", "France & Benelux"],
  CS: ["Czechoslovakia", "Serbia and Montenegro"],
  DD: ["East Germany (GDR)", "German Democratic Republic (GDR)"],
  SU: ["USSR", "Soviet Union"],
  AU: ["Australia & New Zealand"],
  // Single-Word-Names (Germany, Italy, France, UK alone etc.) sind durch
  // country.nameEn abgedeckt — siehe resolveCountryForFilter() unten.
}

/**
 * Resolve User-Input zu einer Liste aller DB-Werte die als „dieser Country"
 * matchen sollen.
 *
 * @example
 *   resolveCountryForFilter("germany")       // ["DE", "Germany"]
 *   resolveCountryForFilter("Deutschland")   // ["DE", "Germany"]
 *   resolveCountryForFilter("UK")            // ["GB", "United Kingdom", "UK", "UK & Europe", ...]
 *   resolveCountryForFilter("DE")            // ["DE", "Germany"]
 *   resolveCountryForFilter("Europe")        // ["EU", "Europe", "European Union"]
 *   resolveCountryForFilter("Foobaria")      // ["Foobaria"]  (passthrough, matched nichts)
 */
export function resolveCountryForFilter(input: string): string[] {
  const trimmed = input.trim()
  if (!trimmed) return []

  // Resolve auf ISO
  let iso: string | null = null
  if (trimmed.length === 2 && findCountry(trimmed.toUpperCase())) {
    iso = trimmed.toUpperCase()
  } else {
    iso = findCountryByName(trimmed)?.code ?? null
  }

  if (!iso) {
    // Unbekannter Input — passthrough (matched vermutlich gar nichts in DB,
    // aber wir lassen die Storefront-Query daran scheitern statt silent
    // alle Items zu liefern).
    return [trimmed]
  }

  // Dual-tolerant: ISO + English-Name + historische Multi-Region-Strings
  const country = findCountry(iso)
  const result = new Set<string>([iso])

  // English-Name als zweiter Wert für pre-backfill Single-Country-Rows
  // (z.B. "Germany", "Italy", "France")
  if (country?.nameEn && country.nameEn !== iso) {
    result.add(country.nameEn)
  }

  // Historical Multi-Region / Compound-Strings (z.B. "UK & Europe" → GB)
  const historical = DB_HISTORICAL_NAMES_BY_ISO[iso]
  if (historical) {
    for (const name of historical) result.add(name)
  }

  return Array.from(result)
}
