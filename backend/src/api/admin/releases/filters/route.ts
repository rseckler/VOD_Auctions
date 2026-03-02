import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/releases/filters — Available filter options with counts
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const [formats, countries, years, totalResult] = await Promise.all([
    pgConnection("Release")
      .select("format as value")
      .count("id as count")
      .whereNotNull("format")
      .groupBy("format")
      .orderBy("count", "desc"),

    pgConnection("Release")
      .select("country as value")
      .count("id as count")
      .whereNotNull("country")
      .where("country", "!=", "")
      .where("country", "!=", "--")
      .groupBy("country")
      .orderBy("count", "desc")
      .limit(50),

    pgConnection("Release")
      .select("year as value")
      .count("id as count")
      .whereNotNull("year")
      .groupBy("year")
      .orderBy("year", "desc"),

    pgConnection("Release").count("id as count").first(),
  ])

  res.json({
    formats: formats.map((f: any) => ({ value: f.value, count: Number(f.count) })),
    countries: countries.map((c: any) => ({ value: c.value, count: Number(c.count) })),
    years: years.map((y: any) => ({ value: Number(y.value), count: Number(y.count) })),
    total: Number(totalResult?.count || 0),
  })
}
