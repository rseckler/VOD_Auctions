import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  communityDemoEnabled,
  isDemoId,
  getProfileByCustomerId,
  sanitizeBodyHtml,
  excerptFromHtml,
  fetchReleaseCards,
  serializeProfile,
} from "../../../../../lib/community"

// Resolve a post by id OR slug — the storefront links by slug.
async function findPost(pg: Knex, idOrSlug: string): Promise<any | null> {
  return (
    (await pg("community_post").where({ id: idOrSlug }).first()) ||
    (await pg("community_post").where({ slug: idOrSlug }).first()) ||
    null
  )
}

// GET /store/community/posts/:id — single post (public)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const post = await findPost(pg, req.params.id)
  if (!post || post.status === "removed") {
    res.status(404).json({ message: "Post not found" })
    return
  }
  // Demo posts answer 404 unless COMMUNITY_DEMO is on.
  if (isDemoId(post.author_id) && !(await communityDemoEnabled(pg))) {
    res.status(404).json({ message: "Post not found" })
    return
  }

  const author = await pg("community_profile").where({ id: post.author_id }).first()
  const releaseCards = await fetchReleaseCards(pg, [post.release_id])

  res.json({
    post: {
      ...post,
      author: author ? serializeProfile(author) : null,
      release: post.release_id ? releaseCards[post.release_id] || null : null,
    },
  })
}

// PATCH /store/community/posts/:id — edit own post (auth required)
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

  const post = await findPost(pg, req.params.id)
  if (!post || post.status === "removed") {
    res.status(404).json({ message: "Post not found" })
    return
  }
  const profile = await getProfileByCustomerId(pg, customerId)
  if (!profile || profile.id !== post.author_id) {
    res.status(403).json({ message: "Not your post" })
    return
  }

  const body = (req.body || {}) as Record<string, any>
  const patch: Record<string, any> = { updated_at: new Date() }
  if (body.title !== undefined) patch.title = body.title ? String(body.title).slice(0, 200) : null
  if (body.body_html !== undefined) {
    patch.body_html = sanitizeBodyHtml(String(body.body_html || ""))
    patch.excerpt = excerptFromHtml(patch.body_html)
  }
  if (body.body_json !== undefined) {
    patch.body_json = body.body_json ? JSON.stringify(body.body_json) : null
  }
  if (body.cover_image_url !== undefined) {
    patch.cover_image_url = body.cover_image_url ? String(body.cover_image_url) : null
  }
  if (Array.isArray(body.tags)) {
    patch.tags = body.tags
      .map((t: any) => String(t).toLowerCase().trim())
      .filter(Boolean)
      .slice(0, 8)
  }

  const [row] = await pg("community_post")
    .where({ id: post.id })
    .update(patch)
    .returning("*")
  res.json({ post: row })
}

// DELETE /store/community/posts/:id — soft-delete own post (auth required)
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

  const post = await findPost(pg, req.params.id)
  if (!post || post.status === "removed") {
    res.status(404).json({ message: "Post not found" })
    return
  }
  const profile = await getProfileByCustomerId(pg, customerId)
  if (!profile || profile.id !== post.author_id) {
    res.status(403).json({ message: "Not your post" })
    return
  }

  await pg("community_post")
    .where({ id: post.id })
    .update({ status: "removed", updated_at: new Date() })
  res.json({ deleted: true })
}
