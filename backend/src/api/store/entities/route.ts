import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /store/entities?type=artist|label|press_orga
// Returns entities with published content (for sitemap + listing pages)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { type } = req.query as Record<string, string>

  const validTypes = ["artist", "label", "press_orga"]
  if (type && !validTypes.includes(type)) {
    res.status(400).json({
      message: `Invalid type: ${type}. Must be one of: ${validTypes.join(", ")}`,
    })
    return
  }

  // Build query: entity_content joined to the entity table for slug
  // Only published content
  let query = pgConnection("entity_content")
    .select(
      "entity_content.entity_type",
      "entity_content.entity_id",
      "entity_content.updated_at"
    )
    .where("entity_content.is_published", true)

  if (type) {
    query = query.where("entity_content.entity_type", type)
  }

  const contentRows = await query.orderBy("entity_content.updated_at", "desc")

  // Group by type and fetch slugs from the corresponding tables
  const artistIds: string[] = []
  const labelIds: string[] = []
  const pressOrgaIds: string[] = []

  for (const row of contentRows) {
    switch (row.entity_type) {
      case "artist":
        artistIds.push(row.entity_id)
        break
      case "label":
        labelIds.push(row.entity_id)
        break
      case "press_orga":
        pressOrgaIds.push(row.entity_id)
        break
    }
  }

  // Fetch slugs in bulk
  const slugMap: Record<string, string> = {}

  if (artistIds.length > 0) {
    const artists = await pgConnection("Artist")
      .select("id", "slug")
      .whereIn("id", artistIds)
    for (const a of artists) {
      slugMap[a.id] = a.slug
    }
  }

  if (labelIds.length > 0) {
    const labels = await pgConnection("Label")
      .select("id", "slug")
      .whereIn("id", labelIds)
    for (const l of labels) {
      slugMap[l.id] = l.slug
    }
  }

  if (pressOrgaIds.length > 0) {
    const pressOrgas = await pgConnection("PressOrga")
      .select("id", "slug")
      .whereIn("id", pressOrgaIds)
    for (const p of pressOrgas) {
      slugMap[p.id] = p.slug
    }
  }

  // Build response
  const entities = contentRows
    .filter((row: { entity_id: string }) => slugMap[row.entity_id])
    .map((row: { entity_type: string; entity_id: string; updated_at: string }) => ({
      entity_type: row.entity_type,
      slug: slugMap[row.entity_id],
      updated_at: row.updated_at,
    }))

  res.json({ entities })
}
