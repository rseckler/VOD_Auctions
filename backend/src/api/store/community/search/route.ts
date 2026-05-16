import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  communityDemoEnabled,
  DEMO_AUTHOR_LIKE,
  fetchReleaseCards,
} from "../../../../lib/community"

// GET /store/community/search?q=… — full-text-ish search across the community
// (public). Postgres ILIKE is plenty at community scale — no Meili index.
// Returns matching posts, members and lists.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const q = ((req.query.q as string) || "").trim()
  if (q.length < 2) {
    res.json({ query: q, posts: [], members: [], lists: [] })
    return
  }
  const like = `%${q.toLowerCase()}%`
  const showDemo = await communityDemoEnabled(pg)

  // ── Posts ────────────────────────────────────────────────────────────────
  let postQuery = pg("community_post as p")
    .join("community_profile as a", "a.id", "p.author_id")
    .where("p.status", "published")
    .where((b: Knex.QueryBuilder) => {
      b.whereRaw("LOWER(COALESCE(p.title,'')) LIKE ?", [like])
        .orWhereRaw("LOWER(COALESCE(p.excerpt,'')) LIKE ?", [like])
        .orWhereRaw("EXISTS (SELECT 1 FROM unnest(p.tags) t WHERE LOWER(t) LIKE ?)", [like])
    })
  if (!showDemo) postQuery = postQuery.whereRaw("p.author_id NOT LIKE ?", [DEMO_AUTHOR_LIKE])
  const postRows = await postQuery
    .orderBy("p.published_at", "desc")
    .limit(12)
    .select(
      "p.id", "p.kind", "p.title", "p.slug", "p.excerpt", "p.cover_image_url",
      "p.tags", "p.release_id", "p.reaction_count", "p.comment_count",
      "p.published_at", "p.created_at",
      "a.id as author_pid", "a.handle as author_handle",
      "a.display_name as author_name", "a.avatar_url as author_avatar",
      "a.tier as author_tier", "a.is_curator as author_is_curator"
    )
  const releaseCards = await fetchReleaseCards(pg, postRows.map((r: any) => r.release_id))

  // ── Members ──────────────────────────────────────────────────────────────
  let memberQuery = pg("community_profile")
    .where("is_banned", false)
    .where((b: Knex.QueryBuilder) => {
      b.whereRaw("LOWER(handle) LIKE ?", [like]).orWhereRaw(
        "LOWER(display_name) LIKE ?",
        [like]
      )
    })
  if (!showDemo) memberQuery = memberQuery.whereRaw("id NOT LIKE ?", [DEMO_AUTHOR_LIKE])
  const memberRows = await memberQuery
    .limit(10)
    .select("handle", "display_name", "avatar_url", "tier", "location")

  // ── Lists ────────────────────────────────────────────────────────────────
  let listQuery = pg("community_list as l")
    .join("community_profile as a", "a.id", "l.author_id")
    .where("l.is_public", true)
    .where((b: Knex.QueryBuilder) => {
      b.whereRaw("LOWER(l.title) LIKE ?", [like]).orWhereRaw(
        "LOWER(COALESCE(l.description,'')) LIKE ?",
        [like]
      )
    })
  if (!showDemo) listQuery = listQuery.whereRaw("l.author_id NOT LIKE ?", [DEMO_AUTHOR_LIKE])
  const listRows = await listQuery
    .orderBy("l.item_count", "desc")
    .limit(10)
    .select(
      "l.id", "l.title", "l.slug", "l.description", "l.cover_image_url",
      "l.item_count", "a.display_name as author_name"
    )

  res.json({
    query: q,
    posts: postRows.map((r: any) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      cover_image_url: r.cover_image_url,
      tags: r.tags || [],
      is_pinned: false,
      reaction_count: r.reaction_count,
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
    members: memberRows.map((m: any) => ({
      handle: m.handle,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
      tier: m.tier,
      location: m.location,
    })),
    lists: listRows.map((l: any) => ({
      id: l.id,
      title: l.title,
      slug: l.slug,
      description: l.description,
      cover_image_url: l.cover_image_url,
      item_count: l.item_count,
      author_name: l.author_name,
    })),
  })
}
