import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  communityDemoEnabled,
  DEMO_AUTHOR_LIKE,
  getOrCreateProfile,
  sanitizeBodyHtml,
  serializeProfile,
} from "../../../../lib/community"

// GET /store/community/reviews?release_id=… — reviews for a release (public)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const releaseId = req.query.release_id as string | undefined
  if (!releaseId) {
    res.status(422).json({ message: "release_id is required" })
    return
  }

  const reviewsQuery = pg("community_review as r")
    .join("community_profile as a", "a.id", "r.author_id")
    .where("r.release_id", releaseId)
    .where("r.status", "published")
  // Hide demo-authored reviews unless COMMUNITY_DEMO is on.
  if (!(await communityDemoEnabled(pg))) {
    reviewsQuery.whereRaw("r.author_id NOT LIKE ?", [DEMO_AUTHOR_LIKE])
  }
  const rows = await reviewsQuery
    .orderBy("r.created_at", "desc")
    .select(
      "r.id", "r.rating", "r.body_html", "r.is_verified_acquired",
      "r.reaction_count", "r.created_at",
      "a.id as author_pid", "a.handle as author_handle",
      "a.display_name as author_name", "a.avatar_url as author_avatar",
      "a.tier as author_tier", "a.is_curator as author_is_curator"
    )

  const rated = rows.filter((r: any) => r.rating != null)
  const average =
    rated.length > 0
      ? rated.reduce((s: number, r: any) => s + Number(r.rating), 0) / rated.length
      : null

  res.json({
    reviews: rows.map((r: any) => ({
      id: r.id,
      rating: r.rating,
      body_html: r.body_html,
      is_verified_acquired: !!r.is_verified_acquired,
      reaction_count: r.reaction_count,
      created_at: r.created_at,
      author: {
        id: r.author_pid,
        handle: r.author_handle,
        display_name: r.author_name,
        avatar_url: r.author_avatar,
        tier: r.author_tier,
        is_curator: !!r.author_is_curator,
      },
    })),
    average_rating: average != null ? Math.round(average * 10) / 10 : null,
    rating_count: rated.length,
    review_count: rows.length,
  })
}

// POST /store/community/reviews — create or update own review (auth required)
//
// Body: { release_id, rating (1-5), body_html?, body_json? }
// One review per (release_id, member): a repeat POST updates the existing row.
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
  const releaseId = body.release_id ? String(body.release_id) : ""
  const rating = Number(body.rating)
  if (!releaseId) {
    res.status(422).json({ message: "release_id is required" })
    return
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(422).json({ message: "rating must be an integer 1–5" })
    return
  }

  const release = await pg("Release").where({ id: releaseId }).first("id")
  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  const profile = await getOrCreateProfile(pg, customerId)
  if (profile.is_banned) {
    res.status(403).json({ message: "Account suspended" })
    return
  }

  const bodyHtml = body.body_html ? sanitizeBodyHtml(String(body.body_html)) : null
  const bodyJson = body.body_json ? JSON.stringify(body.body_json) : null
  const now = new Date()

  const existing = await pg("community_review")
    .where({ release_id: releaseId, author_id: profile.id })
    .first("id")

  let row: any
  if (existing) {
    ;[row] = await pg("community_review")
      .where({ id: existing.id })
      .update({ rating, body_html: bodyHtml, body_json: bodyJson, updated_at: now })
      .returning("*")
  } else {
    ;[row] = await pg("community_review")
      .insert({
        id: generateEntityId("", "cmrev"),
        release_id: releaseId,
        author_id: profile.id,
        rating,
        body_html: bodyHtml,
        body_json: bodyJson,
        status: "published",
        created_at: now,
        updated_at: now,
      })
      .returning("*")
  }

  res.status(existing ? 200 : 201).json({
    review: { ...row, author: serializeProfile(profile) },
  })
}
