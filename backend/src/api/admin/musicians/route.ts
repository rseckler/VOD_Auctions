import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/musicians — List musicians with search, filter, pagination
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const {
    q,
    needs_review,
    data_source,
    artist_id,
    page = "1",
    limit = "50",
    sort = "name",
    order = "asc",
  } = req.query as Record<string, string>

  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit)
  const pageSize = Math.min(200, parseInt(limit))

  let query = pgConnection("musician")
    .select(
      "musician.*",
      pgConnection.raw(`(SELECT COUNT(*)::int FROM musician_role WHERE musician_role.musician_id = musician.id) as role_count`),
      pgConnection.raw(`(SELECT COUNT(DISTINCT artist_id)::int FROM musician_role WHERE musician_role.musician_id = musician.id) as band_count`)
    )

  // Filters
  if (q && q.trim()) {
    const search = `%${q.trim()}%`
    query = query.where(function () {
      this.whereILike("musician.name", search)
        .orWhereILike("musician.real_name", search)
    })
  }

  if (needs_review === "true") {
    query = query.where("musician.needs_review", true)
  } else if (needs_review === "false") {
    query = query.where("musician.needs_review", false)
  }

  if (data_source) {
    query = query.where("musician.data_source", data_source)
  }

  if (artist_id) {
    query = query.whereIn(
      "musician.id",
      pgConnection("musician_role").select("musician_id").where("artist_id", artist_id)
    )
  }

  // Count
  const countResult = await query.clone().clearSelect().clearOrder().count("musician.id as count").first()
  const total = Number(countResult?.count || 0)

  // Sort + paginate
  const validSorts = ["name", "created_at", "updated_at", "confidence", "country"]
  const sortCol = validSorts.includes(sort) ? sort : "name"
  const sortOrder = order === "desc" ? "desc" : "asc"

  const items = await query
    .orderBy(`musician.${sortCol}`, sortOrder)
    .offset(offset)
    .limit(pageSize)

  // Stats
  const statsResult = await pgConnection.raw(`
    SELECT
      COUNT(*)::int as total_musicians,
      COUNT(CASE WHEN needs_review THEN 1 END)::int as needs_review,
      COUNT(CASE WHEN data_source = 'discogs' THEN 1 END)::int as from_discogs,
      COUNT(CASE WHEN data_source = 'musicbrainz' THEN 1 END)::int as from_musicbrainz,
      COUNT(CASE WHEN data_source = 'credits' THEN 1 END)::int as from_credits,
      COUNT(CASE WHEN data_source = 'ai' THEN 1 END)::int as from_ai,
      COUNT(CASE WHEN data_source = 'manual' THEN 1 END)::int as from_manual,
      (SELECT COUNT(DISTINCT artist_id)::int FROM musician_role) as bands_with_members
    FROM musician
  `)

  res.json({
    items,
    total,
    page: parseInt(page),
    limit: pageSize,
    pages: Math.ceil(total / pageSize),
    stats: statsResult.rows[0],
  })
}

// POST /admin/musicians — Create a new musician
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const body = req.body as Record<string, any>
  const { name, real_name, country, birth_year, death_year, bio, short_description, data_source } = body

  if (!name) {
    res.status(400).json({ error: "name is required" })
    return
  }

  // Generate slug
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  const id = `mus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  await pgConnection("musician").insert({
    id,
    name,
    slug,
    real_name: real_name || null,
    country: country || null,
    birth_year: birth_year || null,
    death_year: death_year || null,
    bio: bio || null,
    short_description: short_description || null,
    data_source: data_source || "manual",
    confidence: 1.0,
  })

  const musician = await pgConnection("musician").where("id", id).first()
  res.json({ musician })
}
