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

  const [formats, countries, years, totalResult, categories] = await Promise.all([
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

    pgConnection("Release")
      .select(
        pgConnection.raw(`
          CASE
            WHEN "Release".product_category = 'release' AND "Format".kat = 1 THEN 'tapes'
            WHEN "Release".product_category = 'release' AND "Format".kat = 2 THEN 'vinyl'
            WHEN "Release".product_category = 'band_literature' THEN 'band_literature'
            WHEN "Release".product_category = 'label_literature' THEN 'label_literature'
            WHEN "Release".product_category = 'press_literature' THEN 'press_literature'
            ELSE 'other'
          END as value
        `)
      )
      .count("Release.id as count")
      .leftJoin("Format", "Release.format_id", "Format.id")
      .groupBy("value")
      .orderBy("count", "desc"),
  ])

  res.json({
    formats: formats.map((f: any) => ({ value: f.value, count: Number(f.count) })),
    countries: countries.map((c: any) => ({ value: c.value, count: Number(c.count) })),
    years: years.map((y: any) => ({ value: Number(y.value), count: Number(y.count) })),
    categories: categories.map((c: any) => ({ value: c.value, count: Number(c.count) })),
    total: Number(totalResult?.count || 0),
  })
}
