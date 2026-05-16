import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  communityDemoEnabled,
  DEMO_AUTHOR_LIKE,
} from "../../../../lib/community"

// GET /store/community/hub-sidebar — aggregated data for the Community hub
// sidebar: live auction blocks, suggested members, contextual catalog picks.
// One round-trip so the hub renders the whole right rail server-side.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const showDemo = await communityDemoEnabled(pg)

  // ── Active auction blocks ────────────────────────────────────────────────
  const blockRows = await pg("auction_block")
    .whereNull("deleted_at")
    .whereIn("status", ["active", "preview", "scheduled"])
    .orderByRaw("end_time ASC NULLS LAST")
    .limit(3)
    .select("id", "title", "slug", "status", "end_time", "total_items")

  const blockIds = blockRows.map((b: any) => b.id)
  const priceByBlock: Record<string, number> = {}
  if (blockIds.length > 0) {
    const priceRows = await pg("block_item")
      .whereIn("auction_block_id", blockIds)
      .whereNull("deleted_at")
      .groupBy("auction_block_id")
      .select("auction_block_id")
      .min("start_price as min_price")
    for (const r of priceRows) {
      const v = Number(r.min_price)
      if (Number.isFinite(v) && v > 0) priceByBlock[r.auction_block_id] = v
    }
  }

  const active_blocks = blockRows.map((b: any) => ({
    id: b.id,
    title: b.title,
    slug: b.slug,
    status: b.status,
    end_time: b.end_time,
    lots: Number(b.total_items || 0),
    from_price: priceByBlock[b.id] ?? null,
  }))

  // ── Suggested members — most-followed profiles ───────────────────────────
  let suggestedQuery = pg("community_profile as p")
    .leftJoin("community_follow as f", "f.followed_id", "p.id")
    .where("p.is_banned", false)
    .groupBy("p.id")
    .orderByRaw("count(f.follower_id) DESC, p.created_at DESC")
    .limit(6)
    .select(
      "p.handle", "p.display_name", "p.avatar_url", "p.tier",
      "p.location", "p.is_curator"
    )
  if (!showDemo) {
    suggestedQuery = suggestedQuery.whereRaw("p.id NOT LIKE ?", [DEMO_AUTHOR_LIKE])
  }
  const suggestedRows = await suggestedQuery
  const suggested_members = suggestedRows.map((m: any) => ({
    handle: m.handle,
    display_name: m.display_name,
    avatar_url: m.avatar_url,
    tier: m.tier,
    location: m.location,
    is_curator: !!m.is_curator,
  }))

  // ── Catalog picks — releases most recently referenced by community posts,
  //    falling back to recent cover-art releases when the community is quiet.
  let postQuery = pg("community_post")
    .whereNotNull("release_id")
    .where("status", "published")
  if (!showDemo) {
    postQuery = postQuery.whereRaw("author_id NOT LIKE ?", [DEMO_AUTHOR_LIKE])
  }
  const anchorRows = await postQuery
    .orderBy("published_at", "desc")
    .limit(20)
    .select("release_id")
  const anchorIds = [
    ...new Set(anchorRows.map((r: any) => r.release_id).filter(Boolean)),
  ].slice(0, 4)

  let pickRows: any[] = []
  if (anchorIds.length > 0) {
    pickRows = await pg("Release as r")
      .leftJoin("Artist as a", "a.id", "r.artistId")
      .whereIn("r.id", anchorIds)
      .whereNotNull("r.coverImage")
      .select("r.id", "r.title", "r.coverImage as cover_image", "a.name as artist_name")
  }
  if (pickRows.length < 3) {
    const extra = await pg("Release as r")
      .leftJoin("Artist as a", "a.id", "r.artistId")
      .whereNotNull("r.coverImage")
      .whereNotNull("r.shop_price")
      .whereNotIn("r.id", pickRows.map((p) => p.id).concat(["__none__"]))
      .orderBy("r.updatedAt", "desc")
      .limit(3 - pickRows.length)
      .select("r.id", "r.title", "r.coverImage as cover_image", "a.name as artist_name")
    pickRows = pickRows.concat(extra)
  }
  const catalog_picks = pickRows.slice(0, 3).map((r: any) => ({
    id: r.id,
    title: r.title,
    cover_image: r.cover_image,
    artist_name: r.artist_name,
  }))

  res.json({ active_blocks, suggested_members, catalog_picks })
}
