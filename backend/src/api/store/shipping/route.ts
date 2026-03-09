import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { calculateShipping, getShippingConfig, getShippingZonesWithRates, getCountriesByZone, resolveZoneByCountry, COUNTRY_NAMES } from "../../../lib/shipping"

// GET /store/shipping — Get zones, rates, and countries for frontend display
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  try {
    const [zones, config, countriesByZone, methods] = await Promise.all([
      getShippingZonesWithRates(pg),
      getShippingConfig(pg),
      getCountriesByZone(pg),
      pg("shipping_method").where("is_active", true).orderBy(["zone_id", "sort_order"]),
    ])

    // Build flat country list sorted alphabetically for frontend dropdown
    const allCountries: Array<{ code: string; name: string; zone_slug: string; zone_name: string }> = []
    for (const zg of countriesByZone) {
      for (const c of zg.countries) {
        allCountries.push({
          code: c.code,
          name: c.name,
          zone_slug: zg.zone_slug,
          zone_name: zg.zone_name,
        })
      }
    }
    allCountries.sort((a, b) => a.name.localeCompare(b.name))

    // Check if any zone is a catch-all (world)
    const hasCatchAll = countriesByZone.some((z: any) => z.is_catch_all)

    // Group methods by zone_id
    const methodsByZone: Record<string, any[]> = {}
    for (const m of methods) {
      if (!methodsByZone[m.zone_id]) methodsByZone[m.zone_id] = []
      methodsByZone[m.zone_id].push({
        id: m.id,
        carrier_name: m.carrier_name,
        method_name: m.method_name,
        delivery_days_min: m.delivery_days_min,
        delivery_days_max: m.delivery_days_max,
        has_tracking: m.has_tracking,
        tracking_url_pattern: m.tracking_url_pattern,
        is_default: m.is_default,
      })
    }

    res.json({
      zones,
      countries: allCountries,
      methods: methodsByZone,
      has_catch_all: hasCatchAll,
      catch_all_zone: hasCatchAll
        ? countriesByZone.find((z: any) => z.is_catch_all)
        : null,
      free_shipping_threshold: config?.free_shipping_threshold
        ? parseFloat(config.free_shipping_threshold)
        : null,
    })
  } catch (error: any) {
    console.error("[store/shipping] Error:", error)
    res.status(500).json({ message: "Failed to fetch shipping info" })
  }
}

// POST /store/shipping — Estimate shipping for specific items
// Body: { release_ids: string[], zone_slug?: string, country_code?: string }
// Accepts either zone_slug (legacy) or country_code (new)
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { release_ids, zone_slug, country_code } = req.body as any

  if (!release_ids || !Array.isArray(release_ids)) {
    res.status(400).json({ message: "release_ids (array) is required" })
    return
  }

  if (!zone_slug && !country_code) {
    res.status(400).json({ message: "Either zone_slug or country_code is required" })
    return
  }

  try {
    // Resolve zone from country_code if provided
    let resolvedZoneSlug = zone_slug
    let countryInfo: { country_code: string; country_name: string } | null = null

    if (country_code && !zone_slug) {
      const resolved = await resolveZoneByCountry(pg, country_code)
      resolvedZoneSlug = resolved.zone.slug
      countryInfo = {
        country_code: resolved.country_code,
        country_name: resolved.country_name,
      }
    }

    const items = release_ids.map((id: string) => ({ release_id: id, quantity: 1 }))
    const estimate = await calculateShipping(pg, items, resolvedZoneSlug)

    const config = await getShippingConfig(pg)
    res.json({
      estimate: {
        ...estimate,
        ...countryInfo,
        free_shipping_threshold: config?.free_shipping_threshold
          ? parseFloat(config.free_shipping_threshold)
          : null,
      },
    })
  } catch (error: any) {
    console.error("[store/shipping] Estimate error:", error)
    res.status(500).json({ message: error.message || "Failed to estimate shipping" })
  }
}
