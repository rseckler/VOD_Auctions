import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/gallery/:id — Get single gallery media item
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { id } = req.params

  const item = await pgConnection("gallery_media").where("id", id).first()

  if (!item) {
    res.status(404).json({ message: "Gallery media item not found" })
    return
  }

  res.json({ item })
}

// POST /admin/gallery/:id — Update gallery media item
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { id } = req.params

  const existing = await pgConnection("gallery_media").where("id", id).first()

  if (!existing) {
    res.status(404).json({ message: "Gallery media item not found" })
    return
  }

  const allowedFields = [
    "url",
    "filename",
    "alt_text",
    "section",
    "position",
    "title",
    "subtitle",
    "description",
    "link_url",
    "link_label",
    "is_active",
  ]

  const updates: Record<string, unknown> = {}
  const body = req.body as Record<string, unknown>

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field]
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ message: "No valid fields to update" })
    return
  }

  updates.updated_at = new Date().toISOString()

  await pgConnection("gallery_media").where("id", id).update(updates)

  const item = await pgConnection("gallery_media").where("id", id).first()

  res.json({ item })
}

// DELETE /admin/gallery/:id — Delete gallery media item
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { id } = req.params

  const existing = await pgConnection("gallery_media").where("id", id).first()

  if (!existing) {
    res.status(404).json({ message: "Gallery media item not found" })
    return
  }

  await pgConnection("gallery_media").where("id", id).delete()

  res.status(200).json({ id, deleted: true })
}
