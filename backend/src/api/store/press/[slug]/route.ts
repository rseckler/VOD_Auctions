import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { enrichWithShopPrice } from "../../../../lib/shop-price"

// GET /store/press/:slug — Public press orga detail page data
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { slug } = req.params

  // 1. Find PressOrga by slug
  const pressOrga = await pgConnection("PressOrga")
    .select("id", "name", "slug", "country", "year")
    .where("slug", slug)
    .first()

  if (!pressOrga) {
    res.status(404).json({ message: "Press organisation not found" })
    return
  }

  // 2. Get entity_content (only if published)
  const content = await pgConnection("entity_content")
    .where({ entity_type: "press_orga", entity_id: pressOrga.id, is_published: true })
    .first()

  // 3. Get press_literature by this press orga
  const publicationsRaw = await pgConnection("Release")
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
      "Artist.name as artist_name",
      "Format.name as format_name",
      "Format.format_group"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .where("Release.pressOrgaId", pressOrga.id)
    .andWhere("Release.product_category", "press_literature")
    .orderBy("Release.year", "desc")
    .limit(100)
  const publications = await enrichWithShopPrice(pgConnection, publicationsRaw)

  // Total publication count
  const [{ count: publication_count }] = await pgConnection("Release")
    .where("pressOrgaId", pressOrga.id)
    .count("id as count")

  res.json({
    press_orga: {
      id: pressOrga.id,
      name: pressOrga.name,
      slug: pressOrga.slug,
      country: pressOrga.country,
      year: pressOrga.year,
    },
    content: content || null,
    publications,
    publication_count: Number(publication_count),
  })
}
