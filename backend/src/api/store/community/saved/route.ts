import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  getOrCreateProfile,
  getProfileByCustomerId,
  fetchReleaseCards,
  fetchReactionBreakdown,
} from "../../../../lib/community"

// GET /store/community/saved — the viewer's bookmarked posts (auth required).
export async function GET(
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
  const profile = await getProfileByCustomerId(pg, customerId)
  if (!profile) {
    res.json({ posts: [] })
    return
  }

  const rows = await pg("community_saved as s")
    .join("community_post as p", "p.id", "s.post_id")
    .join("community_profile as a", "a.id", "p.author_id")
    .where("s.profile_id", profile.id)
    .where("p.status", "published")
    .orderBy("s.created_at", "desc")
    .limit(50)
    .select(
      "p.id", "p.kind", "p.title", "p.slug", "p.excerpt", "p.cover_image_url",
      "p.tags", "p.release_id", "p.is_pinned", "p.reaction_count",
      "p.comment_count", "p.published_at", "p.created_at",
      "a.id as author_pid", "a.handle as author_handle",
      "a.display_name as author_name", "a.avatar_url as author_avatar",
      "a.tier as author_tier", "a.is_curator as author_is_curator"
    )

  const releaseCards = await fetchReleaseCards(pg, rows.map((r: any) => r.release_id))
  const reactionMap = await fetchReactionBreakdown(pg, "post", rows.map((r: any) => r.id))

  res.json({
    posts: rows.map((r: any) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      cover_image_url: r.cover_image_url,
      tags: r.tags || [],
      is_pinned: !!r.is_pinned,
      reaction_count: r.reaction_count,
      reactions: reactionMap[r.id] || {},
      comment_count: r.comment_count,
      published_at: r.published_at,
      created_at: r.created_at,
      author: {
        id: r.author_pid,
        handle: r.author_handle,
        display_name: r.author_name,
        avatar_url: r.author_avatar,
        tier: r.author_tier,
        is_curator: !!r.author_is_curator,
      },
      release: r.release_id ? releaseCards[r.release_id] || null : null,
    })),
  })
}

// POST /store/community/saved — toggle a bookmark (auth required).
// Body: { post_id }. Returns { saved }.
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

  const postId = String((req.body as any)?.post_id || "")
  if (!postId) {
    res.status(422).json({ message: "post_id is required" })
    return
  }
  const post = await pg("community_post").where({ id: postId }).first("id")
  if (!post) {
    res.status(404).json({ message: "Post not found" })
    return
  }

  const profile = await getOrCreateProfile(pg, customerId)
  const existing = await pg("community_saved")
    .where({ profile_id: profile.id, post_id: postId })
    .first("post_id")

  if (existing) {
    await pg("community_saved")
      .where({ profile_id: profile.id, post_id: postId })
      .del()
    res.json({ saved: false })
  } else {
    await pg("community_saved").insert({
      profile_id: profile.id,
      post_id: postId,
      created_at: new Date(),
    })
    res.json({ saved: true })
  }
}
