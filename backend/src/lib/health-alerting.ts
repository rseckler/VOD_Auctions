/**
 * Health Alerting Engine (System Health Evolution Plan §3.6, P3)
 *
 * Triggered by POST /health-sample after rows land in health_check_log.
 * Runs Flapping-Guard + Cooldown + Routing:
 *   warning  → Resend Digest (täglich 08:00 UTC, kein immediate)
 *   error    → Resend Immediate + Sentry + 30min Cooldown
 *   critical → Resend Immediate + Sentry + Slack + 15min Cooldown
 *
 * In-Memory-State (Single-Process PM2 Fork). Acceptable für v1 — PM2-
 * Restart resetet Cooldowns, das ist bewusst kein Fail-Closed-Design,
 * nach Deploy soll Alerting-Engine frisch starten.
 */

import type { Knex } from "knex"
import type { ServiceStatus } from "./health-checks"

// P4-D D5: silence check, inlined to avoid circular import with admin-actions.ts
async function isServiceSilencedInAlerting(pg: Knex, serviceName: string): Promise<{ silenced: boolean; silenced_until?: string; reason?: string }> {
  try {
    const row = await pg("service_silence")
      .where("service_name", serviceName)
      .whereNull("cancelled_at")
      .where("silenced_until", ">", pg.fn.now())
      .orderBy("silenced_until", "desc")
      .first()
    if (!row) return { silenced: false }
    return {
      silenced: true,
      silenced_until: new Date(row.silenced_until).toISOString(),
      reason: row.reason,
    }
  } catch {
    return { silenced: false }  // table may not exist yet (pre-P4-D migration)
  }
}

const COOLDOWN_MS: Record<string, number> = {
  critical: 15 * 60 * 1000,
  error:    30 * 60 * 1000,
  warning:  24 * 60 * 60 * 1000,  // one per day (Digest statt Immediate sowieso)
}

const FLAPPING_THRESHOLD = 3

// In-Memory cooldown store — resets on PM2 restart (bewusst)
// Key: service_name|severity → last-alert-timestamp
const cooldownStore = new Map<string, number>()

type SentCheck = {
  service_name: string
  category: string
  severity: ServiceStatus
  message: string
  metadata?: Record<string, unknown> | null
}

/**
 * Check if the last N samples for this service have the same severity.
 * Returns true if flapping-guard passes (alert should fire).
 */
async function hasStableSeverity(pg: Knex, service: string, severity: ServiceStatus, count: number = FLAPPING_THRESHOLD): Promise<boolean> {
  const { rows } = await pg.raw(
    `SELECT severity FROM health_check_log
      WHERE service_name = ?
      ORDER BY checked_at DESC LIMIT ?`,
    [service, count]
  )
  if (!rows || rows.length < count) return false
  return rows.every((r: any) => r.severity === severity)
}

function isCooledDown(service: string, severity: ServiceStatus): boolean {
  const key = `${service}|${severity}`
  const last = cooldownStore.get(key)
  if (!last) return false
  const ttl = COOLDOWN_MS[severity] ?? 0
  return Date.now() - last < ttl
}

function markCooldown(service: string, severity: ServiceStatus): void {
  cooldownStore.set(`${service}|${severity}`, Date.now())
}

/**
 * Stateless helper: fetches last N cooldown-entries as array (for Alert-History Panel).
 */
export function getRecentCooldowns(): Array<{ service: string; severity: string; last_alert: string }> {
  const entries: Array<{ service: string; severity: string; last_alert: string }> = []
  cooldownStore.forEach((timestamp, key) => {
    const [service, severity] = key.split("|")
    entries.push({ service, severity, last_alert: new Date(timestamp).toISOString() })
  })
  return entries.sort((a, b) => b.last_alert.localeCompare(a.last_alert))
}

// ─── Channel: Resend Email (transaktional, schon im Stack) ──────────────────
async function sendResendImmediate(check: SentCheck): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.ALERT_EMAIL_TO || process.env.SUPPORT_EMAIL || "rseckler@gmail.com"
  const from = process.env.EMAIL_FROM || "alerts@vod-auctions.com"
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set" }

  const subject = `[${check.severity.toUpperCase()}] VOD Auctions — ${check.service_name}`
  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 600px;">
      <h2 style="color: ${check.severity === "critical" ? "#dc2626" : "#d97706"}; margin-bottom: 8px;">
        ${check.severity.toUpperCase()}: ${check.service_name}
      </h2>
      <p style="font-size: 15px; color: #111;">${escapeHtml(check.message)}</p>
      <table style="margin-top: 16px; font-size: 13px; color: #555; border-collapse: collapse;">
        <tr><td style="padding: 4px 12px 4px 0; color: #888;">Category</td><td>${check.category}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #888;">Service</td><td><code>${check.service_name}</code></td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #888;">Detected at</td><td>${new Date().toLocaleString("de-DE")}</td></tr>
      </table>
      <p style="margin-top: 20px; font-size: 13px;">
        <a href="https://admin.vod-auctions.com/app/system-health" style="color: #b8860b;">Open System Health Dashboard →</a>
      </p>
      <hr style="margin-top: 24px; border: none; border-top: 1px solid #eee;">
      <p style="font-size: 11px; color: #999;">
        Flapping-guarded (3 consecutive samples) · Cooldown ${(COOLDOWN_MS[check.severity] ?? 0) / 60_000}min.
        Disable: flag SYSTEM_HEALTH_ALERTING OFF in /app/config.
      </p>
    </div>
  `
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, html }),
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || "resend failed" }
  }
}

// ─── Channel: Sentry (captureMessage with fingerprint) ──────────────────────
async function sendSentry(check: SentCheck): Promise<{ ok: boolean; error?: string }> {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return { ok: false, error: "SENTRY_DSN not set" }
  try {
    // Lazy-require: only pull @sentry/node when actually alerting (some deploys may not include it)
    const Sentry: any = await import("@sentry/node").catch(() => null)
    if (!Sentry) return { ok: false, error: "@sentry/node not available" }
    if (!Sentry.isInitialized?.()) {
      Sentry.init({ dsn, environment: process.env.NODE_ENV || "production" })
    }
    Sentry.withScope((scope: any) => {
      scope.setFingerprint([`health-check:${check.service_name}:${check.severity}`])
      scope.setLevel(check.severity === "critical" ? "fatal" : "error")
      scope.setContext("health_check", {
        service: check.service_name,
        category: check.category,
        severity: check.severity,
        metadata: check.metadata || null,
      })
      Sentry.captureMessage(`${check.severity.toUpperCase()}: ${check.service_name} — ${check.message}`)
    })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || "sentry failed" }
  }
}

// ─── Channel: Slack Webhook (optional) ──────────────────────────────────────
async function sendSlack(check: SentCheck): Promise<{ ok: boolean; error?: string }> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return { ok: false, error: "SLACK_WEBHOOK_URL not configured (skipped)" }
  const color = check.severity === "critical" ? "#dc2626" : "#d97706"
  const payload = {
    attachments: [
      {
        color,
        title: `${check.severity.toUpperCase()}: ${check.service_name}`,
        text: check.message,
        fields: [
          { title: "Category", value: check.category, short: true },
          { title: "Severity", value: check.severity, short: true },
        ],
        footer: "VOD Auctions System Health",
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  }
  try {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || "slack failed" }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

// ─── Main entry ─────────────────────────────────────────────────────────────

/**
 * Inspect a single sample and dispatch alerts if warranted.
 * Called from POST /health-sample after DB write.
 *
 * Skipped silently when:
 *   - SYSTEM_HEALTH_ALERTING flag is OFF
 *   - severity is not in {warning, error, critical}
 *   - flapping-guard fails (< 3 consecutive same-severity samples)
 *   - cooldown still active for this service|severity
 *
 * warning never sends immediate — those accumulate in the daily digest.
 */
export async function maybeDispatchAlert(
  pg: Knex,
  check: SentCheck,
  flagOn: boolean
): Promise<{ dispatched: boolean; reason?: string; channels?: Record<string, { ok: boolean; error?: string }> }> {
  if (!flagOn) return { dispatched: false, reason: "alerting_flag_off" }
  if (!["warning", "error", "critical"].includes(check.severity)) {
    return { dispatched: false, reason: `severity_not_alertable:${check.severity}` }
  }

  // warnings go to digest only, not immediate
  if (check.severity === "warning") {
    return { dispatched: false, reason: "warning_digest_only" }
  }

  // P4-D D5: silence-check (persistent)
  try {
    const silence = await isServiceSilencedInAlerting(pg, check.service_name)
    if (silence.silenced) {
      // Still persist dispatch-log entry with suppressed_by_silence status
      try {
        await pg("health_alert_dispatch_log").insert({
          service_name: check.service_name,
          severity: check.severity,
          message: check.message,
          metadata: check.metadata ? JSON.stringify(check.metadata) : null,
          channels_attempted: JSON.stringify({ suppressed_by_silence: { until: silence.silenced_until, reason: silence.reason } }),
          status: "suppressed_by_silence",
        })
      } catch { /* non-blocking */ }
      return { dispatched: false, reason: "suppressed_by_silence" }
    }
  } catch { /* silence-check failure shouldn't block the alert — continue */ }

  // Flapping-guard
  const stable = await hasStableSeverity(pg, check.service_name, check.severity)
  if (!stable) return { dispatched: false, reason: "flapping_guard_not_yet_stable" }

  // Cooldown
  if (isCooledDown(check.service_name, check.severity)) {
    return { dispatched: false, reason: "cooldown_active" }
  }

  // Dispatch
  const channels: Record<string, { ok: boolean; error?: string }> = {}
  const tasks: Promise<void>[] = []

  tasks.push(sendResendImmediate(check).then((r) => { channels.resend = r }))
  tasks.push(sendSentry(check).then((r) => { channels.sentry = r }))
  if (check.severity === "critical") {
    tasks.push(sendSlack(check).then((r) => { channels.slack = r }))
  }
  await Promise.allSettled(tasks)

  markCooldown(check.service_name, check.severity)

  // P4-A A2: persist dispatch-log for Alert-History
  try {
    await pg("health_alert_dispatch_log").insert({
      service_name: check.service_name,
      severity: check.severity,
      message: check.message,
      metadata: check.metadata ? JSON.stringify(check.metadata) : null,
      channels_attempted: JSON.stringify(channels),
      status: "fired",
    })
  } catch (e: any) {
    // Non-blocking — log-row write failure shouldn't silence the alert
    console.error(JSON.stringify({ event: "alert_dispatch_log_write_failed", error: e?.message, service: check.service_name }))
  }

  return { dispatched: true, channels }
}

// ─── P4-A A3: Auto-Resolve fired alerts when service returns to non-firing ─
//
// Called from POST /health-sample after each sample batch. For each service
// that has ≥ 3 consecutive recent NON-FIRING samples, mark all `fired` rows
// for that service as `auto_resolved`. Conservative — not triggered by single
// sample to avoid flapping-resolve.
//
// Non-firing severity: anything that does NOT pass the alert-dispatch gate.
// Currently `ok` and `insufficient_signal`. The latter is critical for probes
// like `last_order` — `insufficient_signal` in beta_test means the probe runs
// fine but has no traffic to evaluate. A fired error alert that's now
// returning `insufficient_signal` is no longer reproducing and should resolve.
// Without this `last_order` (which fires once during a real DB-Lock-Storm
// then drops to insufficient_signal as platform_mode stays beta_test) would
// stay `fired` forever. Bug surfaced 2026-04-26 (rc51.9.4) — alert from
// 2026-04-24 was still FIRED in alert-history despite the rc51.2 timeout-fix
// having landed minutes later.
//
// Note: `degraded` is intentionally NOT in this set. Some probes (e.g.,
// `supabase_realtime`) sit at `degraded` indefinitely and shouldn't quietly
// resolve fired-error alerts — the fix is to flip the underlying state to
// ok or for an operator to explicitly acknowledge.

const AUTO_RESOLVE_THRESHOLD = 3
const NON_FIRING_SEVERITIES = new Set(["ok", "insufficient_signal"])

export async function maybeAutoResolveAlerts(pg: Knex, serviceNames: string[]): Promise<{ resolved_count: number; services_resolved: string[] }> {
  if (serviceNames.length === 0) return { resolved_count: 0, services_resolved: [] }

  const resolvedServices: string[] = []
  for (const service of serviceNames) {
    const { rows } = await pg.raw(
      `SELECT severity FROM health_check_log
        WHERE service_name = ?
        ORDER BY checked_at DESC LIMIT ?`,
      [service, AUTO_RESOLVE_THRESHOLD]
    )
    if (!rows || rows.length < AUTO_RESOLVE_THRESHOLD) continue
    const allNonFiring = rows.every((r: any) => NON_FIRING_SEVERITIES.has(r.severity))
    if (!allNonFiring) continue
    resolvedServices.push(service)
  }

  if (resolvedServices.length === 0) return { resolved_count: 0, services_resolved: [] }

  const result = await pg("health_alert_dispatch_log")
    .whereIn("service_name", resolvedServices)
    .where("status", "fired")
    .update({ status: "auto_resolved", resolved_at: pg.fn.now() })
  return { resolved_count: Number(result) || 0, services_resolved: resolvedServices }
}

// ─── Daily Digest — called via POST /health-sample/digest from cron ─────────

export async function sendDigest(pg: Knex): Promise<{ sent: boolean; warning_count: number; services: string[]; error?: string }> {
  // All warning-samples in the last 24h, grouped by service (take latest per service)
  const { rows } = await pg.raw(
    `SELECT DISTINCT ON (service_name) service_name, category, severity, message, checked_at
       FROM health_check_log
      WHERE severity = 'warning'
        AND checked_at > NOW() - INTERVAL '24 hours'
      ORDER BY service_name, checked_at DESC`
  )
  if (!rows || rows.length === 0) {
    return { sent: false, warning_count: 0, services: [] }
  }

  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.ALERT_EMAIL_TO || process.env.SUPPORT_EMAIL || "rseckler@gmail.com"
  const from = process.env.EMAIL_FROM || "alerts@vod-auctions.com"
  if (!apiKey) return { sent: false, warning_count: rows.length, services: rows.map((r: any) => r.service_name), error: "RESEND_API_KEY missing" }

  const rowsHtml = rows.map((r: any) => `
    <tr style="border-top: 1px solid #eee;">
      <td style="padding: 10px 12px;"><code>${escapeHtml(r.service_name)}</code></td>
      <td style="padding: 10px 12px; color: #888;">${escapeHtml(r.category)}</td>
      <td style="padding: 10px 12px;">${escapeHtml(r.message || "")}</td>
    </tr>
  `).join("")

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 700px;">
      <h2 style="color: #d97706;">Daily Warning Digest</h2>
      <p style="color: #555;">${rows.length} service(s) in warning state during the last 24h.</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 16px;">
        <thead>
          <tr style="background: #f5f5f4;">
            <th style="text-align: left; padding: 8px 12px;">Service</th>
            <th style="text-align: left; padding: 8px 12px;">Category</th>
            <th style="text-align: left; padding: 8px 12px;">Message</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="margin-top: 20px; font-size: 13px;">
        <a href="https://admin.vod-auctions.com/app/system-health" style="color: #b8860b;">Open System Health Dashboard →</a>
      </p>
    </div>
  `
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject: `VOD Auctions — Daily Warning Digest (${rows.length})`, html }),
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return { sent: false, warning_count: rows.length, services: rows.map((x: any) => x.service_name), error: `HTTP ${r.status}` }
    return { sent: true, warning_count: rows.length, services: rows.map((x: any) => x.service_name) }
  } catch (e: any) {
    return { sent: false, warning_count: rows.length, services: rows.map((x: any) => x.service_name), error: e?.message || "send failed" }
  }
}
