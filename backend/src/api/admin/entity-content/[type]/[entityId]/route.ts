import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  generateEntityId,
} from "@medusajs/framework/utils"
import { Knex } from "knex"

const VALID_TYPES = ["artist", "label", "press_orga"]

// Helper: get entity name + release count from the corresponding table
async function getEntityData(
  pgConnection: Knex,
  entityType: string,
  entityId: string
): Promise<{ name: string; release_count: number } | null> {
  switch (entityType) {
    case "artist": {
      const artist = await pgConnection("Artist")
        .select("name")
        .where("id", entityId)
        .first()
      if (!artist) return null
      const [{ count }] = await pgConnection("Release")
        .where("artistId", entityId)
        .count("id as count")
      return { name: artist.name, release_count: Number(count) }
    }
    case "label": {
      const label = await pgConnection("Label")
        .select("name")
        .where("id", entityId)
        .first()
      if (!label) return null
      const [{ count }] = await pgConnection("Release")
        .where("labelId", entityId)
        .count("id as count")
      return { name: label.name, release_count: Number(count) }
    }
    case "press_orga": {
      const pressOrga = await pgConnection("PressOrga")
        .select("name")
        .where("id", entityId)
        .first()
      if (!pressOrga) return null
      const [{ count }] = await pgConnection("Release")
        .where("pressOrgaId", entityId)
        .count("id as count")
      return { name: pressOrga.name, release_count: Number(count) }
    }
    default:
      return null
  }
}

// GET /admin/entity-content/:type/:entityId — Get single entity content with entity data
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { type, entityId } = req.params

  if (!VALID_TYPES.includes(type)) {
    res.status(400).json({ message: `Invalid entity type: ${type}. Must be one of: ${VALID_TYPES.join(", ")}` })
    return
  }

  // Get entity data (name + release count)
  const entityData = await getEntityData(pgConnection, type, entityId)
  if (!entityData) {
    res.status(404).json({ message: `${type} not found: ${entityId}` })
    return
  }

  // Get entity content (may not exist yet)
  const content = await pgConnection("entity_content")
    .where({ entity_type: type, entity_id: entityId })
    .first()

  res.json({
    entity_content: content || null,
    entity: {
      id: entityId,
      type,
      name: entityData.name,
      release_count: entityData.release_count,
    },
  })
}

// POST /admin/entity-content/:type/:entityId — Create or update (upsert) entity content
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { type, entityId } = req.params

  if (!VALID_TYPES.includes(type)) {
    res.status(400).json({ message: `Invalid entity type: ${type}. Must be one of: ${VALID_TYPES.join(", ")}` })
    return
  }

  const {
    description,
    short_description,
    country,
    founded_year,
    genre_tags,
    external_links,
    is_published,
  } = req.body as {
    description?: string
    short_description?: string
    country?: string
    founded_year?: string
    genre_tags?: string[]
    external_links?: Record<string, unknown>
    is_published?: boolean
  }

  // Verify entity exists
  const entityData = await getEntityData(pgConnection, type, entityId)
  if (!entityData) {
    res.status(404).json({ message: `${type} not found: ${entityId}` })
    return
  }

  const existing = await pgConnection("entity_content")
    .where({ entity_type: type, entity_id: entityId })
    .first()

  const now = new Date().toISOString()

  if (existing) {
    // Update
    await pgConnection("entity_content")
      .where({ entity_type: type, entity_id: entityId })
      .update({
        ...(description !== undefined && { description }),
        ...(short_description !== undefined && { short_description }),
        ...(country !== undefined && { country }),
        ...(founded_year !== undefined && { founded_year }),
        ...(genre_tags !== undefined && {
          genre_tags: pgConnection.raw("?::text[]", [genre_tags]),
        }),
        ...(external_links !== undefined && {
          external_links: JSON.stringify(external_links),
        }),
        ...(is_published !== undefined && { is_published }),
        updated_at: now,
      })
  } else {
    // Insert
    await pgConnection("entity_content").insert({
      id: generateEntityId(),
      entity_type: type,
      entity_id: entityId,
      description: description ?? null,
      short_description: short_description ?? null,
      country: country ?? null,
      founded_year: founded_year ?? null,
      genre_tags: genre_tags
        ? pgConnection.raw("?::text[]", [genre_tags])
        : null,
      external_links: external_links
        ? JSON.stringify(external_links)
        : null,
      is_published: is_published ?? false,
      updated_at: now,
    })
  }

  const content = await pgConnection("entity_content")
    .where({ entity_type: type, entity_id: entityId })
    .first()

  res.json({
    entity_content: content,
    entity: {
      id: entityId,
      type,
      name: entityData.name,
      release_count: entityData.release_count,
    },
  })
}

// DELETE /admin/entity-content/:type/:entityId — Delete entity content
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { type, entityId } = req.params

  if (!VALID_TYPES.includes(type)) {
    res.status(400).json({ message: `Invalid entity type: ${type}. Must be one of: ${VALID_TYPES.join(", ")}` })
    return
  }

  const existing = await pgConnection("entity_content")
    .where({ entity_type: type, entity_id: entityId })
    .first()

  if (!existing) {
    res.status(404).json({ message: "Entity content not found" })
    return
  }

  await pgConnection("entity_content")
    .where({ entity_type: type, entity_id: entityId })
    .delete()

  res.json({ message: "Entity content deleted", id: existing.id })
}
