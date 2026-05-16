import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  communityDemoEnabled,
  DEMO_AUTHOR_LIKE,
  getOrCreateProfile,
  uniqueListSlug,
  serializeProfile,
} from "../../../../lib/community"

// GET /store/community/lists — public curated lists (public).
// Query: author (handle), sort (recent|popular), limit, offset.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const authorHandle = req.query.author as string | undefined
  const sort = (req.query.sort as string) || "recent"
  const limit = Math.min(Number(req.query.limit) || 24, 60)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  let base = pg("community_list as l")
    .join("community_profile as a", "a.id", "l.author_id")
    .where("l.is_public", true)
  if (authorHandle) base = base.where("a.handle", authorHandle)
  if (!(await communityDemoEnabled(pg))) {
    base = base.whereRaw("l.author_id NOT LIKE ?", [DEMO_AUTHOR_LIKE])
  }

  const rows = await base
    .orderByRaw(
      sort === "popular" ? "l.item_count DESC, l.updated_at DESC" : "l.updated_at DESC"
    )
    .limit(limit)
    .offset(offset)
    .select(
      "l.id", "l.title", "l.slug", "l.description", "l.cover_image_url",
      "l.item_count", "l.updated_at",
      "a.handle as author_handle", "a.display_name as author_name",
      "a.avatar_url as author_avatar", "a.tier as author_tier"
    )

  // Up to 4 release covers per list, for the card montage.
  const listIds = rows.map((r: any) => r.id)
  const previews: Record<string, string[]> = {}
  if (listIds.length > 0) {
    const itemRows = await pg("community_list_item as i")
      .join("Release as r", "r.id", "i.release_id")
      .whereIn("i.list_id", listIds)
      .whereNotNull("r.coverImage")
      .orderBy([{ column: "i.list_id" }, { column: "i.rank" }])
      .select("i.list_id", "r.coverImage as cover")
    for (const it of itemRows as any[]) {
      const arr = (previews[it.list_id] ||= [])
      if (arr.length < 4) arr.push(it.cover)
    }
  }

  res.json({
    lists: rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      description: r.description,
      cover_image_url: r.cover_image_url,
      item_count: r.item_count,
      updated_at: r.updated_at,
      preview_covers: previews[r.id] || [],
      author: {
        handle: r.author_handle,
        display_name: r.author_name,
        avatar_url: r.author_avatar,
        tier: r.author_tier,
      },
    })),
    limit,
    offset,
  })
}

// POST /store/community/lists — create a list (auth required).
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
  const title = String(body.title || "").trim()
  if (!title) {
    res.status(422).json({ message: "A list needs a title" })
    return
  }

  const profile = await getOrCreateProfile(pg, customerId)
  if (profile.is_banned) {
    res.status(403).json({ message: "Account suspended" })
    return
  }

  const slug = await uniqueListSlug(pg, title)
  const now = new Date()
  const [row] = await pg("community_list")
    .insert({
      id: generateEntityId("", "cmlst"),
      author_id: profile.id,
      title: title.slice(0, 140),
      slug,
      description: body.description ? String(body.description).slice(0, 2000) : null,
      cover_image_url: body.cover_image_url ? String(body.cover_image_url) : null,
      is_public: body.is_public !== false,
      item_count: 0,
      created_at: now,
      updated_at: now,
    })
    .returning("*")

  res.status(201).json({ list: { ...row, author: serializeProfile(profile) } })
}
