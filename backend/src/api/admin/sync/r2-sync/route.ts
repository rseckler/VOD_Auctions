import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as fs from "fs"
import * as path from "path"

const R2_PUBLIC_URL = "https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev"
const TEST_IMAGE = "tape-mag/standard/Die_Gesunden_kommen_live_Tempodrom.jpg"
const PROGRESS_FILE = path.resolve(__dirname, "../../../../../../scripts/r2_sync_progress.json")

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  // 1. Read R2 sync progress file (written by legacy_sync.py)
  let progress = null
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const raw = fs.readFileSync(PROGRESS_FILE, "utf8")
      progress = JSON.parse(raw)
    }
  } catch {
    // File may not exist yet (first sync hasn't run)
  }

  // 2. Check R2 bucket health (HEAD request on known image)
  let r2_status = "unknown"
  let r2_latency_ms: number | null = null
  try {
    const start = Date.now()
    const r = await fetch(`${R2_PUBLIC_URL}/${TEST_IMAGE}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
    })
    r2_latency_ms = Date.now() - start
    r2_status = r.ok ? "ok" : `error_${r.status}`
  } catch (e: any) {
    r2_status = `unreachable: ${e.message}`
  }

  res.json({
    r2_public_url: R2_PUBLIC_URL,
    r2_status,
    r2_latency_ms,
    progress,
    progress_file_exists: progress !== null,
  })
}
