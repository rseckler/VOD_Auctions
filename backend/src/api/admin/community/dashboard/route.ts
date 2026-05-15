import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireCommunityEnabled } from "../../../../lib/community"

// GET /admin/community/dashboard — counts + recent activity for the admin hub.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const [posts, comments, members, reviews, flagged] = await Promise.all([
    pg("community_post").where("status", "published").count("id as c"),
    pg("community_comment").where("status", "published").count("id as c"),
    pg("community_profile").count("id as c"),
    pg("community_review").where("status", "published").count("id as c"),
    pg("community_post").whereIn("status", ["hidden", "removed"]).count("id as c"),
  ])

  const recentPosts = await pg("community_post as p")
    .join("community_profile as a", "a.id", "p.author_id")
    .orderBy("p.created_at", "desc")
    .limit(8)
    .select(
      "p.id", "p.title", "p.slug", "p.kind", "p.status", "p.created_at",
      "a.handle as author_handle", "a.display_name as author_name"
    )

  const recentMembers = await pg("community_profile")
    .orderBy("created_at", "desc")
    .limit(8)
    .select("id", "handle", "display_name", "tier", "is_curator", "created_at")

  res.json({
    counts: {
      posts: Number(posts[0]?.c || 0),
      comments: Number(comments[0]?.c || 0),
      members: Number(members[0]?.c || 0),
      reviews: Number(reviews[0]?.c || 0),
      hidden_posts: Number(flagged[0]?.c || 0),
    },
    recent_posts: recentPosts,
    recent_members: recentMembers,
  })
}
