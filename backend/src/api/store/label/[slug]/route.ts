import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /store/label/:slug — Public label detail page data
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { slug } = req.params

  // 1. Find Label by slug
  const label = await pgConnection("Label")
    .select("id", "name", "slug")
    .where("slug", slug)
    .first()

  if (!label) {
    res.status(404).json({ message: "Label not found" })
    return
  }

  // 2. Get entity_content (only if published)
  const content = await pgConnection("entity_content")
    .where({ entity_type: "label", entity_id: label.id, is_published: true })
    .first()

  // 3. Get releases on this label (product_category = 'release')
  const releases = await pgConnection("Release")
    .select(
      "Release.id",
      "Release.title",
      "Release.slug",
      "Release.format",
      "Release.year",
      "Release.country",
      "Release.coverImage",
      "Release.legacy_price",
      "Release.legacy_condition",
      "Artist.name as artist_name",
      "Format.name as format_name",
      "Format.format_group"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .where("Release.labelId", label.id)
    .andWhere("Release.product_category", "release")
    .orderBy("Release.year", "desc")
    .limit(100)

  // 4. Get label_literature
  const literature = await pgConnection("Release")
    .select(
      "Release.id",
      "Release.title",
      "Release.slug",
      "Release.format",
      "Release.year",
      "Release.country",
      "Release.coverImage",
      "Release.legacy_price",
      "Release.legacy_condition",
      "Artist.name as artist_name",
      "Format.name as format_name",
      "Format.format_group"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .where("Release.labelId", label.id)
    .andWhere("Release.product_category", "label_literature")
    .orderBy("Release.year", "desc")
    .limit(100)

  // 5. Get distinct artists on this label
  const artists = await pgConnection("Release")
    .select(
      "Artist.id",
      "Artist.name",
      "Artist.slug"
    )
    .count("Release.id as release_count")
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .where("Release.labelId", label.id)
    .whereNotNull("Release.artistId")
    .groupBy("Artist.id", "Artist.name", "Artist.slug")
    .orderByRaw("count(\"Release\".\"id\") DESC")

  // 6. Get LabelPerson data (if any)
  const persons = await pgConnection("LabelPersonLink")
    .select(
      "LabelPerson.name",
      "LabelPerson.description"
    )
    .leftJoin("LabelPerson", "LabelPersonLink.personId", "LabelPerson.id")
    .where("LabelPersonLink.labelId", label.id)

  // Total release count
  const [{ count: release_count }] = await pgConnection("Release")
    .where("labelId", label.id)
    .count("id as count")

  res.json({
    label: {
      id: label.id,
      name: label.name,
      slug: label.slug,
    },
    content: content || null,
    releases,
    literature,
    artists: artists.map((a: any) => ({
      ...a,
      release_count: Number(a.release_count),
    })),
    persons,
    release_count: Number(release_count),
  })
}
