import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import crypto from "crypto"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const R2_ENDPOINT = process.env.R2_ENDPOINT || "https://98bed59e4077ace876d8c5870be1ad39.r2.cloudflarestorage.com"
const R2_BUCKET = "vod-images"
const R2_PUBLIC_URL = "https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev"

let r2Client: S3Client | null = null
function getR2Client(): S3Client | null {
  if (r2Client) return r2Client
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) return null
  r2Client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId, secretAccessKey },
  })
  return r2Client
}

// POST /store/account/profile-avatar — Upload custom avatar image
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const client = getR2Client()
  if (!client) {
    res.status(500).json({ message: "Image upload not configured" })
    return
  }

  // Read raw body as buffer (avatar image)
  const chunks: Buffer[] = []
  for await (const chunk of req as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const body = Buffer.concat(chunks)

  if (body.length === 0) {
    res.status(400).json({ message: "No image data received" })
    return
  }
  if (body.length > 2 * 1024 * 1024) {
    res.status(400).json({ message: "Image too large (max 2 MB)" })
    return
  }

  // Detect content type from magic bytes
  let contentType = "image/jpeg"
  let ext = "jpg"
  if (body[0] === 0x89 && body[1] === 0x50) { contentType = "image/png"; ext = "png" }
  else if (body[0] === 0x52 && body[1] === 0x49) { contentType = "image/webp"; ext = "webp" }

  const hash = crypto.createHash("sha256").update(customerId).digest("hex").substring(0, 12)
  const key = `avatars/${hash}.${ext}`

  try {
    await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }))

    const avatarUrl = `${R2_PUBLIC_URL}/${key}`

    // Update profile
    const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    await pgConnection.raw(
      `INSERT INTO collector_profile (customer_id, avatar_type, avatar_url, updated_at)
       VALUES (?, 'custom', ?, NOW())
       ON CONFLICT (customer_id) DO UPDATE SET
         avatar_type = 'custom',
         avatar_url = EXCLUDED.avatar_url,
         avatar_preset = NULL,
         updated_at = NOW()`,
      [customerId, avatarUrl]
    )

    res.json({ avatar_url: avatarUrl, message: "Avatar uploaded" })
  } catch (e: any) {
    console.error("[profile-avatar] Upload error:", e)
    res.status(500).json({ message: "Upload failed" })
  }
}
