import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  getProfileByCustomerId,
} from "../../../../../../lib/community"

async function ownList(
  pg: Knex,
  idOrSlug: string,
  customerId: string | undefined
): Promise<{ list?: any; error?: { status: number; message: string } }> {
  if (!customerId) {
    return { error: { status: 401, message: "Authentication required" } }
  }
  const list =
    (await pg("community_list").where({ id: idOrSlug }).first()) ||
    (await pg("community_list").where({ slug: idOrSlug }).first())
  if (!list) return { error: { status: 404, message: "List not found" } }
  const profile = await getProfileByCustomerId(pg, customerId)
  if (!profile || profile.id !== list.author_id) {
    return { error: { status: 403, message: "Not your list" } }
  }
  return { list }
}

async function syncItemCount(pg: Knex, listId: string): Promise<number> {
  const rows = await pg("community_list_item")
    .where({ list_id: listId })
    .count("release_id as count")
  const n = Number(rows[0]?.count || 0)
  await pg("community_list")
    .where({ id: listId })
    .update({ item_count: n, updated_at: new Date() })
  return n
}

// POST /store/community/lists/:id/items — add a release (auth, own list).
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const customerId = (req as any).auth_context?.actor_id
  const { list, error } = await ownList(pg, req.params.id, customerId)
  if (error) {
    res.status(error.status).json({ message: error.message })
    return
  }

  const body = (req.body || {}) as Record<string, any>
  const releaseId = body.release_id ? String(body.release_id) : ""
  if (!releaseId) {
    res.status(422).json({ message: "release_id is required" })
    return
  }
  const release = await pg("Release").where({ id: releaseId }).first("id")
  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  const existing = await pg("community_list_item")
    .where({ list_id: list.id, release_id: releaseId })
    .first("release_id")
  if (existing) {
    res.status(409).json({ message: "Already in this list" })
    return
  }

  const maxRow = await pg("community_list_item")
    .where({ list_id: list.id })
    .max("rank as m")
  const rank = Number(maxRow[0]?.m || 0) + 1

  await pg("community_list_item").insert({
    list_id: list.id,
    release_id: releaseId,
    rank,
    note: body.note ? String(body.note).slice(0, 500) : null,
    created_at: new Date(),
  })
  const count = await syncItemCount(pg, list.id)
  res.status(201).json({ added: true, item_count: count })
}

// DELETE /store/community/lists/:id/items — remove a release (auth, own list).
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const customerId = (req as any).auth_context?.actor_id
  const { list, error } = await ownList(pg, req.params.id, customerId)
  if (error) {
    res.status(error.status).json({ message: error.message })
    return
  }

  const body = (req.body || {}) as Record<string, any>
  const releaseId = body.release_id ? String(body.release_id) : ""
  if (!releaseId) {
    res.status(422).json({ message: "release_id is required" })
    return
  }

  await pg("community_list_item")
    .where({ list_id: list.id, release_id: releaseId })
    .del()
  const count = await syncItemCount(pg, list.id)
  res.json({ removed: true, item_count: count })
}
