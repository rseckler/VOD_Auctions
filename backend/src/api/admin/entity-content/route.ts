import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/entity-content — List entity content with filters
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const {
    entity_type,
    is_published,
    has_content,
    q,
    page = "1",
    limit = "50",
  } = req.query as Record<string, string>

  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit)
  const pageSize = Math.min(200, parseInt(limit))

  let query = pgConnection("entity_content")
    .select(
      "entity_content.id",
      "entity_content.entity_type",
      "entity_content.entity_id",
      "entity_content.description",
      "entity_content.short_description",
      "entity_content.country",
      "entity_content.founded_year",
      "entity_content.genre_tags",
      "entity_content.external_links",
      "entity_content.is_published",
      "entity_content.ai_generated",
      "entity_content.ai_generated_at",
      "entity_content.created_at",
      "entity_content.updated_at"
    )

  // Join to entity tables for name + release count
  query = query
    .select(
      pgConnection.raw(`
        COALESCE("Artist".name, "Label".name, "PressOrga".name) as entity_name
      `),
      pgConnection.raw(`
        CASE entity_content.entity_type
          WHEN 'artist' THEN (
            SELECT COUNT(*)::int FROM "Release" WHERE "Release"."artistId" = entity_content.entity_id
          )
          WHEN 'label' THEN (
            SELECT COUNT(*)::int FROM "Release" WHERE "Release"."labelId" = entity_content.entity_id
          )
          WHEN 'press_orga' THEN (
            SELECT COUNT(*)::int FROM "Release" WHERE "Release"."pressOrgaId" = entity_content.entity_id
          )
          ELSE 0
        END as release_count
      `)
    )
    .leftJoin("Artist", function () {
      this.on("entity_content.entity_id", "=", "Artist.id")
        .andOn("entity_content.entity_type", "=", pgConnection.raw("'artist'"))
    })
    .leftJoin("Label", function () {
      this.on("entity_content.entity_id", "=", "Label.id")
        .andOn("entity_content.entity_type", "=", pgConnection.raw("'label'"))
    })
    .leftJoin("PressOrga", function () {
      this.on("entity_content.entity_id", "=", "PressOrga.id")
        .andOn("entity_content.entity_type", "=", pgConnection.raw("'press_orga'"))
    })

  // Filters
  if (entity_type && typeof entity_type === "string") {
    query = query.where("entity_content.entity_type", entity_type)
  }

  if (is_published === "true") {
    query = query.where("entity_content.is_published", true)
  } else if (is_published === "false") {
    query = query.where("entity_content.is_published", false)
  }

  if (has_content === "true") {
    query = query.where(function () {
      this.whereNotNull("entity_content.description")
        .andWhere("entity_content.description", "!=", "")
    })
  } else if (has_content === "false") {
    query = query.where(function () {
      this.whereNull("entity_content.description")
        .orWhere("entity_content.description", "=", "")
    })
  }

  if (q && typeof q === "string" && q.trim()) {
    const search = `%${q.trim()}%`
    query = query.where(function () {
      this.whereILike("Artist.name", search)
        .orWhereILike("Label.name", search)
        .orWhereILike("PressOrga.name", search)
        .orWhereILike("entity_content.description", search)
    })
  }

  // Count total
  const countQuery = query.clone().clearSelect().clearOrder().count("entity_content.id as count").first()
  const countResult = await countQuery
  const total = Number(countResult?.count || 0)

  // Fetch page
  const items = await query
    .orderBy("entity_content.updated_at", "desc")
    .offset(offset)
    .limit(pageSize)

  // Stats: total entities per type + entities with content per type
  const statsRows = await pgConnection.raw(`
    SELECT
      'artist' as entity_type,
      (SELECT COUNT(*)::int FROM "Artist") as total,
      (SELECT COUNT(*)::int FROM entity_content WHERE entity_type = 'artist') as with_content
    UNION ALL
    SELECT
      'label' as entity_type,
      (SELECT COUNT(*)::int FROM "Label") as total,
      (SELECT COUNT(*)::int FROM entity_content WHERE entity_type = 'label') as with_content
    UNION ALL
    SELECT
      'press_orga' as entity_type,
      (SELECT COUNT(*)::int FROM "PressOrga") as total,
      (SELECT COUNT(*)::int FROM entity_content WHERE entity_type = 'press_orga') as with_content
  `)

  const stats: Record<string, { total: number; with_content: number }> = {}
  for (const row of statsRows.rows) {
    stats[row.entity_type] = {
      total: row.total,
      with_content: row.with_content,
    }
  }

  res.json({
    items,
    total,
    page: parseInt(page),
    limit: pageSize,
    pages: Math.ceil(total / pageSize),
    stats,
  })
}
