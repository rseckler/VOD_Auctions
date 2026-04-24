import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/artists/suggest?q=<term>&limit=20
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION)
  const q = (req.query.q as string || "").trim()
  const limit = Math.min(Number(req.query.limit) || 20, 50)

  if (q.length < 2) {
    res.json({ artists: [] })
    return
  }

  const lowerPattern = `%${q.toLowerCase()}%`
  const prefixLower = `${q.toLowerCase()}%`

  const artists = await pg
    .select("Artist.id", "Artist.name", "Artist.slug")
    .from("Artist")
    .whereRaw(`lower("Artist".name) LIKE ?`, [lowerPattern])
    .orderByRaw(
      `CASE WHEN lower("Artist"."name") LIKE ? THEN 0 ELSE 1 END, "Artist"."name" ASC`,
      [prefixLower]
    )
    .limit(limit)

  res.json({ artists })
}
