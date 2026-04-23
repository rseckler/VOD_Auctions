/**
 * POST /admin/system-health/actions/:action
 *
 * Body: { target?: string, payload?: Record<string, unknown> }
 *
 * Dispatches to the registered action handler (§3.6). Writes pre+post
 * audit rows with shared request_id. Returns 429 if rate-limited.
 *
 * Flag-gated by SYSTEM_HEALTH_ACTIONS.
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { getFeatureFlag } from "../../../../../lib/feature-flags"
import {
  ACTIONS,
  checkRateLimit,
  writePreAudit,
  writePostAudit,
  newRequestId,
  type ActorContext,
  type ActionContext,
} from "../../../../../lib/admin-actions"

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const flagOn = await getFeatureFlag(pg, "SYSTEM_HEALTH_ACTIONS")
  if (!flagOn) {
    res.status(404).json({ error: "not found" })
    return
  }

  const actionId = (req.params?.action as string | undefined)?.trim()
  if (!actionId || !ACTIONS[actionId]) {
    res.status(404).json({ error: "unknown action", available: Object.keys(ACTIONS) })
    return
  }
  const action = ACTIONS[actionId]

  const body = (req.body as { target?: string; payload?: Record<string, unknown> } | undefined) || {}
  const target = body.target?.toString() || null
  const payload = body.payload || {}

  // Actor
  const auth = (req as any).auth_context || (req as any).auth || {}
  const actor: ActorContext = {
    user_id: String(auth?.actor_id || auth?.user_id || "anonymous_admin"),
    email: auth?.actor_email || auth?.email || null,
    source: "admin_ui",
  }

  // Rate-Limit
  if (action.rate_limit) {
    const rl = checkRateLimit(actor.user_id, action.id, action.rate_limit.max_per_hour)
    if (!rl.ok) {
      res.setHeader("Retry-After", String(rl.retry_after_sec ?? 60))
      res.status(429).json({
        error: `rate limit exceeded: max ${action.rate_limit.max_per_hour}/hour for ${action.id}`,
        retry_after_sec: rl.retry_after_sec,
      })
      return
    }
  }

  // Build context
  const ctx: ActionContext = { pg, env: process.env, actor, payload }
  const requestId = newRequestId()

  // Pre-audit
  try {
    await writePreAudit(pg, requestId, action, ctx, target)
  } catch (e: any) {
    console.error(JSON.stringify({ event: "admin_action_pre_audit_failed", request_id: requestId, error: e?.message }))
  }

  // Execute
  let result
  try {
    result = await action.handler(ctx, target)
  } catch (e: any) {
    result = { success: false, error: e?.message || "handler threw" }
  }

  // Post-audit
  try {
    await writePostAudit(pg, requestId, action, ctx, target, result)
  } catch (e: any) {
    console.error(JSON.stringify({ event: "admin_action_post_audit_failed", request_id: requestId, error: e?.message }))
  }

  if (result.success) {
    res.json({
      ok: true,
      request_id: requestId,
      action: action.id,
      target,
      data: result.data,
    })
  } else {
    res.status(400).json({
      ok: false,
      request_id: requestId,
      action: action.id,
      target,
      error: result.error,
    })
  }
}
