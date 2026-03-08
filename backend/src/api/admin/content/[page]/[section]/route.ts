import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  generateEntityId,
} from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/content/:page/:section — Get single section
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { page, section } = req.params

  const row = await pgConnection("content_block")
    .where({ page, section })
    .first()

  if (!row) {
    res.status(404).json({ message: "Content block not found" })
    return
  }

  res.json({ content_block: row })
}

// POST /admin/content/:page/:section — Upsert section content
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { page, section } = req.params
  const { content, sort_order, is_published } = req.body as {
    content: Record<string, unknown>
    sort_order?: number
    is_published?: boolean
  }

  if (!content) {
    res.status(400).json({ message: "content is required" })
    return
  }

  const existing = await pgConnection("content_block")
    .where({ page, section })
    .first()

  if (existing) {
    // Update
    await pgConnection("content_block")
      .where({ page, section })
      .update({
        content: JSON.stringify(content),
        ...(sort_order !== undefined && { sort_order }),
        ...(is_published !== undefined && { is_published }),
        updated_at: new Date().toISOString(),
      })
  } else {
    // Insert
    await pgConnection("content_block").insert({
      id: generateEntityId(),
      page,
      section,
      content: JSON.stringify(content),
      sort_order: sort_order ?? 0,
      is_published: is_published ?? true,
      updated_at: new Date().toISOString(),
    })
  }

  const row = await pgConnection("content_block")
    .where({ page, section })
    .first()

  // Trigger on-demand revalidation of the storefront page
  const storefrontUrl = process.env.STOREFRONT_URL || "https://vod-auctions.com"
  const revalidateSecret = process.env.REVALIDATE_SECRET
  if (revalidateSecret) {
    const pathMap: Record<string, string> = { home: "/", about: "/about", auctions: "/auctions" }
    const revalidatePath = pathMap[page] || "/"
    fetch(`${storefrontUrl}/api/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-revalidate-secret": revalidateSecret },
      body: JSON.stringify({ path: revalidatePath }),
    }).catch(() => {})
  }

  res.json({ content_block: row })
}
