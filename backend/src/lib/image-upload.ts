/**
 * Shared image upload utilities: download, optimize (sharp), upload to R2.
 *
 * Used by:
 * - POST /admin/erp/inventory/upload-image (iPhone photo upload)
 * - Discogs import commit (download Discogs images → R2 instead of hotlink)
 */

import sharp from "sharp"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import crypto from "crypto"

const R2_ENDPOINT = process.env.R2_ENDPOINT || "https://98bed59e4077ace876d8c5870be1ad39.r2.cloudflarestorage.com"
const R2_BUCKET = process.env.R2_BUCKET || "vod-images"
export const R2_PUBLIC_URL = "https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev"

/**
 * Check if a URL is already hosted on our R2 bucket — used to skip
 * unnecessary re-downloads when callers pass back R2 URLs.
 */
export function isR2Url(url: string): boolean {
  return typeof url === "string" && url.startsWith(R2_PUBLIC_URL + "/")
}

let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!s3Client) {
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set")
    }
    s3Client = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId, secretAccessKey },
    })
  }
  return s3Client
}

/**
 * Check if R2 credentials are configured.
 * Returns false if not — caller should fall back to hotlink.
 */
export function isR2Configured(): boolean {
  return !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
}

/**
 * Optimize an image buffer: resize to max dimension, convert to WebP.
 */
export async function optimizeImage(
  buffer: Buffer,
  maxDim = 1200,
  quality = 80
): Promise<Buffer> {
  return sharp(buffer)
    .resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer()
}

/**
 * Upload a buffer to R2. Returns the public URL.
 */
export async function uploadToR2(
  buffer: Buffer,
  prefix: string,
  filename: string,
  contentType = "image/webp"
): Promise<string> {
  const client = getS3Client()
  const key = `${prefix}${filename}`
  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))
  return `${R2_PUBLIC_URL}/${key}`
}

/**
 * Download an image from a URL, optimize it, and upload to R2.
 * Returns the public R2 URL, or null on failure.
 *
 * Used by Discogs import to replace hotlinks with own-hosted images.
 */
export async function downloadOptimizeUpload(
  sourceUrl: string,
  releaseId: string,
  imageId: string,
  prefix = "tape-mag/discogs/"
): Promise<string | null> {
  try {
    const resp = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "VOD-Auctions/1.0" },
    })
    if (!resp.ok) return null

    const arrayBuf = await resp.arrayBuffer()
    const buffer = Buffer.from(arrayBuf)

    const optimized = await optimizeImage(buffer)

    const hash = crypto.createHash("md5").update(imageId).digest("hex").slice(0, 8)
    const safeRelease = releaseId.replace(/[^a-zA-Z0-9-]/g, "_")
    const filename = `${safeRelease}_${hash}.webp`

    return await uploadToR2(optimized, prefix, filename)
  } catch {
    return null
  }
}
