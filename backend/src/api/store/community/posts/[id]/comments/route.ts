import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  getOrCreateProfile,
  sanitizeBodyHtml,
  recomputeCommentCount,
  serializeProfile,
} from "../../../../../../lib/community"

async function findPost(pg: Knex, idOrSlug: string): Promise<any | null> {
  return (
    (await pg("community_post").where({ id: idOrSlug }).first()) ||
    (await pg("community_post").where({ slug: idOrSlug }).first()) ||
    null
  )
}

// GET /store/community/posts/:id/comments — comments for a post (public)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const post = await findPost(pg, req.params.id)
  if (!post) {
    res.status(404).json({ message: "Post not found" })
    return
  }

  const rows = await pg("community_comment as c")
    .join("community_profile as a", "a.id", "c.author_id")
    .where("c.post_id", post.id)
    .where("c.status", "published")
    .orderBy("c.created_at", "asc")
    .select(
      "c.id", "c.parent_id", "c.body_html", "c.reaction_count", "c.created_at",
      "a.id as author_pid", "a.handle as author_handle",
      "a.display_name as author_name", "a.avatar_url as author_avatar",
      "a.tier as author_tier", "a.is_curator as author_is_curator"
    )

  res.json({
    comments: rows.map((c: any) => ({
      id: c.id,
      parent_id: c.parent_id,
      body_html: c.body_html,
      reaction_count: c.reaction_count,
      created_at: c.created_at,
      author: {
        id: c.author_pid,
        handle: c.author_handle,
        display_name: c.author_name,
        avatar_url: c.author_avatar,
        tier: c.author_tier,
        is_curator: !!c.author_is_curator,
      },
    })),
  })
}

// POST /store/community/posts/:id/comments — add a comment (auth required)
export async function POST(
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

  const body = (req.body || {}) as Record<string, any>
  const bodyHtml = sanitizeBodyHtml(String(body.body_html || ""))
  if (!bodyHtml.trim()) {
    res.status(422).json({ message: "Comment body is empty" })
    return
  }

  const profile = await getOrCreateProfile(pg, customerId)
  if (profile.is_banned) {
    res.status(403).json({ message: "Account suspended" })
    return
  }

  // One threading level only: a reply's parent must itself be top-level.
  let parentId: string | null = null
  if (body.parent_id) {
    const parent = await pg("community_comment")
      .where({ id: String(body.parent_id), post_id: post.id })
      .first("id", "parent_id")
    if (!parent) {
      res.status(422).json({ message: "Parent comment not found" })
      return
    }
    parentId = parent.parent_id || parent.id
  }

  const now = new Date()
  const [row] = await pg("community_comment")
    .insert({
      id: generateEntityId("", "cmcmt"),
      post_id: post.id,
      author_id: profile.id,
      parent_id: parentId,
      body_json: body.body_json ? JSON.stringify(body.body_json) : null,
      body_html: bodyHtml,
      status: "published",
      created_at: now,
      updated_at: now,
    })
    .returning("*")

  await recomputeCommentCount(pg, post.id)

  res.status(201).json({ comment: { ...row, author: serializeProfile(profile) } })
}
