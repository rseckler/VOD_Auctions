import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { enrichWithShopPrice } from "../../../../lib/shop-price"

// GET /store/band/:slug — Public band detail page data
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { slug } = req.params

  // 1. Find Artist by slug
  const artist = await pgConnection("Artist")
    .select("id", "name", "slug")
    .where("slug", slug)
    .first()

  if (!artist) {
    res.status(404).json({ message: "Artist not found" })
    return
  }

  // 2. Get entity_content (only if published)
  const content = await pgConnection("entity_content")
    .where({ entity_type: "artist", entity_id: artist.id, is_published: true })
    .first()

  // 3. Get releases by this artist (product_category = 'release')
  const releasesRaw = await pgConnection("Release")
    .select(
      "Release.id",
      "Release.title",
      "Release.slug",
      "Release.format",
      "Release.year",
      "Release.country",
      "Release.coverImage",
      "Release.legacy_price",
      "Release.shop_price",
      "Release.legacy_available",
      "Release.legacy_condition",
      "Label.name as label_name",
      "Format.name as format_name",
      "Format.format_group"
    )
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .where("Release.artistId", artist.id)
    .andWhere("Release.product_category", "release")
    .orderBy("Release.year", "desc")
    .limit(100)
  const releases = await enrichWithShopPrice(pgConnection, releasesRaw)

  // 4. Get band_literature by this artist
  const literatureRaw = await pgConnection("Release")
    .select(
      "Release.id",
      "Release.title",
      "Release.slug",
      "Release.format",
      "Release.year",
      "Release.country",
      "Release.coverImage",
      "Release.legacy_price",
      "Release.shop_price",
      "Release.legacy_available",
      "Release.legacy_condition",
      "Label.name as label_name",
      "Format.name as format_name",
      "Format.format_group"
    )
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .where("Release.artistId", artist.id)
    .andWhere("Release.product_category", "band_literature")
    .orderBy("Release.year", "desc")
    .limit(100)
  const literature = await enrichWithShopPrice(pgConnection, literatureRaw)

  // 5. Get distinct labels this artist released on
  const labels = await pgConnection("Release")
    .select(
      "Label.id",
      "Label.name",
      "Label.slug"
    )
    .count("Release.id as release_count")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .where("Release.artistId", artist.id)
    .whereNotNull("Release.labelId")
    .groupBy("Label.id", "Label.name", "Label.slug")
    .orderByRaw("count(\"Release\".\"id\") DESC")

  // Total release count
  const [{ count: release_count }] = await pgConnection("Release")
    .where("artistId", artist.id)
    .count("id as count")

  // Members (from musician database)
  let members: any[] = []
  try {
    members = await pgConnection("musician_role")
      .select(
        "musician.id",
        "musician.name",
        "musician.slug",
        "musician.real_name",
        "musician.country",
        "musician.photo_url",
        "musician_role.role",
        "musician_role.active_from",
        "musician_role.active_to",
        "musician_role.is_founder"
      )
      .join("musician", "musician.id", "musician_role.musician_id")
      .where("musician_role.artist_id", artist.id)
      .orderByRaw("musician_role.is_founder DESC, musician_role.active_from ASC NULLS FIRST")
  } catch {
    // Table may not exist yet — graceful fallback
  }

  // Other projects for each member
  const memberIds = members.map((m: any) => m.id)
  let otherProjects: any[] = []
  if (memberIds.length > 0) {
    try {
      otherProjects = await pgConnection("musician_project")
        .select("musician_project.*")
        .whereIn("musician_project.musician_id", memberIds)
        .orderBy("musician_project.project_name", "asc")
    } catch {
      // Graceful fallback
    }
  }

  // Group other projects by musician_id
  const projectsByMusician: Record<string, any[]> = {}
  for (const p of otherProjects) {
    if (!projectsByMusician[p.musician_id]) projectsByMusician[p.musician_id] = []
    projectsByMusician[p.musician_id].push(p)
  }

  const membersWithProjects = members.map((m: any) => ({
    ...m,
    other_projects: projectsByMusician[m.id] || [],
  }))

  res.json({
    artist: {
      id: artist.id,
      name: artist.name,
      slug: artist.slug,
    },
    content: content || null,
    releases,
    literature,
    labels: labels.map((l: any) => ({
      ...l,
      release_count: Number(l.release_count),
    })),
    members: membersWithProjects,
    release_count: Number(release_count),
  })
}
