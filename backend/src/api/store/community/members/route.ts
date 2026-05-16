import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  communityDemoEnabled,
  DEMO_AUTHOR_LIKE,
} from "../../../../lib/community"

// GET /store/community/members — member directory (public).
//
// Query: tier (platinum|gold|silver|bronze|standard|curator), sort
//        (activity|joined|tier), q (handle/name search), limit, offset.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const tier = (req.query.tier as string) || ""
  const sort = (req.query.sort as string) || "activity"
  const q = ((req.query.q as string) || "").trim().toLowerCase()
  const limit = Math.min(Number(req.query.limit) || 24, 60)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const showDemo = await communityDemoEnabled(pg)

  // Shared base filter — applied to both the list and the tier tally.
  const applyBase = (qb: Knex.QueryBuilder, alias = "community_profile") => {
    qb.where(`${alias}.is_banned`, false)
    if (!showDemo) qb.whereRaw(`${alias}.id NOT LIKE ?`, [DEMO_AUTHOR_LIKE])
    return qb
  }

  // ── Tier tally for the toolbar pills ─────────────────────────────────────
  const tierRows = await applyBase(pg("community_profile"))
    .groupBy("tier")
    .select("tier")
    .count("id as count")
  const tierCounts: Record<string, number> = {}
  let total = 0
  for (const r of tierRows as any[]) {
    const n = Number(r.count)
    tierCounts[r.tier] = n
    total += n
  }
  tierCounts.all = total

  // ── Member list ──────────────────────────────────────────────────────────
  let base = applyBase(
    pg("community_profile as p")
      .leftJoin("community_post as po", function (this: Knex.JoinClause) {
        this.on("po.author_id", "p.id").andOn(
          "po.status",
          pg.raw("?", ["published"])
        )
      })
      .leftJoin("community_follow as f", "f.followed_id", "p.id"),
    "p"
  )
  if (
    ["platinum", "gold", "silver", "bronze", "standard", "curator"].includes(
      tier
    )
  ) {
    base = base.where("p.tier", tier)
  }
  if (q) {
    base = base.where((b: Knex.QueryBuilder) => {
      b.whereRaw("LOWER(p.handle) LIKE ?", [`%${q}%`]).orWhereRaw(
        "LOWER(p.display_name) LIKE ?",
        [`%${q}%`]
      )
    })
  }

  const tierRank =
    "CASE p.tier WHEN 'curator' THEN 0 WHEN 'platinum' THEN 1 " +
    "WHEN 'gold' THEN 2 WHEN 'silver' THEN 3 WHEN 'bronze' THEN 4 ELSE 5 END"
  const orderBy =
    sort === "joined"
      ? "p.created_at DESC"
      : sort === "tier"
        ? `${tierRank} ASC, count(DISTINCT po.id) DESC`
        : "count(DISTINCT po.id) DESC, count(DISTINCT f.follower_id) DESC"

  const rows = await base
    .groupBy("p.id")
    .orderByRaw(orderBy)
    .limit(limit)
    .offset(offset)
    .select(
      "p.id",
      "p.handle",
      "p.display_name",
      "p.avatar_url",
      "p.tier",
      "p.is_curator",
      "p.location",
      "p.bio",
      "p.collector_since",
      pg.raw("count(DISTINCT po.id)::int as post_count"),
      pg.raw("count(DISTINCT f.follower_id)::int as follower_count")
    )

  res.json({
    members: rows.map((m: any) => ({
      handle: m.handle,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
      tier: m.tier,
      is_curator: !!m.is_curator,
      location: m.location,
      bio: m.bio,
      collector_since: m.collector_since,
      post_count: Number(m.post_count || 0),
      follower_count: Number(m.follower_count || 0),
    })),
    tier_counts: tierCounts,
    limit,
    offset,
  })
}
