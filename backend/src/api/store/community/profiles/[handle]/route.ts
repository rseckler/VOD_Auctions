import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  serializeProfile,
  fetchReleaseCards,
  getProfileByCustomerId,
} from "../../../../../lib/community"

// GET /store/community/profiles/:handle — public member profile + recent posts
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const handle = String(req.params.handle || "").toLowerCase()
  const profile = await pg("community_profile").where({ handle }).first()
  if (!profile) {
    res.status(404).json({ message: "Member not found" })
    return
  }

  const posts = await pg("community_post")
    .where({ author_id: profile.id, status: "published" })
    .orderBy("published_at", "desc")
    .limit(20)
    .select(
      "id", "kind", "title", "slug", "excerpt", "cover_image_url", "tags",
      "release_id", "reaction_count", "comment_count", "published_at"
    )

  const releaseCards = await fetchReleaseCards(pg, posts.map((p: any) => p.release_id))

  const postCountRows = await pg("community_post")
    .where({ author_id: profile.id, status: "published" })
    .count("id as count")
  const commentCountRows = await pg("community_comment")
    .where({ author_id: profile.id, status: "published" })
    .count("id as count")
  const reviewCountRows = await pg("community_review")
    .where({ author_id: profile.id, status: "published" })
    .count("id as count")
  const followerRows = await pg("community_follow")
    .where({ followed_id: profile.id })
    .count("followed_id as count")
  const followingRows = await pg("community_follow")
    .where({ follower_id: profile.id })
    .count("follower_id as count")

  // Viewer relationship — only when logged in and not their own profile.
  let isFollowing = false
  let isSelf = false
  const customerId = (req as any).auth_context?.actor_id
  if (customerId) {
    const viewer = await getProfileByCustomerId(pg, customerId)
    if (viewer) {
      isSelf = viewer.id === profile.id
      if (!isSelf) {
        const rel = await pg("community_follow")
          .where({ follower_id: viewer.id, followed_id: profile.id })
          .first("follower_id")
        isFollowing = !!rel
      }
    }
  }

  res.json({
    profile: serializeProfile(profile),
    is_following: isFollowing,
    is_self: isSelf,
    stats: {
      posts: Number(postCountRows[0]?.count || 0),
      comments: Number(commentCountRows[0]?.count || 0),
      reviews: Number(reviewCountRows[0]?.count || 0),
      followers: Number(followerRows[0]?.count || 0),
      following: Number(followingRows[0]?.count || 0),
    },
    posts: posts.map((p: any) => ({
      ...p,
      tags: p.tags || [],
      release: p.release_id ? releaseCards[p.release_id] || null : null,
    })),
  })
}
