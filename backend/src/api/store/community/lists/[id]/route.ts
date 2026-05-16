import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  communityDemoEnabled,
  isDemoId,
  getProfileByCustomerId,
  fetchReleaseCards,
  serializeProfile,
} from "../../../../../lib/community"

async function findList(pg: Knex, idOrSlug: string): Promise<any | null> {
  return (
    (await pg("community_list").where({ id: idOrSlug }).first()) ||
    (await pg("community_list").where({ slug: idOrSlug }).first()) ||
    null
  )
}

// GET /store/community/lists/:id — list detail with items (public).
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const list = await findList(pg, req.params.id)
  if (!list) {
    res.status(404).json({ message: "List not found" })
    return
  }
  if (isDemoId(list.author_id) && !(await communityDemoEnabled(pg))) {
    res.status(404).json({ message: "List not found" })
    return
  }

  // Viewer relationship — private lists are visible only to their owner.
  let isOwner = false
  const customerId = (req as any).auth_context?.actor_id
  if (customerId) {
    const viewer = await getProfileByCustomerId(pg, customerId)
    if (viewer && viewer.id === list.author_id) isOwner = true
  }
  if (!list.is_public && !isOwner) {
    res.status(404).json({ message: "List not found" })
    return
  }

  const author = await pg("community_profile").where({ id: list.author_id }).first()
  const itemRows = await pg("community_list_item")
    .where({ list_id: list.id })
    .orderBy([{ column: "rank" }, { column: "created_at" }])
    .select("release_id", "rank", "note", "created_at")
  const cards = await fetchReleaseCards(pg, itemRows.map((i: any) => i.release_id))

  res.json({
    list: {
      ...list,
      author: author ? serializeProfile(author) : null,
    },
    is_owner: isOwner,
    items: itemRows.map((i: any) => ({
      release_id: i.release_id,
      rank: i.rank,
      note: i.note,
      release: cards[i.release_id] || null,
    })),
  })
}

// PATCH /store/community/lists/:id — edit own list (auth required).
export async function PATCH(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }
  const list = await findList(pg, req.params.id)
  if (!list) {
    res.status(404).json({ message: "List not found" })
    return
  }
  const profile = await getProfileByCustomerId(pg, customerId)
  if (!profile || profile.id !== list.author_id) {
    res.status(403).json({ message: "Not your list" })
    return
  }

  const body = (req.body || {}) as Record<string, any>
  const patch: Record<string, any> = { updated_at: new Date() }
  if (body.title !== undefined) {
    const t = String(body.title || "").trim()
    if (!t) {
      res.status(422).json({ message: "A list needs a title" })
      return
    }
    patch.title = t.slice(0, 140)
  }
  if (body.description !== undefined) {
    patch.description = body.description
      ? String(body.description).slice(0, 2000)
      : null
  }
  if (body.cover_image_url !== undefined) {
    patch.cover_image_url = body.cover_image_url
      ? String(body.cover_image_url)
      : null
  }
  if (body.is_public !== undefined) patch.is_public = !!body.is_public

  const [row] = await pg("community_list")
    .where({ id: list.id })
    .update(patch)
    .returning("*")
  res.json({ list: row })
}

// DELETE /store/community/lists/:id — delete own list (auth required).
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }
  const list = await findList(pg, req.params.id)
  if (!list) {
    res.status(404).json({ message: "List not found" })
    return
  }
  const profile = await getProfileByCustomerId(pg, customerId)
  if (!profile || profile.id !== list.author_id) {
    res.status(403).json({ message: "Not your list" })
    return
  }

  // community_list_item rows cascade on the FK.
  await pg("community_list").where({ id: list.id }).del()
  res.json({ deleted: true })
}
