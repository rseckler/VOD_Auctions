import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import * as fs from "fs"
import * as path from "path"
import { getDataDir } from "../../../../lib/paths"

// GET /admin/sync/batch-progress — Live batch matching progress
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  // Read progress file (written by discogs_batch.py every 100 releases)
  const progressPath = path.join(getDataDir(), "discogs_batch_progress.json")
  let progress: Record<string, unknown> | null = null
  try {
    if (fs.existsSync(progressPath)) {
      const raw = fs.readFileSync(progressPath, "utf-8")
      progress = JSON.parse(raw)
    }
  } catch {
    // File not found or invalid — no batch running
  }

  // Count JSONL results file lines for real-time processed count
  const resultsPath = path.join(getDataDir(), "discogs_batch_results.jsonl")
  let resultsCount = 0
  try {
    if (fs.existsSync(resultsPath)) {
      const content = fs.readFileSync(resultsPath, "utf-8")
      resultsCount = content.split("\n").filter(Boolean).length
    }
  } catch {
    // Ignore
  }

  // Get total eligible for matching (music releases without discogs_id)
  const [totalUnmatched, lastBatchLog] = await Promise.all([
    pgConnection("Release")
      .count("id as count")
      .where("product_category", "release")
      .whereNull("discogs_id")
      .first(),

    // Last batch sync_log entry
    pgConnection("sync_log")
      .whereRaw("changes->>'processed' IS NOT NULL")
      .where("sync_type", "discogs_batch")
      .orderBy("sync_date", "desc")
      .first(),
  ])

  res.json({
    progress,
    results_count: resultsCount,
    total_unmatched: Number(totalUnmatched?.count || 0),
    last_batch: lastBatchLog
      ? {
          sync_date: lastBatchLog.sync_date,
          changes: lastBatchLog.changes,
          status: lastBatchLog.status,
        }
      : null,
  })
}
