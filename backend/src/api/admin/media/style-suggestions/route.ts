import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// In-process cache — distinct styles change rarely (only via admin edits +
// nightly Discogs daily sync). 10-minute TTL is plenty.
let cache: { values: string[]; expires: number } | null = null
const TTL_MS = 10 * 60 * 1000

/**
 * GET /admin/media/style-suggestions
 *
 * Returns the distinct list of `Release.styles` values currently in the DB,
 * sorted alphabetically. Used by the StylesPickerModal in the Edit-Stammdaten
 * card so Frank can pick from already-known values + add custom new ones.
 *
 * Response: { values: string[] }
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const now = Date.now()
  if (cache && cache.expires > now) {
    res.json({ values: cache.values, cached: true })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const result = await pgConnection.raw(
    `SELECT DISTINCT unnest(styles) AS val
       FROM "Release"
      WHERE styles IS NOT NULL
      ORDER BY val ASC`
  )

  const values = (result.rows || [])
    .map((r: { val: string }) => r.val)
    .filter((v: string) => v && v.trim().length > 0)

  cache = { values, expires: now + TTL_MS }
  res.json({ values, cached: false })
}
