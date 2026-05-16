import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  communityDemoEnabled,
  DEMO_AUTHOR_LIKE,
  getOrCreateProfile,
  getProfileByCustomerId,
  sanitizeBodyHtml,
  excerptFromHtml,
  uniquePostSlug,
  fetchReleaseCards,
  fetchReactionBreakdown,
  serializeProfile,
  refreshTrustLevel,
  dailyPostLimit,
  notifyMentions,
} from "../../../../lib/community"

// GET /store/community/posts — Hub feed (public)
//
// Query: release_id, kind (discussion|editorial), author (handle),
//        feed=following (personalised — followed members + editorials),
//        q (title/excerpt search), limit (default 20, max 50), offset
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const releaseId = req.query.release_id as string | undefined
  const kind = req.query.kind as string | undefined
  const authorHandle = req.query.author as string | undefined
  const feed = req.query.feed as string | undefined
  const tag = ((req.query.tag as string) || "").toLowerCase().trim()
  const q = ((req.query.q as string) || "").trim()
  const limit = Math.min(Number(req.query.limit) || 20, 50)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  let base = pg("community_post as p")
    .join("community_profile as a", "a.id", "p.author_id")
    .where("p.status", "published")
  // Hide the demo dataset unless COMMUNITY_DEMO is on.
  if (!(await communityDemoEnabled(pg))) {
    base = base.whereRaw("p.author_id NOT LIKE ?", [DEMO_AUTHOR_LIKE])
  }
  if (releaseId) base = base.where("p.release_id", releaseId)
  // Entity-anchor filters — Band/Label/Press walls.
  if (req.query.artist_id) base = base.where("p.artist_id", String(req.query.artist_id))
  if (req.query.label_id) base = base.where("p.label_id", String(req.query.label_id))
  if (req.query.press_id) base = base.where("p.press_id", String(req.query.press_id))
  if (kind === "discussion" || kind === "editorial") base = base.where("p.kind", kind)
  if (authorHandle) base = base.where("a.handle", authorHandle)
  if (tag) base = base.whereRaw("? = ANY(p.tags)", [tag])

  // Personalised feed — posts by followed members + all editorials.
  if (feed === "following") {
    const customerId = (req as any).auth_context?.actor_id
    const viewer = customerId ? await getProfileByCustomerId(pg, customerId) : null
    if (viewer) {
      const followRows = await pg("community_follow")
        .where("follower_id", viewer.id)
        .select("followed_id")
      const followedIds = followRows.map((r: any) => r.followed_id)
      base = base.where((b: any) => {
        b.where("p.kind", "editorial")
        if (followedIds.length > 0) b.orWhereIn("p.author_id", followedIds)
      })
    }
  }
  if (q) {
    const like = `%${q.toLowerCase()}%`
    base = base.where((b: any) => {
      b.whereRaw("LOWER(COALESCE(p.title,'')) LIKE ?", [like])
        .orWhereRaw("LOWER(COALESCE(p.excerpt,'')) LIKE ?", [like])
    })
  }

  const countRows = await base.clone().count("p.id as count")
  const total = Number(countRows[0]?.count || 0)

  const rows = await base
    .clone()
    .select(
      "p.id", "p.kind", "p.title", "p.slug", "p.excerpt", "p.cover_image_url",
      "p.tags", "p.release_id", "p.is_pinned", "p.reaction_count",
      "p.comment_count", "p.published_at", "p.created_at",
      "a.id as author_pid", "a.handle as author_handle",
      "a.display_name as author_name", "a.avatar_url as author_avatar",
      "a.tier as author_tier", "a.is_curator as author_is_curator"
    )
    .orderBy([
      { column: "p.is_pinned", order: "desc" },
      { column: "p.published_at", order: "desc" },
    ])
    .limit(limit)
    .offset(offset)

  const releaseCards = await fetchReleaseCards(pg, rows.map((r: any) => r.release_id))
  const reactionMap = await fetchReactionBreakdown(
    pg,
    "post",
    rows.map((r: any) => r.id)
  )

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
    count: total,
    limit,
    offset,
  })
}

// POST /store/community/posts — create a post (auth required)
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

  const body = (req.body || {}) as Record<string, any>
  const bodyHtml = sanitizeBodyHtml(String(body.body_html || ""))
  if (!bodyHtml.trim() && !body.title) {
    res.status(422).json({ message: "Post needs a title or body" })
    return
  }

  const profile = await getOrCreateProfile(pg, customerId)
  if (profile.is_banned) {
    res.status(403).json({ message: "Account suspended" })
    return
  }

  // Trust-level daily post cap — spam guard for newcomers (Increment 4C).
  const trustLevel = await refreshTrustLevel(pg, profile)
  const limit = dailyPostLimit(trustLevel)
  if (limit >= 0) {
    const since = new Date(Date.now() - 86_400_000)
    const recent = await pg("community_post")
      .where("author_id", profile.id)
      .where("created_at", ">=", since)
      .count("id as c")
    if (Number(recent[0]?.c || 0) >= limit) {
      res.status(429).json({
        message: `Daily post limit reached (${limit}). Please try again later.`,
      })
      return
    }
  }

  // 'editorial' is reserved for curators; everyone else posts 'discussion'.
  const kind = body.kind === "editorial" && profile.is_curator ? "editorial" : "discussion"
  const title = body.title ? String(body.title).slice(0, 200) : null
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t: any) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 8)
    : []
  const slug = await uniquePostSlug(pg, title || "post")
  const now = new Date()

  const [row] = await pg("community_post")
    .insert({
      id: generateEntityId("", "cmpst"),
      author_id: profile.id,
      kind,
      title,
      slug,
      body_json: body.body_json ? JSON.stringify(body.body_json) : null,
      body_html: bodyHtml,
      excerpt: excerptFromHtml(bodyHtml),
      cover_image_url: body.cover_image_url ? String(body.cover_image_url) : null,
      tags,
      release_id: body.release_id ? String(body.release_id) : null,
      artist_id: body.artist_id ? String(body.artist_id) : null,
      label_id: body.label_id ? String(body.label_id) : null,
      press_id: body.press_id ? String(body.press_id) : null,
      status: "published",
      created_at: now,
      updated_at: now,
      published_at: now,
    })
    .returning("*")

  // Notify any @-mentioned members.
  await notifyMentions(pg, bodyHtml, profile.id, {
    kind: "post",
    id: row.id,
    slug: row.slug,
  })

  res.status(201).json({ post: { ...row, author: serializeProfile(profile) } })
}
