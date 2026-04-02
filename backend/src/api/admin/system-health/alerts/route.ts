import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

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

  // ── Legacy sync status ───────────────────────────────────────────────────────
  try {
    const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

    // Get last sync run from sync_change_log
    const lastRun = await pgConnection("sync_change_log")
      .select(
        pgConnection.raw("sync_run_id as run_id"),
        pgConnection.raw("MAX(synced_at) as synced_at"),
        pgConnection.raw("COUNT(*) as total_changes")
      )
      .whereNotNull("sync_run_id")
      .groupBy("sync_run_id")
      .orderBy("synced_at", "desc")
      .first()

    if (lastRun) {
      const syncedAt = new Date(lastRun.synced_at)
      const hoursSince = (Date.now() - syncedAt.getTime()) / 3_600_000
      result.sync.last_run = {
        run_id: lastRun.run_id,
        synced_at: lastRun.synced_at,
        total_changes: Number(lastRun.total_changes),
        has_changes: Number(lastRun.total_changes) > 0,
      }
      if (hoursSince > 28) {
        result.sync.status = "error"
        result.sync.message = `Last sync ${Math.round(hoursSince)}h ago — may have failed`
      } else if (hoursSince > 26) {
        result.sync.status = "warning"
        result.sync.message = `Last sync ${Math.round(hoursSince)}h ago`
      } else {
        result.sync.status = "ok"
        result.sync.message = `Last sync ${Math.round(hoursSince)}h ago — ${lastRun.total_changes} changes`
      }
    } else {
      result.sync.status = "warning"
      result.sync.message = "No sync runs found in change log"
    }
  } catch (e: any) {
    result.sync.status = "error"
    result.sync.message = `DB error: ${e.message}`
  }

  res.json(result)
}
