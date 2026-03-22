import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// POST /admin/gallery/reorder — Reorder items within a section
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { section, items } = req.body as {
    section: string
    items: Array<{ id: string; position: number }>
  }

  if (!section || !items || !Array.isArray(items) || items.length === 0) {
    res
      .status(400)
      .json({ message: "section and items array are required" })
    return
  }

  // Validate all items have id and position
  for (const item of items) {
    if (!item.id || typeof item.position !== "number") {
      res
        .status(400)
        .json({ message: "Each item must have id (string) and position (number)" })
      return
    }
  }

  const now = new Date().toISOString()

  // Update all positions in a transaction
  await pgConnection.transaction(async (trx) => {
    for (const item of items) {
      await trx("gallery_media")
        .where("id", item.id)
        .where("section", section)
        .update({
          position: item.position,
          updated_at: now,
        })
    }
  })

  // Return updated items for the section
  const updated = await pgConnection("gallery_media")
    .where("section", section)
    .orderBy("position")

  res.json({ items: updated })
}
