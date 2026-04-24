import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/labels/suggest?q=<term>&limit=20
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION)
  const q = (req.query.q as string || "").trim()
  const limit = Math.min(Number(req.query.limit) || 20, 50)

  if (q.length < 2) {
    res.json({ labels: [] })
    return
  }

  const lowerPattern = `%${q.toLowerCase()}%`
  const prefixLower = `${q.toLowerCase()}%`

  const labels = await pg
    .select("Label.id", "Label.name", "Label.slug")
    .from("Label")
    .whereRaw(`lower("Label".name) LIKE ?`, [lowerPattern])
    .orderByRaw(
      `CASE WHEN lower("Label"."name") LIKE ? THEN 0 ELSE 1 END, "Label"."name" ASC`,
      [prefixLower]
    )
    .limit(limit)

  res.json({ labels })
}
