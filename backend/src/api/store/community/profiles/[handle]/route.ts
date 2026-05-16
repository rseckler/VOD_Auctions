import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  communityDemoEnabled,
  isDemoId,
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
  // Demo profiles answer 404 unless COMMUNITY_DEMO is on.
  if (isDemoId(profile.id) && !(await communityDemoEnabled(pg))) {
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

  // Recent comments — for the profile "Comments" tab, with post context.
  const commentRows = await pg("community_comment as c")
    .join("community_post as po", "po.id", "c.post_id")
    .where("c.author_id", profile.id)
    .where("c.status", "published")
    .orderBy("c.created_at", "desc")
    .limit(20)
    .select(
      "c.id", "c.body_html", "c.created_at",
      "po.slug as post_slug", "po.title as post_title"
    )

  // Recent reviews — for the profile "Reviews" tab.
  const reviewRows = await pg("community_review as r")
    .leftJoin("Release", "Release.id", "r.release_id")
    .leftJoin("Artist", "Artist.id", "Release.artistId")
    .where("r.author_id", profile.id)
    .where("r.status", "published")
    .orderBy("r.created_at", "desc")
    .limit(20)
    .select(
      "r.id", "r.rating", "r.body_html", "r.is_verified_acquired", "r.created_at",
      "r.release_id",
      "Release.title as release_title",
      "Release.coverImage as release_cover",
      "Artist.name as release_artist"
    )

  const releaseCards = await fetchReleaseCards(pg, posts.map((p: any) => p.release_id))

  // Featured releases — the member's pinned "Top 4" for the profile header.
  const featuredIds: string[] = Array.isArray(profile.featured_releases)
    ? profile.featured_releases.map((x: any) => String(x))
    : []
  const featuredCards = await fetchReleaseCards(pg, featuredIds)
  const featured = featuredIds
    .map((id) => featuredCards[id])
    .filter(Boolean)

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

  // Every post on this page is authored by `profile` — attach it as the
  // post `author` so the shared feed cards (PostCard/EditorialCard → Byline)
  // get the CommunityAuthor object they require. Without this the storefront
  // crashes on `author.display_name` (Sentry #120272182).
  const profileCard = serializeProfile(profile)

  res.json({
    profile: profileCard,
    is_following: isFollowing,
    is_self: isSelf,
    featured,
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
      author: profileCard,
      release: p.release_id ? releaseCards[p.release_id] || null : null,
    })),
    comments: commentRows.map((c: any) => ({
      id: c.id,
      body_html: c.body_html,
      created_at: c.created_at,
      post: { slug: c.post_slug, title: c.post_title },
    })),
    reviews: reviewRows.map((r: any) => ({
      id: r.id,
      rating: r.rating,
      body_html: r.body_html,
      is_verified_acquired: !!r.is_verified_acquired,
      created_at: r.created_at,
      release: r.release_id
        ? {
            id: r.release_id,
            title: r.release_title,
            cover_image: r.release_cover,
            artist_name: r.release_artist,
          }
        : null,
    })),
  })
}
