import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

const STOREFRONT_URL = process.env.STOREFRONT_URL || "https://vod-auctions.com"

// GET /store/gallery — Public: active gallery media grouped by section + content blocks
// Query params:
//   absolute_urls=true — prepend STOREFRONT_URL to relative image URLs (for newsletters/emails)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const absoluteUrls = req.query.absolute_urls === "true"

  // Fetch active gallery media
  const mediaRows = await pgConnection("gallery_media")
    .select("*")
    .where("is_active", true)
    .orderBy("section")
    .orderBy("position")

  // Optionally convert relative URLs to absolute (for email/newsletter use)
  if (absoluteUrls) {
    for (const row of mediaRows) {
      if (row.url && row.url.startsWith("/")) {
        row.url = `${STOREFRONT_URL}${row.url}`
      }
    }
  }

  // Group by section
  const media: Record<string, typeof mediaRows> = {}
  for (const row of mediaRows) {
    if (!media[row.section]) media[row.section] = []
    media[row.section].push(row)
  }

  // Fetch gallery content blocks
  const contentRows = await pgConnection("content_block")
    .select("section", "content")
    .where("page", "gallery")
    .where("is_published", true)
    .orderBy("sort_order")

  // Build content map: section → content object
  const content: Record<string, unknown> = {}
  for (const row of contentRows) {
    content[row.section] = row.content
  }

  res.json({ media, content })
}
