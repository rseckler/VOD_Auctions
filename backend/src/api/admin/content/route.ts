import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/content — All content blocks, grouped by page
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { page } = req.query

  let query = pgConnection("content_block")
    .select("*")
    .orderBy("page")
    .orderBy("sort_order")

  if (page) {
    query = query.where("page", page as string)
  }

  const rows = await query

  // Group by page
  const grouped: Record<string, typeof rows> = {}
  for (const row of rows) {
    if (!grouped[row.page]) grouped[row.page] = []
    grouped[row.page].push(row)
  }

  res.json({ content_blocks: rows, grouped })
}
