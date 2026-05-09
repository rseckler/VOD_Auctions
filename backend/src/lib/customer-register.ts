// Custom storefront register flow (rc53.17).
//
// Single source of truth for /store/customer/register POST and the refactored
// /store/invite/[token] POST. Encapsulates:
//   * site-mode / invite-gate enforcement
//   * pre-approved Bestandskunden bypass (only real customer source links)
//   * atomic invite_token claim (CODEX P1#3)
//   * Medusa auth-identity register + createCustomerAccountWorkflow
//   * compensation cleanup if any later step fails (CODEX P1#2)
//   * CRM master find-or-create + medusa_customer_id link
//   * audit log + waitlist application status update
//   * welcome mail + newsletter DOI trigger
//   * email-enumeration-uniform 422 in invite mode (CODEX P2#5)
//
// All callers go through `registerCustomer()`. No HTTP loopback.

import type { MedusaRequest } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { createCustomerAccountWorkflow } from "@medusajs/core-flows"
import type { Knex } from "knex"

import { getSiteConfig } from "./site-config"
import { findOrCreateMasterByEmail } from "./crm-newsletter-sync"
import { sendWelcomeEmail } from "./email-helpers"
import { triggerNewsletterDoi } from "./newsletter-doi"

// ─── Types ──────────────────────────────────────────────────────────────────

export type RegisterSource = "self_signup" | "invite_redemption"

export type RegisterCustomerOpts = {
  email: string
  password: string
  first_name: string
  last_name?: string
  agb_accepted: boolean
  newsletter_optin?: boolean
  source: RegisterSource
  // Raw or VOD-XXXXX-XXXXX formatted token; required when source='invite_redemption'
  invite_token?: string
  ip?: string | null
  user_agent?: string | null
}

export type RegisterCustomerResult =
  | {
      success: true
      status: 201
      body: {
        success: true
        customer_id: string
        master_id: string
        token: string
        newsletter_pending_confirmation: boolean
      }
    }
  | {
      success: false
      status: number
      body: Record<string, unknown>
    }

// ─── Pre-approved sources (CODEX P1#1) ──────────────────────────────────────
//
// These are real historical customer relationships (paid Webshop / vodtapes
// member) where the same email holder has a documented commercial connection.
// Newsletter-only leads, mo_pdf address-only imports, and imap_*
// auto-extracted addresses are intentionally excluded — they did not opt in
// to creating an account. They must use /apply or wait for a bulk-invite.

const PRE_APPROVED_SOURCES = [
  "vodtapes_members",
  "vod_records_db1",
  "vod_records_db2013",
  "vod_records_db2013_alt",
]

const UNIFORM_INVITE_REQUIRED_BODY = {
  error: "registration_not_possible",
  message:
    "Registration is currently invite-only. Apply for early access at /apply.",
  apply_url: "/apply",
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value) && value.length <= 254
}

function normalizeRawToken(input: string): string {
  return input.replace(/^VOD-/i, "").replace(/-/g, "").toUpperCase()
}

// CODEX P2#5 — random delay so that "invite_required" and "email_in_use" in
// invite-only mode are not distinguishable by latency. 100-300ms range.
async function constantTimePad(targetMs = 200): Promise<void> {
  const min = Math.max(50, targetMs - 100)
  const max = targetMs + 100
  const delay = Math.floor(Math.random() * (max - min + 1)) + min
  await new Promise((resolve) => setTimeout(resolve, delay))
}

// ─── Core helper ────────────────────────────────────────────────────────────

export async function registerCustomer(
  req: MedusaRequest,
  opts: RegisterCustomerOpts
): Promise<RegisterCustomerResult> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const authService: any = req.scope.resolve(Modules.AUTH)
  const customerService: any = req.scope.resolve(Modules.CUSTOMER)

  const email = (opts.email || "").trim().toLowerCase()
  const firstName = (opts.first_name || "").trim()
  const lastName = (opts.last_name || "").trim()
  const password = opts.password || ""
  const source: RegisterSource = opts.source
  const newsletterOptin = !!opts.newsletter_optin
  const ip = opts.ip ?? null
  const userAgent = opts.user_agent ?? null

  // ── 1. Validation ────────────────────────────────────────────────────────
  if (!isValidEmail(email)) {
    return { success: false, status: 400, body: { error: "validation_failed", field: "email" } }
  }
  if (!password || password.length < 8) {
    return { success: false, status: 400, body: { error: "validation_failed", field: "password" } }
  }
  if (!firstName) {
    return { success: false, status: 400, body: { error: "validation_failed", field: "first_name" } }
  }
  if (opts.agb_accepted !== true) {
    return { success: false, status: 422, body: { error: "agb_not_accepted" } }
  }

  // ── 2. Site-mode + invite gate ───────────────────────────────────────────
  const siteConfig = await getSiteConfig(pg)
  const inviteMode = siteConfig.invite_mode_active === true

  let inviteRow: any = null

  if (source === "invite_redemption") {
    if (!opts.invite_token) {
      return {
        success: false,
        status: 422,
        body: { error: "invite_invalid", reason: "missing" },
      }
    }
    const rawToken = normalizeRawToken(opts.invite_token)

    // CODEX P1#3 — atomic claim. SELECT-then-UPDATE is race-condition-prone
    // when two concurrent submits hit the same token; the conditional UPDATE
    // with RETURNING guarantees exactly one claim wins.
    const claim = await pg.raw(
      `UPDATE invite_tokens
          SET status = 'used',
              used_at = NOW(),
              used_ip = ?
        WHERE (token = ? OR token = ?)
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
        RETURNING *`,
      [ip, rawToken, opts.invite_token]
    )

    if (!claim.rows || claim.rows.length === 0) {
      // attempt audit (best-effort)
      await pg("invite_token_attempts").insert({
        token: opts.invite_token,
        ip: ip ?? "",
        user_agent: userAgent ?? "",
        result: "invalid",
        attempted_at: new Date(),
      }).catch(() => {})
      return {
        success: false,
        status: 422,
        body: { error: "invite_invalid", reason: "token_not_active_or_expired" },
      }
    }
    inviteRow = claim.rows[0]

    // Email match — if mismatched, release the token and reject
    if (inviteRow.email && inviteRow.email.toLowerCase() !== email) {
      await pg("invite_tokens")
        .where("id", inviteRow.id)
        .update({ status: "active", used_at: null, used_ip: null })
        .catch(() => {})
      return {
        success: false,
        status: 422,
        body: { error: "invite_invalid", reason: "email_mismatch" },
      }
    }
    // From here on, this request OWNS the token. Compensation must release it.
  } else if (inviteMode) {
    // CODEX P1#1 — pre-approved bypass restricted to real customer sources.
    const preApproved = await pg("crm_master_contact as mc")
      .where("mc.primary_email_lower", email)
      .whereNull("mc.deleted_at")
      .where(function () {
        this.where("mc.is_blocked", false).orWhereNull("mc.is_blocked")
      })
      .whereExists(function () {
        this.select(pg.raw("1"))
          .from("crm_master_source_link as sl")
          .whereRaw("sl.master_id = mc.id")
          .whereIn("sl.source", PRE_APPROVED_SOURCES)
      })
      .select("mc.id")
      .first()

    if (!preApproved) {
      // CODEX P2#5 — uniform 422; constant-time pad to hide timing.
      await constantTimePad(150)
      return {
        success: false,
        status: 422,
        body: UNIFORM_INVITE_REQUIRED_BODY,
      }
    }
  }

  // ── 3. Existing-customer check ───────────────────────────────────────────
  // CODEX P2#5 — in invite mode, do not distinguish 409 from 422; emit the
  // uniform body so an attacker cannot enumerate which emails already have an
  // account. Outside invite mode, return honest 409 (better UX: user knows to
  // log in instead of register).
  const existingCustomer = await pg("customer")
    .where("email", email)
    .whereNull("deleted_at")
    .first()
  if (existingCustomer) {
    if (inviteMode) {
      await constantTimePad(150)
      // If we already claimed an invite token, release it so the user can
      // try again after recovering their existing account.
      if (inviteRow) {
        await pg("invite_tokens")
          .where("id", inviteRow.id)
          .update({ status: "active", used_at: null, used_ip: null })
          .catch(() => {})
      }
      return { success: false, status: 422, body: UNIFORM_INVITE_REQUIRED_BODY }
    }
    if (inviteRow) {
      await pg("invite_tokens")
        .where("id", inviteRow.id)
        .update({ status: "active", used_at: null, used_ip: null })
        .catch(() => {})
    }
    return { success: false, status: 409, body: { error: "email_in_use" } }
  }

  // ── 4. Atomic create with compensation ───────────────────────────────────
  // Auth-Identity and Customer live in separate Medusa schema domains; a
  // pg.transaction cannot roll them back. We use Medusa's
  // createCustomerAccountWorkflow (built-in step compensation between
  // customer-create and auth-link) and wrap it in a try/catch with our own
  // compensate() helper for the pre-/post-workflow steps.

  let customerId: string | null = null
  let authIdentityId: string | null = null
  let masterId: string | null = null
  let issuedToken: string | null = null

  const compensate = async (reason: string) => {
    console.error(`[customer-register] compensating after ${reason}`)
    const errors: string[] = []
    if (customerId) {
      try {
        await customerService.deleteCustomers([customerId])
      } catch (e: any) {
        errors.push(`customer-delete: ${e?.message ?? e}`)
      }
    }
    if (authIdentityId) {
      try {
        await authService.deleteAuthIdentities([authIdentityId])
      } catch (e: any) {
        errors.push(`auth-delete: ${e?.message ?? e}`)
      }
    }
    if (inviteRow) {
      try {
        await pg("invite_tokens")
          .where("id", inviteRow.id)
          .update({ status: "active", used_at: null, used_ip: null })
      } catch (e: any) {
        errors.push(`token-release: ${e?.message ?? e}`)
      }
    }
    if (errors.length > 0) {
      console.error(
        `[customer-register] CRITICAL: compensation partially failed: ${errors.join("; ")}`
      )
    }
  }

  try {
    // 4a — Auth identity (Medusa-native, password is hashed inside)
    const registerResult = await authService.register("emailpass", {
      url: "",
      headers: {},
      query: {},
      body: { email, password },
      protocol: "https",
    })

    if (!registerResult || !registerResult.success || !registerResult.authIdentity) {
      const errMsg: string = registerResult?.error || "auth_register_failed"
      // Identity already exists is reasonably rare here (we already checked
      // customer table) but possible — race or stale auth identity without
      // customer. Surface as 409 outside invite mode, uniform 422 inside.
      if (errMsg.toLowerCase().includes("already exists") || errMsg.toLowerCase().includes("identity")) {
        if (inviteMode) {
          await constantTimePad(150)
          if (inviteRow) {
            await pg("invite_tokens")
              .where("id", inviteRow.id)
              .update({ status: "active", used_at: null, used_ip: null })
              .catch(() => {})
          }
          return { success: false, status: 422, body: UNIFORM_INVITE_REQUIRED_BODY }
        }
        if (inviteRow) {
          await pg("invite_tokens")
            .where("id", inviteRow.id)
            .update({ status: "active", used_at: null, used_ip: null })
            .catch(() => {})
        }
        return { success: false, status: 409, body: { error: "email_in_use" } }
      }
      throw new Error(errMsg)
    }

    authIdentityId = registerResult.authIdentity.id

    // 4b — Customer + auth-link via official Medusa workflow (built-in
    // compensation: if setAuthAppMetadata fails, customer is rolled back).
    const workflow = createCustomerAccountWorkflow(req.scope)
    const { result: customer } = await workflow.run({
      input: {
        authIdentityId: authIdentityId!,
        customerData: {
          email,
          first_name: firstName,
          last_name: lastName,
        },
      },
    })
    customerId = customer.id

    // 4c — CRM master find-or-create + linkage
    masterId = await pg.transaction(async (trx) => {
      const { masterId: mid } = await findOrCreateMasterByEmail(trx, email)

      const existing = await trx("crm_master_contact")
        .where({ id: mid })
        .first(["id", "lifecycle_stage", "first_name", "last_name", "first_seen_at"])

      const updates: Record<string, unknown> = {
        medusa_customer_id: customerId,
        last_seen_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      }
      if (!existing?.first_name && firstName) updates.first_name = firstName
      if (!existing?.last_name && lastName) updates.last_name = lastName
      if (!existing?.first_seen_at) updates.first_seen_at = trx.fn.now()

      // Promote leads to active when they actually create an account.
      if (
        existing?.lifecycle_stage === "lead" ||
        existing?.lifecycle_stage === null ||
        existing?.lifecycle_stage === undefined
      ) {
        updates.lifecycle_stage = "active"
        updates.lifecycle_changed_at = trx.fn.now()
      }

      await trx("crm_master_contact").where({ id: mid }).update(updates)

      // Source-link entry for the self-signup path (idempotent — match on
      // master+source). For invite redemption the master may already have an
      // existing source-link row from the bulk-invite import; we just ensure
      // an "self_signup" link exists too so the activation is auditable.
      const linkSource =
        source === "invite_redemption" ? "self_signup_via_invite" : "self_signup"
      const existingLink = await trx("crm_master_source_link")
        .where({ master_id: mid, source: linkSource })
        .first("id")
      if (!existingLink) {
        await trx("crm_master_source_link").insert({
          master_id: mid,
          source: linkSource,
          source_record_id: customerId,
          match_method: "self_signup",
          match_confidence: 1.0,
          matched_at: trx.fn.now(),
        })
      }

      // Newsletter opt-in intent (DOI not yet confirmed — pending audit only)
      if (newsletterOptin) {
        await trx("crm_master_audit_log").insert({
          master_id: mid,
          action: "newsletter_optin_pending",
          details: {
            channel: "email_marketing",
            source: "self_signup_register",
            confirmed: false,
          },
          source: "storefront",
          admin_email: "self_service",
        })
      }

      // Audit log: registration
      await trx("crm_master_audit_log").insert({
        master_id: mid,
        action: source === "invite_redemption" ? "invite_redemption" : "self_signup",
        details: {
          source,
          newsletter_optin: newsletterOptin,
          agb_accepted_at: new Date().toISOString(),
          ip,
          user_agent: userAgent,
          invite_token_id: inviteRow?.id ?? null,
          invite_token_display: inviteRow?.token_display ?? null,
        },
        source: "storefront",
        admin_email: "self_service",
      })

      return mid
    })

    // 4d — Mark waitlist application as registered (non-blocking)
    if (inviteRow?.application_id) {
      try {
        await pg("waitlist_applications")
          .where("id", inviteRow.application_id)
          .update({ status: "registered", registered_at: new Date() })
      } catch (e: any) {
        console.warn(
          "[customer-register] waitlist application update failed (non-blocking):",
          e?.message ?? e
        )
      }
    }

    // 4e — Successful invite attempt log
    if (inviteRow) {
      await pg("invite_token_attempts").insert({
        token: opts.invite_token,
        ip: ip ?? "",
        user_agent: userAgent ?? "",
        result: "success",
        attempted_at: new Date(),
      }).catch(() => {})
    }
  } catch (err: any) {
    console.error("[customer-register] atomic create failed:", err?.message ?? err)
    await compensate("atomic-create-failed")
    return {
      success: false,
      status: 500,
      body: { error: "server_error", message: err?.message ?? "Registration failed" },
    }
  }

  // ── 5. Welcome mail (fail-tolerant) ──────────────────────────────────────
  try {
    await sendWelcomeEmail(pg, customerId!)
  } catch (e: any) {
    console.warn("[customer-register] welcome mail failed (non-blocking):", e?.message ?? e)
  }

  // ── 6. Newsletter DOI mail (fail-tolerant) ───────────────────────────────
  if (newsletterOptin) {
    try {
      await triggerNewsletterDoi(pg, email)
    } catch (e: any) {
      console.warn("[customer-register] newsletter DOI failed (non-blocking):", e?.message ?? e)
    }
  }

  // ── 7. Issue session JWT ─────────────────────────────────────────────────
  // Re-authenticate to obtain a fresh authIdentity that has the customer_id
  // app_metadata (set by the workflow). This mirrors the storefront's
  // post-register login dance but avoids HTTP loopback.
  try {
    const authResult = await authService.authenticate("emailpass", {
      url: "",
      headers: {},
      query: {},
      body: { email, password },
      protocol: "https",
    })

    if (!authResult?.success || !authResult.authIdentity) {
      throw new Error(authResult?.error || "post-register-authenticate failed")
    }
    issuedToken = await issueJwt(req, authResult.authIdentity)
  } catch (e: any) {
    console.error("[customer-register] post-register login failed:", e?.message ?? e)
    // Account exists; client can still log in. Surface 201 with no token so
    // caller can redirect to login. The compensate() path is NOT triggered
    // here — the account is valid.
    return {
      success: true,
      status: 201,
      body: {
        success: true,
        customer_id: customerId!,
        master_id: masterId!,
        token: "",
        newsletter_pending_confirmation: newsletterOptin,
      },
    }
  }

  return {
    success: true,
    status: 201,
    body: {
      success: true,
      customer_id: customerId!,
      master_id: masterId!,
      token: issuedToken!,
      newsletter_pending_confirmation: newsletterOptin,
    },
  }
}

// ─── JWT issue (mirrors Medusa's internal generateJwtTokenForAuthIdentity) ──

async function issueJwt(req: MedusaRequest, authIdentity: any): Promise<string> {
  const config: any = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const http = config.projectConfig.http
  const entityId =
    authIdentity?.app_metadata?.customer_id ??
    authIdentity?.provider_identities?.find((p: any) => p.provider === "emailpass")
      ?.user_metadata?.customer_id ??
    ""

  return generateJwtToken(
    {
      actor_id: entityId,
      actor_type: "customer",
      auth_identity_id: authIdentity?.id ?? "",
      app_metadata: { customer_id: entityId, roles: [] },
      user_metadata: {},
    },
    {
      secret: http.jwtSecret,
      expiresIn: http.jwtExpiresIn,
      jwtOptions: http.jwtOptions,
    }
  )
}
