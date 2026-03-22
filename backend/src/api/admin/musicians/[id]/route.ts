import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/musicians/:id — Musician detail with roles and projects
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const { id } = req.params

  const musician = await pgConnection("musician").where("id", id).first()
  if (!musician) {
    res.status(404).json({ error: "Musician not found" })
    return
  }

  // Roles with artist names
  const roles = await pgConnection("musician_role")
    .select(
      "musician_role.*",
      "Artist.name as artist_name",
      "Artist.slug as artist_slug"
    )
    .leftJoin("Artist", "Artist.id", "musician_role.artist_id")
    .where("musician_role.musician_id", id)
    .orderBy("musician_role.active_from", "asc")

  // Projects
  const projects = await pgConnection("musician_project")
    .select(
      "musician_project.*",
      "Artist.name as resolved_artist_name",
      "Artist.slug as resolved_artist_slug"
    )
    .leftJoin("Artist", "Artist.id", "musician_project.project_artist_id")
    .where("musician_project.musician_id", id)
    .orderBy("musician_project.project_name", "asc")

  res.json({ musician, roles, projects })
}

// POST /admin/musicians/:id — Update musician + manage roles/projects
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const { id } = req.params
  const body = req.body as Record<string, any>

  const musician = await pgConnection("musician").where("id", id).first()
  if (!musician) {
    res.status(404).json({ error: "Musician not found" })
    return
  }

  // Handle role add
  if (body.action === "add_role") {
    const { artist_id, role, active_from, active_to, is_founder } = body
    if (!artist_id || !role) {
      res.status(400).json({ error: "artist_id and role are required" })
      return
    }
    const roleId = `mr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await pgConnection("musician_role").insert({
      id: roleId,
      musician_id: id,
      artist_id,
      role,
      active_from: active_from || null,
      active_to: active_to || null,
      is_founder: is_founder || false,
    }).onConflict(["musician_id", "artist_id", "role"]).ignore()
    res.json({ success: true })
    return
  }

  // Handle role delete
  if (body.action === "delete_role") {
    await pgConnection("musician_role").where("id", body.role_id).delete()
    res.json({ success: true })
    return
  }

  // Handle project add
  if (body.action === "add_project") {
    const { project_name, role, years, project_artist_id } = body
    if (!project_name) {
      res.status(400).json({ error: "project_name is required" })
      return
    }
    const projId = `mp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await pgConnection("musician_project").insert({
      id: projId,
      musician_id: id,
      project_name,
      project_artist_id: project_artist_id || null,
      role: role || null,
      years: years || null,
    }).onConflict(["musician_id", "project_name"]).ignore()
    res.json({ success: true })
    return
  }

  // Default: update musician fields
  const allowedFields = [
    "name", "real_name", "country", "birth_year", "death_year",
    "bio", "short_description", "photo_url", "data_source",
    "confidence", "needs_review", "discogs_id", "musicbrainz_id",
  ]
  const updates: Record<string, any> = { updated_at: new Date() }
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field]
    }
  }

  // Regenerate slug if name changed
  if (body.name && body.name !== musician.name) {
    updates.slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  }

  await pgConnection("musician").where("id", id).update(updates)
  const updated = await pgConnection("musician").where("id", id).first()
  res.json({ musician: updated })
}

// DELETE /admin/musicians/:id — Delete musician and all roles/projects
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const { id } = req.params

  await pgConnection("musician").where("id", id).delete()
  res.json({ success: true })
}
