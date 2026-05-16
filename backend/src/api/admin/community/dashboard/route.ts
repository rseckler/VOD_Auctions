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

  // Trust-level distribution (TL0–TL3) — set by the daily promotion job.
  const trustRows = await pg("community_profile")
    .where("is_banned", false)
    .groupBy("trust_level")
    .select("trust_level")
    .count("id as c")
  const trust_distribution: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0 }
  for (const t of trustRows as any[]) {
    trust_distribution[String(t.trust_level ?? 0)] = Number(t.c)
  }

  res.json({
    counts: {
      posts: Number(posts[0]?.c || 0),
      comments: Number(comments[0]?.c || 0),
      members: Number(members[0]?.c || 0),
      reviews: Number(reviews[0]?.c || 0),
      hidden_posts: Number(flagged[0]?.c || 0),
    },
    trust_distribution,
    recent_posts: recentPosts,
    recent_members: recentMembers,
  })
}
