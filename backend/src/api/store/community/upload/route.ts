import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireCommunityEnabled, getOrCreateProfile } from "../../../../lib/community"
import { optimizeImage, uploadToR2, isR2Configured } from "../../../../lib/image-upload"

const MAX_BYTES = 12 * 1024 * 1024 // 12 MB raw

// POST /store/community/upload — image upload for posts/profiles (auth required)
//
// Body: { image: "data:image/…;base64,…" | "<base64>" }
// Optimises to WebP and stores under tape-mag/community/<profileId>/ in R2.
// Returns { url }.
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
  if (!isR2Configured()) {
    res.status(503).json({ message: "Image upload is currently unavailable" })
    return
  }

  const body = (req.body || {}) as Record<string, any>
  const raw = String(body.image || "")
  const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw
  if (!base64.trim()) {
    res.status(422).json({ message: "No image provided" })
    return
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(base64, "base64")
  } catch {
    res.status(422).json({ message: "Invalid image data" })
    return
  }
  if (buffer.length === 0) {
    res.status(422).json({ message: "Empty image" })
    return
  }
  if (buffer.length > MAX_BYTES) {
    res.status(413).json({ message: "Image too large (max 12 MB)" })
    return
  }

  const profile = await getOrCreateProfile(pg, customerId)
  if (profile.is_banned) {
    res.status(403).json({ message: "Account suspended" })
    return
  }

  try {
    const optimized = await optimizeImage(buffer, 1600, 82)
    const filename = `${generateEntityId("", "img").replace(/[^a-zA-Z0-9]/g, "")}.webp`
    const url = await uploadToR2(
      optimized,
      `tape-mag/community/${profile.id}/`,
      filename
    )
    res.status(201).json({ url })
  } catch {
    res.status(500).json({ message: "Image upload failed" })
  }
}
