import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  generateEntityId,
} from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/gallery — List all gallery media
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { section, active_only } = req.query

  let query = pgConnection("gallery_media")
    .select("*")
    .orderBy("section")
    .orderBy("position")

  if (section && typeof section === "string") {
    query = query.where("section", section)
  }

  if (active_only === "true") {
    query = query.where("is_active", true)
  }

  const items = await query

  // Count per section
  let countQuery = pgConnection("gallery_media")
    .select("section")
    .count("id as count")
    .groupBy("section")

  if (active_only === "true") {
    countQuery = countQuery.where("is_active", true)
  }

  const sectionCounts = await countQuery
  const counts: Record<string, number> = {}
  for (const row of sectionCounts) {
    counts[row.section] = Number(row.count)
  }

  res.json({
    items,
    count: items.length,
    section_counts: counts,
  })
}

// POST /admin/gallery — Create new gallery media item
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const {
    url,
    filename,
    alt_text,
    section,
    position,
    title,
    subtitle,
    description,
    link_url,
    link_label,
  } = req.body as {
    url: string
    filename: string
    alt_text?: string
    section: string
    position?: number
    title?: string
    subtitle?: string
    description?: string
    link_url?: string
    link_label?: string
  }

  if (!url || !filename || !section) {
    res
      .status(400)
      .json({ message: "url, filename, and section are required" })
    return
  }

  // Auto-assign position if not provided: max position in section + 1
  let pos = position ?? 0
  if (position === undefined || position === null) {
    const maxPos = await pgConnection("gallery_media")
      .where("section", section)
      .max("position as max_pos")
      .first()
    pos = (maxPos?.max_pos ?? -1) + 1
  }

  const id = generateEntityId()
  const now = new Date().toISOString()

  await pgConnection("gallery_media").insert({
    id,
    url,
    filename,
    alt_text: alt_text || null,
    section,
    position: pos,
    title: title || null,
    subtitle: subtitle || null,
    description: description || null,
    link_url: link_url || null,
    link_label: link_label || null,
    is_active: true,
    created_at: now,
    updated_at: now,
  })

  const item = await pgConnection("gallery_media").where("id", id).first()

  res.status(201).json({ item })
}
