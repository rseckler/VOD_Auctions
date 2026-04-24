import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../lib/inventory"
import { optimizeImage, uploadToR2 } from "../../../../../lib/image-upload"
import { lockFields } from "../../../../../lib/release-locks"
import { pushReleaseNow } from "../../../../../lib/meilisearch-push"

/**
 * POST /admin/erp/inventory/upload-image
 *
 * Upload a product image (e.g., from iPhone camera) during stocktake.
 * - Accepts JSON with base64-encoded image + release_id
 * - Optimizes with sharp: resize to max 1200px, WebP 80% quality
 * - Uploads to Cloudflare R2 (vod-images bucket)
 * - Inserts into Image table + updates Release.coverImage
 *
 * Returns: { url, image_id, message }
 */

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  // Parse multipart body — Medusa uses raw body parsing, so we read
  // the request as a buffer and parse manually via content-type boundary.
  // Alternative: use the raw request stream.
  const contentType = req.headers["content-type"] || ""

  if (!contentType.includes("multipart/form-data")) {
    // Fallback: accept JSON with base64-encoded image data
    // This is simpler for mobile uploads via fetch()
    const body = req.body as {
      release_id?: string
      image_data?: string  // base64 encoded
      filename?: string
    }

    if (!body?.release_id || !body?.image_data) {
      res.status(400).json({ message: "release_id and image_data (base64) are required" })
      return
    }

    const release = await pg("Release").where("id", body.release_id).select("id", "title").first()
    if (!release) {
      res.status(404).json({ message: "Release not found" })
      return
    }

    try {
      // Decode base64
      const base64Data = body.image_data.replace(/^data:image\/\w+;base64,/, "")
      const imageBuffer = Buffer.from(base64Data, "base64")

      // Optimize with sharp: resize max 1200px, WebP 80%
      const optimized = await optimizeImage(imageBuffer)

      // Generate filename + upload to R2
      const releaseSlug = body.release_id.replace(/[^a-zA-Z0-9-]/g, "_")
      const filename = `${releaseSlug}_${Date.now()}.webp`
      const publicUrl = await uploadToR2(optimized, "tape-mag/uploads/", filename)

      // Insert into Image table
      const imageId = generateEntityId()
      await pg("Image").insert({
        id: imageId,
        releaseId: body.release_id,
        url: publicUrl,
        type: "cover",
        rang: 0,  // Primary image
      })

      // Update Release.coverImage if not already set + auto-lock (rc51.1 B2).
      // Ohne lockFields würde der nächste legacy_sync_v2-Run den Admin-Upload
      // wieder auf MySQL-Wert (oft NULL) überschreiben.
      const currentRelease = await pg("Release")
        .where("id", body.release_id)
        .select("coverImage")
        .first()

      let coverLocked = false
      if (!currentRelease?.coverImage) {
        await pg.transaction(async (trx) => {
          await trx("Release")
            .where("id", body.release_id)
            .update({
              coverImage: publicUrl,
              updatedAt: new Date(),
            })
          await lockFields(trx, body.release_id!, ["coverImage"])
        })
        coverLocked = true
      }

      const originalKb = Math.round(imageBuffer.length / 1024)
      const optimizedKb = Math.round(optimized.length / 1024)

      res.json({
        message: "Image uploaded and optimized",
        url: publicUrl,
        image_id: imageId,
        original_size_kb: originalKb,
        optimized_size_kb: optimizedKb,
        compression: `${Math.round((1 - optimized.length / imageBuffer.length) * 100)}%`,
      })

      // Fire-and-forget Meili-Reindex — Admin-Upload soll sofort im Catalog sichtbar sein
      if (coverLocked) {
        pushReleaseNow(pg, body.release_id).catch((err) => {
          console.warn(
            JSON.stringify({
              event: "meili_push_now_failed",
              handler: "admin_upload_image",
              release_id: body.release_id,
              error: err?.message,
            })
          )
        })
      }
    } catch (e: any) {
      console.error("Image upload error:", e)
      res.status(500).json({ message: `Upload failed: ${e.message}` })
    }
    return
  }

  // Multipart handling would go here, but base64 JSON is simpler
  // for the admin UI (no multer dependency needed)
  res.status(400).json({ message: "Use JSON body with base64 image_data, not multipart" })
}
