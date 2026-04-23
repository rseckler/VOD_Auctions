/**
 * GET /admin/system-health
 *
 * Reader-Endpoint (System Health Evolution Plan §3.3).
 * Reads the latest sample per service_name from health_check_log.
 * Does NOT run checks — Sampler writes, we read.
 *
 * Applies staleness detection: if a sample is older than 2× the expected
 * interval for its class, the UI shows a "[stale Xmin]" suffix.
 *
 * Bootstrap: if the table is empty (first deploy before Sampler ran),
 * returns services: [] with bootstrap_needed=true.
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { CHECKS, CheckClass, ServiceStatus, getCheckByName } from "../../../lib/health-checks"

type ServiceCheck = {
  name: string
  label: string
  status: ServiceStatus
  message: string
  latency_ms: number | null
  url?: string
  category?: string
  check_class?: CheckClass
  runbook?: string
  metadata?: Record<string, unknown>
}

// ── Staleness thresholds (multiples of expected interval) ──────────────
const INTERVAL_MS: Record<CheckClass, number> = {
  fast: 60_000,
  background: 300_000,
  synthetic: 900_000,
}

function stalenessFor(checked_at: Date, check_class: CheckClass): { stale: boolean; age_ms: number; age_min: number } {
  const age_ms = Date.now() - checked_at.getTime()
  const threshold = 2 * INTERVAL_MS[check_class]
  return { stale: age_ms > threshold, age_ms, age_min: Math.round(age_ms / 60_000) }
}

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const environment = process.env.NODE_ENV === "production" ? "prod" : "dev"

  // ── DISTINCT ON — latest sample per service_name ──────────────────────
  const { rows } = await pg.raw(
    `SELECT DISTINCT ON (service_name)
       service_name, category, check_class, severity, latency_ms, message, metadata, checked_at, source
     FROM health_check_log
     WHERE environment = ?
     ORDER BY service_name, checked_at DESC`,
    [environment]
  )

  // ── Bootstrap case: Sampler hasn't run yet ────────────────────────────
  if (!rows || rows.length === 0) {
    res.json({
      summary: { total: 0, ok: 0, degraded: 0, warning: 0, error: 0, critical: 0, insufficient_signal: 0, unconfigured: 0, errors: 0 },
      services: [],
      checked_at: null,
      bootstrap_needed: true,
      bootstrap_hint: "No samples yet. Run: POST /health-sample with X-Sampler-Token header.",
    })
    return
  }

  // ── Merge DB rows with registry metadata (label, url) ─────────────────
  const services: ServiceCheck[] = rows.map((row: any) => {
    const def = getCheckByName(row.service_name)
    const checkedAt = new Date(row.checked_at)
    const { stale, age_min } = stalenessFor(checkedAt, row.check_class as CheckClass)
    const baseMessage = row.message || ""
    const message = stale
      ? `${baseMessage} [stale ${age_min}min]`
      : baseMessage
    const status: ServiceStatus = stale && row.severity === "ok"
      ? "warning"
      : (row.severity as ServiceStatus)
    return {
      name: row.service_name,
      label: def?.label || row.service_name,
      status,
      message,
      latency_ms: row.latency_ms,
      url: def?.url,
      category: row.category,
      check_class: row.check_class,
      metadata: row.metadata || undefined,
    }
  })

  // ── Summary ───────────────────────────────────────────────────────────
  const count = (s: ServiceStatus) => services.filter((c) => c.status === s).length
  const summary = {
    total: services.length,
    ok: count("ok"),
    degraded: count("degraded"),
    warning: count("warning"),
    error: count("error"),
    critical: count("critical"),
    insufficient_signal: count("insufficient_signal"),
    unconfigured: count("unconfigured"),
    errors: count("error") + count("critical"),
  }

  // Use the oldest sample timestamp as "checked_at" — most relevant for staleness warnings
  const newest = rows.reduce((max: Date, r: any) => {
    const d = new Date(r.checked_at)
    return d > max ? d : max
  }, new Date(0))

  res.json({
    summary,
    services,
    checked_at: newest.toISOString(),
    registered_checks: CHECKS.length,
  })
}
