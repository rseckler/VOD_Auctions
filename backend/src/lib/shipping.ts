import { Knex } from "knex"

// Format group → shipping item type slug mapping
const FORMAT_GROUP_MAP: Record<string, string> = {
  LP: "vinyl-lp",
  DOUBLE_LP: "vinyl-double-lp",
  "10_INCH": "vinyl-10",
  SEVEN_INCH: "vinyl-7",
  CASSETTE: "cassette",
  CD: "cd",
  CD_DIGIPAK: "cd-digipak",
  MAGAZINE: "magazine",
  POSTCARD: "postcard",
  PHOTO: "photo",
  MERCHANDISE: "merchandise",
  REEL: "reel",
}

export type ShippingEstimate = {
  total_weight_grams: number
  packaging_weight_grams: number
  shipping_weight_grams: number
  has_oversized: boolean
  zone: { id: string; name: string; slug: string }
  price: number
  carrier: string
  items_breakdown: Array<{
    release_id: string
    item_type_name: string
    weight_grams: number
    is_oversized: boolean
  }>
}

/**
 * Resolve the shipping item type for a release.
 * Priority: Release.shipping_item_type_id > Format.format_group mapping > fallback "other"
 */
async function resolveItemType(
  pg: Knex,
  releaseId: string,
  itemTypeCache: Map<string, any>
): Promise<any> {
  // Get release with format info
  const release = await pg("Release")
    .select("Release.shipping_item_type_id", "Format.format_group")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .where("Release.id", releaseId)
    .first()

  if (!release) return itemTypeCache.get("other") || null

  // 1. Explicit override
  if (release.shipping_item_type_id) {
    if (itemTypeCache.has(release.shipping_item_type_id)) {
      return itemTypeCache.get(release.shipping_item_type_id)
    }
    const explicit = await pg("shipping_item_type")
      .where("id", release.shipping_item_type_id)
      .first()
    if (explicit) {
      itemTypeCache.set(explicit.id, explicit)
      return explicit
    }
  }

  // 2. Format group mapping
  if (release.format_group) {
    const slug = FORMAT_GROUP_MAP[release.format_group]
    if (slug) {
      for (const [, v] of itemTypeCache) {
        if (v.slug === slug) return v
      }
      const bySlug = await pg("shipping_item_type").where("slug", slug).first()
      if (bySlug) {
        itemTypeCache.set(bySlug.id, bySlug)
        return bySlug
      }
    }
  }

  // 3. Fallback
  return itemTypeCache.get("sit-other") || (await pg("shipping_item_type").where("slug", "other").first())
}

// ISO 3166-1 alpha-2 country names for display
export const COUNTRY_NAMES: Record<string, string> = {
  DE: "Germany", AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia",
  CY: "Cyprus", CZ: "Czech Republic", DK: "Denmark", EE: "Estonia", FI: "Finland",
  FR: "France", GR: "Greece", HU: "Hungary", IE: "Ireland", IT: "Italy",
  LV: "Latvia", LT: "Lithuania", LU: "Luxembourg", MT: "Malta", NL: "Netherlands",
  PL: "Poland", PT: "Portugal", RO: "Romania", SK: "Slovakia", SI: "Slovenia",
  ES: "Spain", SE: "Sweden",
  GB: "United Kingdom", CH: "Switzerland", NO: "Norway", IS: "Iceland",
  LI: "Liechtenstein", AD: "Andorra", MC: "Monaco", SM: "San Marino",
  VA: "Vatican City", AL: "Albania", BA: "Bosnia and Herzegovina",
  ME: "Montenegro", MK: "North Macedonia", RS: "Serbia", MD: "Moldova",
  UA: "Ukraine", BY: "Belarus", TR: "Turkey", GE: "Georgia",
  US: "United States", CA: "Canada", MX: "Mexico", BR: "Brazil", AR: "Argentina",
  CL: "Chile", CO: "Colombia",
  JP: "Japan", CN: "China", KR: "South Korea", AU: "Australia", NZ: "New Zealand",
  IN: "India", SG: "Singapore", HK: "Hong Kong", TW: "Taiwan", TH: "Thailand",
  ZA: "South Africa", IL: "Israel", AE: "United Arab Emirates",
  SA: "Saudi Arabia", EG: "Egypt",
}

/**
 * Resolve shipping zone from a 2-letter country code.
 * Checks shipping_zone.countries arrays; falls back to "world" catch-all.
 */
export async function resolveZoneByCountry(
  pg: Knex,
  countryCode: string
): Promise<{ zone: any; country_code: string; country_name: string }> {
  const code = countryCode.toUpperCase()

  const zone = await pg("shipping_zone")
    .whereRaw("? = ANY(countries)", [code])
    .first()

  if (zone) {
    return {
      zone,
      country_code: code,
      country_name: COUNTRY_NAMES[code] || code,
    }
  }

  const worldZone = await pg("shipping_zone")
    .where("slug", "world")
    .first()

  if (!worldZone) {
    throw new Error(`No shipping zone found for country: ${code}`)
  }

  return {
    zone: worldZone,
    country_code: code,
    country_name: COUNTRY_NAMES[code] || code,
  }
}

/**
 * Get all supported countries grouped by zone for frontend display.
 */
export async function getCountriesByZone(pg: Knex) {
  const zones = await pg("shipping_zone").orderBy("sort_order", "asc")

  return zones.map((z: any) => ({
    zone_id: z.id,
    zone_name: z.name,
    zone_slug: z.slug,
    countries: (z.countries || []).map((code: string) => ({
      code,
      name: COUNTRY_NAMES[code] || code,
    })),
    is_catch_all: !z.countries || z.countries.length === 0,
  }))
}

/**
 * Calculate shipping cost for a list of items to a given zone.
 * Accepts zone_slug directly. Use resolveZoneByCountry() first if you have a country_code.
 */
export async function calculateShipping(
  pg: Knex,
  items: Array<{ release_id: string; quantity?: number }>,
  zoneSlug: string
): Promise<ShippingEstimate> {
  // Load config
  const config = await pg("shipping_config").where("id", "default").first()
  if (!config) throw new Error("Shipping config not found")

  // Load zone
  const zone = await pg("shipping_zone").where("slug", zoneSlug).first()
  if (!zone) throw new Error(`Unknown shipping zone: ${zoneSlug}`)

  // Load rates for this zone
  const rates = await pg("shipping_rate")
    .where("zone_id", zone.id)
    .orderBy("weight_from_grams", "asc")

  if (rates.length === 0) throw new Error(`No shipping rates for zone: ${zoneSlug}`)

  // Preload all item types
  const allTypes = await pg("shipping_item_type").orderBy("sort_order", "asc")
  const itemTypeCache = new Map<string, any>()
  for (const t of allTypes) {
    itemTypeCache.set(t.id, t)
  }

  // Calculate weight per item
  let totalWeight = 0
  let hasOversized = false
  const breakdown: ShippingEstimate["items_breakdown"] = []

  for (const item of items) {
    const qty = item.quantity || 1
    const itemType = await resolveItemType(pg, item.release_id, itemTypeCache)
    const weight = (itemType?.default_weight_grams || 150) * qty
    const oversized = itemType?.is_oversized || false

    totalWeight += weight
    if (oversized) hasOversized = true

    breakdown.push({
      release_id: item.release_id,
      item_type_name: itemType?.name || "Other",
      weight_grams: weight,
      is_oversized: oversized,
    })
  }

  // Packaging weight
  const packagingWeight = hasOversized
    ? config.packaging_weight_grams
    : config.packaging_weight_small_grams

  const shippingWeight = totalWeight + packagingWeight

  // Find matching rate tier
  const rate = rates.find(
    (r: any) => shippingWeight >= r.weight_from_grams && shippingWeight <= r.weight_to_grams
  )

  // If no exact match, use the highest tier (for "and up" behavior)
  const effectiveRate = rate || rates[rates.length - 1]

  const basePrice = hasOversized
    ? parseFloat(effectiveRate.price_oversized)
    : parseFloat(effectiveRate.price_standard)

  // Apply margin
  const marginPercent = config.margin_percent || 0
  const finalPrice = Math.round(basePrice * (1 + marginPercent / 100) * 100) / 100

  // Check free shipping threshold
  // (caller should check item total and set price to 0 if above threshold)

  return {
    total_weight_grams: totalWeight,
    packaging_weight_grams: packagingWeight,
    shipping_weight_grams: shippingWeight,
    has_oversized: hasOversized,
    zone: { id: zone.id, name: zone.name, slug: zone.slug },
    price: finalPrice,
    carrier: hasOversized
      ? effectiveRate.carrier_oversized
      : effectiveRate.carrier_standard,
    items_breakdown: breakdown,
  }
}

/**
 * Get shipping config (free shipping threshold etc.)
 */
export async function getShippingConfig(pg: Knex) {
  return pg("shipping_config").where("id", "default").first()
}

/**
 * Get all zones with their rates for frontend display
 */
export async function getShippingZonesWithRates(pg: Knex) {
  const zones = await pg("shipping_zone").orderBy("sort_order", "asc")
  const rates = await pg("shipping_rate").orderBy("sort_order", "asc")

  return zones.map((z: any) => ({
    ...z,
    rates: rates
      .filter((r: any) => r.zone_id === z.id)
      .map((r: any) => ({
        ...r,
        price_standard: parseFloat(r.price_standard),
        price_oversized: parseFloat(r.price_oversized),
      })),
  }))
}
