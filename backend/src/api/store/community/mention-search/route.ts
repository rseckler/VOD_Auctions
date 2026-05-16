import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  communityDemoEnabled,
  DEMO_AUTHOR_LIKE,
} from "../../../../lib/community"
import { buildReleaseSearchWhereRaw } from "../../../../lib/release-search"

// GET /store/community/mention-search?q=… — autocomplete for @-mentions in
// the composer. Returns matching members and catalog releases.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const q = ((req.query.q as string) || "").trim()
  if (q.length < 1) {
    res.json({ users: [], releases: [] })
    return
  }
  const like = `%${q.toLowerCase()}%`

  // ── Members ──────────────────────────────────────────────────────────────
  let userQuery = pg("community_profile")
    .where("is_banned", false)
    .where((b: Knex.QueryBuilder) => {
      b.whereRaw("LOWER(handle) LIKE ?", [like]).orWhereRaw(
        "LOWER(display_name) LIKE ?",
        [like]
      )
    })
    .orderByRaw("(LOWER(handle) = ?) DESC", [q.toLowerCase()])
    .limit(6)
    .select("id", "handle", "display_name", "avatar_url", "tier")
  if (!(await communityDemoEnabled(pg))) {
    userQuery = userQuery.whereRaw("id NOT LIKE ?", [DEMO_AUTHOR_LIKE])
  }
  const userRows = await userQuery

  // ── Releases ─────────────────────────────────────────────────────────────
  let releases: any[] = []
  const search = buildReleaseSearchWhereRaw(q)
  if (search) {
    releases = await pg("Release")
      .leftJoin("Artist", "Artist.id", "Release.artistId")
      .whereRaw(search.sql, search.bindings)
      .whereNotNull("Release.coverImage")
      .orderByRaw('"Release"."updatedAt" DESC')
      .limit(5)
      .select(
        "Release.id as id",
        "Release.title as title",
        "Release.coverImage as cover_image",
        "Artist.name as artist_name"
      )
  }

  res.json({
    users: userRows.map((u: any) => ({
      id: u.id,
      handle: u.handle,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      tier: u.tier,
    })),
    releases: releases.map((r: any) => ({
      id: r.id,
      title: r.title,
      artist_name: r.artist_name,
      cover_image: r.cover_image,
    })),
  })
}
