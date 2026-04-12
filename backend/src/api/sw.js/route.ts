import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getProjectRoot } from "../../lib/paths"
import path from "path"
import fs from "fs"

/**
 * GET /sw.js
 *
 * Serve the PWA service worker for the POS app.
 * Must be served from root scope for proper SW registration.
 * Unauthenticated — SW registration happens before auth.
 */
export async function GET(
  _req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const swPath = path.join(getProjectRoot(), "public", "sw.js")
  try {
    const content = fs.readFileSync(swPath, "utf8")
    res.setHeader("Content-Type", "application/javascript")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Service-Worker-Allowed", "/")
    res.send(content)
  } catch {
    res.status(404).json({ message: "sw.js not found" })
  }
}
