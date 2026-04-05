import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import * as path from "path"
import { getScriptsDir } from "../../../../lib/paths"

const SENTRY_TOKEN = process.env.SENTRY_API_TOKEN || ""
const SENTRY_ORG = "vod-records"
const SENTRY_PROJECT_ID = "4510997341798480"

type SentryIssue = {
  id: string
  title: string
  level: "fatal" | "error" | "warning" | "info"
  culprit: string
  count: string
  firstSeen: string
  lastSeen: string
  permalink: string
}

type SyncRun = {
  run_id: string
  synced_at: string
  total_changes: number
  has_changes: boolean
}

/**
 * GET /admin/system-health/alerts
 *
 * Returns:
 * - sentry: recent issues (last 7 days)
 * - sync: last legacy sync run info
 * - entity: entity content pipeline last activity
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const result: {
    sentry: { issues: SentryIssue[]; error?: string; configured: boolean }
    sync: { last_run: SyncRun | null; status: "ok" | "warning" | "error"; message: string }
    checked_at: string
  } = {
    sentry: { issues: [], configured: !!SENTRY_TOKEN },
    sync: { last_run: null, status: "ok", message: "" },
    checked_at: new Date().toISOString(),
  }

  // ── Sentry issues ────────────────────────────────────────────────────────────
  if (SENTRY_TOKEN) {
    try {
      const url = `https://sentry.io/api/0/organizations/${SENTRY_ORG}/issues/?project=${SENTRY_PROJECT_ID}&limit=10&statsPeriod=7d&query=is:unresolved&sort=date`
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${SENTRY_TOKEN}` },
        signal: AbortSignal.timeout(8000),
      })
      if (r.ok) {
        const issues = await r.json() as SentryIssue[]
        result.sentry.issues = issues.map((i) => ({
          id: i.id,
          title: i.title,
          level: i.level,
          culprit: i.culprit,
          count: i.count,
          firstSeen: i.firstSeen,
          lastSeen: i.lastSeen,
          permalink: i.permalink,
        }))
      } else {
        result.sentry.error = `Sentry API ${r.status}`
      }
    } catch (e: any) {
      result.sentry.error = e.message
    }
  }

  // ── Legacy sync status (log file mtime + optional DB change count) ──────────
  try {
    const fs = await import("fs")
    const SYNC_LOG_PATH = path.join(getScriptsDir(), "legacy_sync.log")

    let logStat: any = null
    try { logStat = fs.statSync(SYNC_LOG_PATH) } catch { /* file not found on dev */ }

    if (logStat) {
      const modifiedAt = new Date(logStat.mtime)
      const hoursSince = (Date.now() - modifiedAt.getTime()) / 3_600_000

      const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
      const recentChanges = await pgConnection("sync_change_log")
        .where("synced_at", ">=", new Date(Date.now() - 48 * 3_600_000))
        .count("* as count")
        .first()
      const changeCount = Number(recentChanges?.count || 0)

      result.sync.last_run = {
        run_id: modifiedAt.toISOString().slice(0, 10),
        synced_at: modifiedAt.toISOString(),
        total_changes: changeCount,
        has_changes: changeCount > 0,
      }
      if (hoursSince > 28) {
        result.sync.status = "error"
        result.sync.message = `Last sync ${Math.round(hoursSince)}h ago — may have failed`
      } else if (hoursSince > 26) {
        result.sync.status = "warning"
        result.sync.message = `Last sync ${Math.round(hoursSince)}h ago`
      } else {
        result.sync.status = "ok"
        result.sync.message = `Last sync ${Math.round(hoursSince)}h ago — ${changeCount} changes`
      }
    } else {
      result.sync.status = "warning"
      result.sync.message = "Sync log file not found (dev environment?)"
    }
  } catch (e: any) {
    result.sync.status = "error"
    result.sync.message = `Sync check error: ${e.message}`
  }

  res.json(result)
}
