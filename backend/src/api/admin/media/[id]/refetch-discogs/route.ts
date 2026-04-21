import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

/**
 * POST /admin/media/:id/refetch-discogs
 *
 * Re-fetches Discogs metadata for this release using the stored discogs_id
 * and updates genre, styles, and price fields. Useful when:
 *   - Frank corrected a wrong discogs_id and wants fresh metadata
 *   - genre/styles are empty and need backfilling
 *   - a release needs manual refresh between daily sync runs
 *
 * Body: optional { fields?: Array<"genre"|"styles"|"prices"> } — default: all
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params

  const release = await pg("Release")
    .where("id", id)
    .select("id", "discogs_id", "title")
    .first()

  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  if (!release.discogs_id) {
    res.status(400).json({ message: "Release has no discogs_id — set one first" })
    return
  }

  const token = process.env.DISCOGS_TOKEN
  if (!token) {
    res.status(500).json({ message: "DISCOGS_TOKEN not configured on backend" })
    return
  }

  const headers = {
    "Authorization": `Discogs token=${token}`,
    "User-Agent": "VODAuctions/1.0 +https://vod-auctions.com",
  }

  // Fetch release metadata
  let apiData: any
  try {
    const resp = await fetch(`https://api.discogs.com/releases/${release.discogs_id}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) {
      res.status(resp.status).json({
        message: `Discogs API error ${resp.status}`,
        discogs_id: release.discogs_id,
      })
      return
    }
    apiData = await resp.json()
  } catch (e: any) {
    res.status(502).json({ message: `Discogs API fetch failed: ${e.message}` })
    return
  }

  const genre = Array.isArray(apiData.genres) && apiData.genres.length > 0
    ? apiData.genres.join(", ")
    : null
  const styles = Array.isArray(apiData.styles) && apiData.styles.length > 0
    ? apiData.styles.join(", ")
    : null

  const updates: Record<string, any> = {
    genre,
    styles,
    discogs_last_synced: new Date(),
    updatedAt: new Date(),
  }

  // Optional: fetch marketplace stats and price_suggestions for prices
  try {
    const statsResp = await fetch(`https://api.discogs.com/marketplace/stats/${release.discogs_id}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    })
    if (statsResp.ok) {
      const stats = await statsResp.json()
      const lp = stats.lowest_price
      if (lp && typeof lp === "object" && lp.value != null) {
        updates.discogs_lowest_price = Number(lp.value)
      } else if (lp != null) {
        updates.discogs_lowest_price = Number(lp)
      }
      updates.discogs_num_for_sale = stats.num_for_sale || 0
    }
  } catch {
    // non-critical
  }

  try {
    const suggResp = await fetch(`https://api.discogs.com/marketplace/price_suggestions/${release.discogs_id}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    })
    if (suggResp.ok) {
      const sugg = await suggResp.json()
      const prices: number[] = []
      for (const info of Object.values(sugg) as any[]) {
        if (info && typeof info === "object" && info.value != null) {
          const v = Number(info.value)
          if (!isNaN(v)) prices.push(v)
        }
      }
      if (prices.length > 0) {
        prices.sort((a, b) => a - b)
        const n = prices.length
        const median = n % 2 === 1 ? prices[(n - 1) / 2] : (prices[n / 2 - 1] + prices[n / 2]) / 2
        updates.discogs_median_price = Number(median.toFixed(2))
        updates.discogs_highest_price = Number(prices[n - 1].toFixed(2))
      }
    }
  } catch {
    // non-critical
  }

  await pg("Release").where("id", id).update(updates)

  res.json({
    message: "Refetched from Discogs",
    discogs_id: release.discogs_id,
    updated: {
      genre,
      styles,
      discogs_lowest_price: updates.discogs_lowest_price ?? null,
      discogs_median_price: updates.discogs_median_price ?? null,
      discogs_highest_price: updates.discogs_highest_price ?? null,
      discogs_num_for_sale: updates.discogs_num_for_sale ?? null,
    },
  })
}
