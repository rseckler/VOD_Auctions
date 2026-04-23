/**
 * Admin Actions Registry (Observability Plan v2 §3.6, P4-D).
 *
 * 3 actions in v1:
 *   - refresh_sampler (read_only) — POST internally to /health-sample
 *   - acknowledge_alert (low_impact) — handled via dedicated endpoint
 *     (/alerts/:id/acknowledge), not through this dispatcher
 *   - silence_service (low_impact) — INSERT service_silence with TTL cap
 *
 * Destructive actions explicitly NOT included in v1 (pm2_restart,
 * manual_sync — see Plan §4 P4-E).
 *
 * Each action-invocation writes 2 rows to admin_action_log: stage='pre'
 * before handler runs, stage='post' after (with result + error_message).
 * Both rows share the same request_id for correlation.
 */

import type { Knex } from "knex"
import crypto from "node:crypto"

export type RiskClass = "read_only" | "low_impact" | "destructive"

export type ActionResult = {
  success: boolean
  data?: Record<string, unknown>
  error?: string
  post_state?: Record<string, unknown>
}

export type ActorContext = {
  user_id: string
  email: string | null
  source: "admin_ui" | "cron" | "cli"
}

export type ActionContext = {
  pg: Knex
  env: NodeJS.ProcessEnv
  actor: ActorContext
  payload: Record<string, unknown>
}

export type ActionDefinition = {
  id: string
  label: string
  description: string
  risk_class: RiskClass
  rate_limit?: { max_per_hour: number }
  runnable_for?: (service: string) => boolean
  read_pre_state?: (ctx: ActionContext, target: string | null) => Promise<Record<string, unknown>>
  handler: (ctx: ActionContext, target: string | null) => Promise<ActionResult>
}

// ─── Handlers ──────────────────────────────────────────────────────────────

async function refreshSamplerHandler(ctx: ActionContext, _target: string | null): Promise<ActionResult> {
  const token = ctx.env.HEALTH_SAMPLER_TOKEN
  if (!token) return { success: false, error: "HEALTH_SAMPLER_TOKEN not configured" }
  const classParam = (ctx.payload.class as string) || "fast"
  if (!["fast", "background", "synthetic"].includes(classParam)) {
    return { success: false, error: `invalid class: ${classParam}` }
  }
  try {
    const r = await fetch(`http://127.0.0.1:9000/health-sample?class=${classParam}&source=manual`, {
      method: "POST",
      headers: { "X-Sampler-Token": token },
      signal: AbortSignal.timeout(45_000),
    })
    if (!r.ok) return { success: false, error: `sampler returned ${r.status}` }
    const body = (await r.json()) as any
    return {
      success: true,
      data: { samples_written: body.samples_written, duration_ms: body.duration_ms },
      post_state: { samples_written: body.samples_written, duration_ms: body.duration_ms, class: classParam },
    }
  } catch (e: any) {
    return { success: false, error: e?.message || "sampler call failed" }
  }
}

const MAX_SILENCE_MINUTES = 1440  // 24h

async function silenceServiceHandler(ctx: ActionContext, target: string | null): Promise<ActionResult> {
  if (!target || typeof target !== "string" || target.trim() === "") {
    return { success: false, error: "target service_name required" }
  }
  const durationMinRaw = Number(ctx.payload.duration_minutes)
  if (!Number.isFinite(durationMinRaw) || durationMinRaw < 1) {
    return { success: false, error: "duration_minutes required, min 1" }
  }
  if (durationMinRaw > MAX_SILENCE_MINUTES) {
    return { success: false, error: `duration_minutes max ${MAX_SILENCE_MINUTES} (24h)` }
  }
  const reason = String(ctx.payload.reason || "").trim()
  if (reason.length < 3) return { success: false, error: "reason required (min 3 chars)" }
  if (reason.length > 500) return { success: false, error: "reason too long (max 500)" }

  const until = new Date(Date.now() + durationMinRaw * 60_000)

  // Cancel existing active silence for this service (unique-index protection)
  await ctx.pg("service_silence")
    .where("service_name", target)
    .whereNull("cancelled_at")
    .update({ cancelled_at: ctx.pg.fn.now(), cancelled_by: `superseded_by:${ctx.actor.user_id}` })

  const [row] = await ctx.pg("service_silence")
    .insert({
      service_name: target,
      silenced_until: until,
      reason,
      created_by: ctx.actor.email || ctx.actor.user_id,
    })
    .returning(["id", "service_name", "silenced_until", "reason"])

  return {
    success: true,
    data: row,
    post_state: {
      silence_id: row.id,
      service_name: row.service_name,
      silenced_until: row.silenced_until,
      duration_minutes: durationMinRaw,
    },
  }
}

// ─── Registry ──────────────────────────────────────────────────────────────

export const ACTIONS: Record<string, ActionDefinition> = {
  refresh_sampler: {
    id: "refresh_sampler",
    label: "Force Refresh Sampler",
    description: "Trigger an immediate sampler run (class=fast by default). Non-destructive.",
    risk_class: "read_only",
    rate_limit: { max_per_hour: 20 },
    handler: refreshSamplerHandler,
  },
  silence_service: {
    id: "silence_service",
    label: "Silence Service",
    description: "Suppress alerts for a service for a given duration (max 24h). Alert samples still logged, but no Resend/Sentry/Slack dispatch.",
    risk_class: "low_impact",
    rate_limit: { max_per_hour: 10 },
    handler: silenceServiceHandler,
  },
}

// ─── Rate-Limiting (in-memory, per actor + action) ─────────────────────────

const actionTimestamps = new Map<string, number[]>()  // key: `${actor}|${action}` -> timestamps within last hour

export function checkRateLimit(actor: string, action: string, maxPerHour: number): { ok: boolean; remaining: number; retry_after_sec?: number } {
  const key = `${actor}|${action}`
  const now = Date.now()
  const cutoff = now - 60 * 60_000
  const prev = (actionTimestamps.get(key) ?? []).filter((t) => t > cutoff)
  if (prev.length >= maxPerHour) {
    const oldest = prev[0]
    return { ok: false, remaining: 0, retry_after_sec: Math.ceil((oldest + 60 * 60_000 - now) / 1000) }
  }
  prev.push(now)
  actionTimestamps.set(key, prev)
  return { ok: true, remaining: maxPerHour - prev.length }
}

// ─── Audit-Log write helpers ───────────────────────────────────────────────

export async function writePreAudit(
  pg: Knex,
  requestId: string,
  action: ActionDefinition,
  ctx: ActionContext,
  target: string | null,
): Promise<void> {
  let pre_state: Record<string, unknown> | null = null
  try {
    if (action.read_pre_state) pre_state = await action.read_pre_state(ctx, target)
  } catch { /* tolerant */ }

  await pg("admin_action_log").insert({
    request_id: requestId,
    action: action.id,
    risk_class: action.risk_class,
    target,
    actor_user_id: ctx.actor.user_id,
    actor_email: ctx.actor.email,
    actor_source: ctx.actor.source,
    stage: "pre",
    pre_state: pre_state ? JSON.stringify(pre_state) : null,
    payload: JSON.stringify(ctx.payload),
  })
}

export async function writePostAudit(
  pg: Knex,
  requestId: string,
  action: ActionDefinition,
  ctx: ActionContext,
  target: string | null,
  result: ActionResult,
): Promise<void> {
  await pg("admin_action_log").insert({
    request_id: requestId,
    action: action.id,
    risk_class: action.risk_class,
    target,
    actor_user_id: ctx.actor.user_id,
    actor_email: ctx.actor.email,
    actor_source: ctx.actor.source,
    stage: "post",
    post_state: result.post_state ? JSON.stringify(result.post_state) : null,
    payload: JSON.stringify(ctx.payload),
    result: result.success ? "success" : "failure",
    error_message: result.error || null,
  })
}

export function newRequestId(): string {
  return crypto.randomUUID()
}

// ─── Active-silence check (called from health-alerting.ts) ─────────────────

export async function isServiceSilenced(pg: Knex, serviceName: string): Promise<{ silenced: boolean; silenced_until?: string; reason?: string }> {
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
}
