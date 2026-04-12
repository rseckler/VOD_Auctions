import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getProjectRoot } from "../../lib/paths"
import path from "path"
import fs from "fs"

/**
 * GET /manifest.json
 *
 * Serve the PWA manifest for the POS app.
 * Unauthenticated — browsers fetch this before any auth flow.
 */
export async function GET(
  _req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const manifestPath = path.join(getProjectRoot(), "public", "manifest.json")
  try {
    const content = fs.readFileSync(manifestPath, "utf8")
    res.setHeader("Content-Type", "application/manifest+json")
    res.setHeader("Cache-Control", "public, max-age=86400")
    res.send(content)
  } catch {
    res.status(404).json({ message: "manifest.json not found" })
  }
}
