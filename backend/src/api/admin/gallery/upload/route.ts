import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

const EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
}

// POST /admin/gallery/upload — Upload an image (base64 JSON body)
// Body: { data: "base64...", filename: "original.jpg", content_type: "image/jpeg" }
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { data, filename, content_type } = req.body as {
    data: string
    filename: string
    content_type: string
  }

  if (!data || !filename || !content_type) {
    res
      .status(400)
      .json({ message: "data (base64), filename, and content_type are required" })
    return
  }

  // Validate content type
  if (!ALLOWED_TYPES.includes(content_type.toLowerCase())) {
    res
      .status(400)
      .json({ message: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(", ")}` })
    return
  }

  // Decode base64
  let buffer: Buffer
  try {
    // Strip data URI prefix if present (e.g. "data:image/jpeg;base64,")
    const base64Data = data.includes(",") ? data.split(",")[1] : data
    buffer = Buffer.from(base64Data, "base64")
  } catch {
    res.status(400).json({ message: "Invalid base64 data" })
    return
  }

  // Check file size
  if (buffer.length > MAX_SIZE) {
    res
      .status(400)
      .json({ message: `File too large. Maximum size: ${MAX_SIZE / 1024 / 1024}MB` })
    return
  }

  // Generate unique filename
  const ext = EXTENSION_MAP[content_type.toLowerCase()] || ".jpg"
  const timestamp = Date.now()
  const random = crypto.randomBytes(6).toString("hex")
  const newFilename = `gallery-${timestamp}-${random}${ext}`

  // Resolve upload directory
  // On VPS: set GALLERY_UPLOAD_DIR=/root/VOD_Auctions/storefront/public/gallery
  const uploadDir =
    process.env.GALLERY_UPLOAD_DIR ||
    path.resolve(process.cwd(), "../storefront/public/gallery")

  // Ensure directory exists
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
  } catch (err) {
    res.status(500).json({
      message: "Failed to create upload directory",
      error: String(err),
    })
    return
  }

  // Write file
  const filePath = path.join(uploadDir, newFilename)
  try {
    fs.writeFileSync(filePath, buffer)
  } catch (err) {
    res.status(500).json({
      message: "Failed to save file",
      error: String(err),
    })
    return
  }

  res.status(201).json({
    url: `/gallery/${newFilename}`,
    filename: newFilename,
    size: buffer.length,
    content_type,
  })
}
