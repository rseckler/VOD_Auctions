/**
 * GET /admin/system-health/history?service=<name>&window=<24h|7d|1h|6h>&bucket_minutes=<int>
 *
 * Returns time-series buckets for one service (§P2.1).
 * Admin-auth by default (Medusa-native on /admin/*).
 *
 * Window → default bucket size:
 *   1h → 1min (60 buckets)
 *   6h → 5min (72 buckets)
 *   24h → 5min (288 buckets)
 *   7d → 30min (336 buckets)
 *
 * Severity-rank in a bucket = worst-severity (CASE precedence).
 * uptime_pct = buckets with severity ∈ {ok, insufficient_signal, unconfigured} / total.
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

type Window = "1h" | "6h" | "24h" | "7d"

const WINDOW_SECONDS: Record<Window, number> = {
  "1h": 3600,
  "6h": 21_600,
  "24h": 86_400,
  "7d": 604_800,
}

const DEFAULT_BUCKET_MINUTES: Record<Window, number> = {
  "1h": 1,
  "6h": 5,
  "24h": 5,
  "7d": 30,
}

const SEVERITY_BY_RANK: Record<number, string> = {
  0: "ok",
  1: "insufficient_signal",
  2: "degraded",
  3: "warning",
  4: "error",
  5: "critical",
}

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const service = (req.query?.service as string | undefined)?.trim()
  if (!service) {
    res.status(400).json({ error: "?service=<name> required" })
    return
  }
  const window = ((req.query?.window as string) || "24h").toLowerCase() as Window
  if (!(window in WINDOW_SECONDS)) {
    res.status(400).json({ error: `invalid window, must be one of ${Object.keys(WINDOW_SECONDS).join(", ")}` })
    return
  }
  const bucketMinRaw = Number(req.query?.bucket_minutes)
  const bucketMinutes = Number.isFinite(bucketMinRaw) && bucketMinRaw > 0
    ? Math.min(60, Math.max(1, Math.floor(bucketMinRaw)))
    : DEFAULT_BUCKET_MINUTES[window]

  const environment = process.env.NODE_ENV === "production" ? "prod" : "dev"

  // Bucket aggregation via date_trunc + modulo for sub-hour buckets
  const { rows } = await pg.raw(
    `WITH raw AS (
       SELECT checked_at, severity, latency_ms
         FROM health_check_log
        WHERE service_name = ?
          AND environment = ?
          AND checked_at > NOW() - (? || ' seconds')::interval
     ),
     bucketed AS (
       SELECT
         to_timestamp(floor(extract(epoch FROM checked_at) / (? * 60)) * (? * 60)) AS bucket_start,
         severity, latency_ms
       FROM raw
     )
     SELECT bucket_start,
            COUNT(*)::int AS sample_count,
            ROUND(AVG(latency_ms))::int AS avg_latency_ms,
            MAX(CASE severity
                  WHEN 'critical'            THEN 5
                  WHEN 'error'               THEN 4
                  WHEN 'warning'             THEN 3
                  WHEN 'degraded'            THEN 2
                  WHEN 'insufficient_signal' THEN 1
                  WHEN 'unconfigured'        THEN 1
                  WHEN 'ok'                  THEN 0
                  ELSE 0
                END) AS severity_rank
       FROM bucketed
      GROUP BY bucket_start
      ORDER BY bucket_start ASC`,
    [service, environment, WINDOW_SECONDS[window], bucketMinutes, bucketMinutes]
  )

  const buckets = (rows as any[]).map((r) => ({
    start: new Date(r.bucket_start).toISOString(),
    severity: SEVERITY_BY_RANK[r.severity_rank] || "ok",
    sample_count: r.sample_count,
    avg_latency_ms: r.avg_latency_ms,
  }))

  const healthyBuckets = buckets.filter((b) => b.severity === "ok" || b.severity === "insufficient_signal" || b.severity === "unconfigured").length
  const uptime_pct = buckets.length > 0 ? Number(((healthyBuckets / buckets.length) * 100).toFixed(2)) : null

  res.json({
    service,
    window,
    bucket_minutes: bucketMinutes,
    bucket_count: buckets.length,
    uptime_pct,
    buckets,
  })
}
