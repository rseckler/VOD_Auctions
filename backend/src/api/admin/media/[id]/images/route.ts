import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { optimizeImage, uploadToR2, isR2Configured } from "../../../../../lib/image-upload"
import { syncReleaseCoverFromImages, nextRang } from "../../../../../lib/release-images"
import { revalidateReleaseCatalogPage } from "../../../../../lib/storefront-revalidate"
import { pushReleaseNow } from "../../../../../lib/meilisearch-push"

// POST /admin/media/:id/images
// Body: { image_data: base64, alt?: string, set_as_cover?: boolean }
// Optimiert via sharp (max 1200px WebP), uploaded zu R2 unter tape-mag/uploads/,
// inserted Image-Row mit nextRang oder 0 (set_as_cover). Audit + Meili-Push +
// Storefront-Revalidate.
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params
  const body = req.body as {
    image_data?: string
    alt?: string
    set_as_cover?: boolean
  }

  if (!body?.image_data) {
    res.status(400).json({ message: "image_data (base64) is required" })
    return
  }
  if (!isR2Configured()) {
    res.status(503).json({ message: "R2 storage not configured on this server" })
    return
  }

  const release = await pg("Release").where("id", id).select("id").first()
  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  // Decode + optimize
  let optimized: Buffer
  let originalKb: number
  try {
    const base64Data = body.image_data.replace(/^data:image\/\w+;base64,/, "")
    const imageBuffer = Buffer.from(base64Data, "base64")
    originalKb = Math.round(imageBuffer.length / 1024)
    optimized = await optimizeImage(imageBuffer)
  } catch (e: any) {
    res.status(400).json({ message: `Invalid image data: ${e?.message ?? e}` })
    return
  }

  // Upload to R2 (tape-mag/uploads/ prefix)
  const safeRelease = id.replace(/[^a-zA-Z0-9-]/g, "_")
  const filename = `${safeRelease}_${Date.now()}.webp`
  let publicUrl: string
  try {
    publicUrl = await uploadToR2(optimized, "tape-mag/uploads/", filename)
  } catch (e: any) {
    res.status(502).json({ message: `R2 upload failed: ${e?.message ?? e}` })
    return
  }

  const imageId = generateEntityId()
  const actor = (req as any).auth_context?.actor_id
    ? { id: (req as any).auth_context.actor_id, email: (req as any).auth_context.user?.email ?? null }
    : { id: "admin", email: null }

  let resultRow: { id: string; url: string; rang: number; alt: string | null }

  await pg.transaction(async (trx) => {
    let rang: number
    if (body.set_as_cover) {
      // Bump alle existierenden Images um +10 damit der Neue an rang=0 alleine sitzt
      await trx("Image").where("releaseId", id).increment("rang", 10)
      rang = 0
    } else {
      rang = await nextRang(trx, id)
    }

    await trx("Image").insert({
      id: imageId,
      url: publicUrl,
      alt: body.alt?.trim() || null,
      releaseId: id,
      rang,
      source: "admin_upload",
    })

    await trx("release_audit_log").insert({
      id: generateEntityId(),
      release_id: id,
      field_name: "image",
      old_value: null,
      new_value: JSON.stringify({ id: imageId, url: publicUrl, rang, alt: body.alt ?? null }),
      action: "image_add",
      actor_id: actor.id,
      actor_email: actor.email,
      created_at: new Date(),
    })

    await syncReleaseCoverFromImages(trx, id)

    resultRow = { id: imageId, url: publicUrl, rang, alt: body.alt?.trim() || null }
  })

  // Fire-and-forget post-write side effects
  pushReleaseNow(pg, id).catch(() => {})
  revalidateReleaseCatalogPage(id)

  const optimizedKb = Math.round(optimized.length / 1024)
  res.json({
    image: resultRow!,
    optimization: { original_kb: originalKb, optimized_kb: optimizedKb },
    message: "Image uploaded",
  })
}
