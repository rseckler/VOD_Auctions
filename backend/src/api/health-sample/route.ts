/**
 * POST /health-sample?class=fast|background|synthetic
 *
 * Writer-Endpoint (System Health Evolution Plan §3.3 Sampler-Architektur).
 * Runs checks of the requested class, writes results into health_check_log.
 *
 * Auth: X-Sampler-Token header must match HEALTH_SAMPLER_TOKEN env.
 * Cron on VPS calls this endpoint — no admin session available, so we use
 * a shared-secret token instead of Medusa's admin auth.
 *
 * Response: { samples_written, duration_ms, services: [{name, status, latency_ms}] }
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  CHECKS,
  CheckClass,
  getChecksByClass,
  runCheck,
} from "../../lib/health-checks"
import { maybeDispatchAlert, maybeAutoResolveAlerts } from "../../lib/health-alerting"
import { getFeatureFlag } from "../../lib/feature-flags"

const VALID_CLASSES: CheckClass[] = ["fast", "background", "synthetic"]

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  // ── Auth via shared-secret token ──────────────────────────────────────
  const expectedToken = process.env.HEALTH_SAMPLER_TOKEN
  if (!expectedToken) {
    res.status(500).json({ error: "HEALTH_SAMPLER_TOKEN not configured on server" })
    return
  }
  const providedToken = req.headers["x-sampler-token"]
  if (providedToken !== expectedToken) {
    res.status(401).json({ error: "invalid sampler token" })
    return
  }

  // ── Parse class filter ────────────────────────────────────────────────
  const classParam = (req.query?.class as string | undefined)?.toLowerCase()
  let definitions = CHECKS
  if (classParam) {
    if (!VALID_CLASSES.includes(classParam as CheckClass)) {
      res.status(400).json({ error: `invalid class '${classParam}', must be one of ${VALID_CLASSES.join(", ")}` })
      return
    }
    definitions = getChecksByClass(classParam as CheckClass)
  }

  const sourceParam = (req.query?.source as string | undefined) || "sampler"
  if (!["sampler", "manual", "synthetic_cron"].includes(sourceParam)) {
    res.status(400).json({ error: `invalid source '${sourceParam}'` })
    return
  }

  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const startedAt = Date.now()

  // ── Run checks in parallel with allSettled (one failure ≠ all fail) ──
  const ctx = { pg, env: process.env }
  const results = await Promise.allSettled(
    definitions.map(async (def) => {
      const result = await runCheck(def, ctx)
      return { def, result }
    })
  )

  // ── Insert into health_check_log ──────────────────────────────────────
  const rows = results.map((r, idx) => {
    const def = definitions[idx]
    if (r.status === "fulfilled") {
      const { result } = r.value
      return {
        service_name: def.name,
        category: def.category,
        check_class: def.check_class,
        severity: result.status,
        latency_ms: result.latency_ms,
        message: result.message,
        metadata: result.metadata ? JSON.stringify(result.metadata) : null,
        source: sourceParam,
        environment: process.env.NODE_ENV === "production" ? "prod" : "dev",
      }
    }
    // allSettled rejection — shouldn't happen because runCheck catches, but be defensive
    return {
      service_name: def.name,
      category: def.category,
      check_class: def.check_class,
      severity: "error" as const,
      latency_ms: null,
      message: `runner crashed: ${r.reason?.message || r.reason}`,
      metadata: null,
      source: sourceParam,
      environment: process.env.NODE_ENV === "production" ? "prod" : "dev",
    }
  })

  if (rows.length > 0) {
    await pg("health_check_log").insert(rows)
  }

  // ── P3: dispatch alerts for error/critical samples ─────────────────
  // Read flag once per sampler-run (cheap — site_config has internal cache)
  let alertingOn = false
  try {
    alertingOn = await getFeatureFlag(pg, "SYSTEM_HEALTH_ALERTING")
  } catch { /* no-op — treat as off */ }

  const alertResults: Array<{ service: string; severity: string; dispatched: boolean; reason?: string }> = []
  if (alertingOn) {
    for (const row of rows) {
      if (!["error", "critical"].includes(row.severity)) continue  // warnings → daily digest only
      const result = await maybeDispatchAlert(
        pg,
        {
          service_name: row.service_name,
          category: row.category,
          severity: row.severity,
          message: row.message || "",
          metadata: row.metadata ? JSON.parse(row.metadata) : null,
        },
        true
      )
      alertResults.push({ service: row.service_name, severity: row.severity, dispatched: result.dispatched, reason: result.reason })
    }
  }

  // P4-A A3: Auto-resolve fired alerts for services that are now ok (3 consecutive)
  let autoResolve: { resolved_count: number; services_resolved: string[] } = { resolved_count: 0, services_resolved: [] }
  try {
    const okServices = rows.filter((r) => r.severity === "ok").map((r) => r.service_name)
    if (okServices.length > 0) {
      autoResolve = await maybeAutoResolveAlerts(pg, okServices)
    }
  } catch (e: any) {
    console.error(JSON.stringify({ event: "auto_resolve_failed", error: e?.message }))
  }

  const duration = Date.now() - startedAt
  res.json({
    samples_written: rows.length,
    duration_ms: duration,
    class: classParam || "all",
    source: sourceParam,
    services: rows.map((r) => ({ name: r.service_name, severity: r.severity, latency_ms: r.latency_ms })),
    alerting: alertingOn
      ? { enabled: true, dispatched: alertResults.filter((a) => a.dispatched).length, suppressed: alertResults.filter((a) => !a.dispatched).length }
      : { enabled: false },
    auto_resolve: autoResolve,
  })
}
