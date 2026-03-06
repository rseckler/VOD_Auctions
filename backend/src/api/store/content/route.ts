import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /store/content?page=about — Public published content
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { page } = req.query

  let query = pgConnection("content_block")
    .select("page", "section", "content", "sort_order")
    .where("is_published", true)
    .orderBy("sort_order")

  if (page) {
    query = query.where("page", page as string)
  }

  const rows = await query

  // Return as a map: { "hero": { ...content }, "founder": { ...content } }
  const sections: Record<string, unknown> = {}
  for (const row of rows) {
    const key = page ? row.section : `${row.page}.${row.section}`
    sections[key] = row.content
  }

  res.json({ sections, content_blocks: rows })
}
