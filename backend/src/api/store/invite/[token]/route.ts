import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { registerCustomer } from "../../../../lib/customer-register"

/**
 * GET /store/invite/:token
 * Validate an invite token. Returns status without revealing specifics.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { token } = req.params
  const ip = req.headers["x-forwarded-for"] as string || req.socket?.remoteAddress || ""
  const userAgent = req.headers["user-agent"] || ""

  if (!token) {
    res.status(400).json({ valid: false, reason: "invalid" })
    return
  }

  // Normalize: accept both raw token and formatted VOD-XXXXX-XXXXX
  const rawToken = token.replace(/^VOD-/i, "").replace(/-/g, "").toUpperCase()

  const invite = await pg("invite_tokens")
    .where(function () {
      this.where("token", rawToken).orWhere("token", token)
    })
    .first()

  let result: string

  if (!invite) {
    result = "invalid"
  } else if (invite.status === "used") {
    result = "already_used"
  } else if (invite.status === "revoked") {
    result = "invalid"
  } else if (invite.status === "expired" || (invite.expires_at && new Date(invite.expires_at) < new Date())) {
    result = "expired"
  } else {
    result = "valid"
  }

  // Log attempt
  await pg("invite_token_attempts").insert({
    token: token,
    ip,
    user_agent: userAgent,
    result,
    attempted_at: new Date(),
  })

  if (result === "valid") {
    res.json({
      valid: true,
      email: invite.email,
      token_display: invite.token_display,
    })
  } else {
    // Generic error — don't distinguish between invalid/used/expired for security
    res.json({ valid: false, reason: "invalid" })
  }
}

/**
 * POST /store/invite/:token
 * Redeem an invite token. Delegates the actual account creation to the shared
 * registerCustomer() helper (rc53.17) so the invite path uses the same
 * atomic-claim, compensation, CRM-link, and welcome-mail logic as
 * /store/customer/register.
 *
 * Body: { first_name, last_name, password, [newsletter_optin] }
 * The email is taken from the invite_tokens row, not the request body — this
 * prevents the redeemer from registering a different email under someone
 * else's invite.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { token } = req.params
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    ""
  const userAgent = (req.headers["user-agent"] as string | undefined) ?? ""
  const body = (req.body || {}) as Record<string, unknown>

  const first_name = typeof body.first_name === "string" ? body.first_name : ""
  const last_name = typeof body.last_name === "string" ? body.last_name : ""
  const password = typeof body.password === "string" ? body.password : ""
  const newsletter_optin = body.newsletter_optin === true

  if (!first_name || !password) {
    res
      .status(400)
      .json({ success: false, message: "first_name and password are required" })
    return
  }

  // Resolve invite email from the token row (NOT the request body). The
  // helper will atomic-claim the same row again — this is intentional: we
  // do an upfront read here only to get the email + give a clearer 400 for
  // dead tokens. The helper handles the race-condition safely.
  const rawToken = token.replace(/^VOD-/i, "").replace(/-/g, "").toUpperCase()
  const invite = await pg("invite_tokens")
    .where(function () {
      this.where("token", rawToken).orWhere("token", token)
    })
    .first()

  if (!invite || !invite.email) {
    await pg("invite_token_attempts")
      .insert({
        token,
        ip,
        user_agent: userAgent,
        result: "invalid",
        attempted_at: new Date(),
      })
      .catch(() => {})
    res
      .status(400)
      .json({ success: false, message: "This invite link is no longer valid" })
    return
  }

  const result = await registerCustomer(req, {
    email: invite.email,
    password,
    first_name,
    last_name,
    agb_accepted: true, // implicit: clicking the invite link + filling the form
    newsletter_optin,
    source: "invite_redemption",
    invite_token: token,
    ip,
    user_agent: userAgent,
  })

  if (!result.success) {
    // Surface a friendlier message for the well-known invite-invalid paths;
    // pass through everything else verbatim.
    const code = (result.body as any)?.error
    if (code === "invite_invalid") {
      res
        .status(result.status)
        .json({ success: false, message: "This invite link is no longer valid" })
      return
    }
    if (code === "email_in_use") {
      res
        .status(result.status)
        .json({
          success: false,
          message: "An account already exists for this email. Please log in instead.",
        })
      return
    }
    res
      .status(result.status)
      .json({ success: false, message: (result.body as any)?.message || "Registration failed" })
    return
  }

  res.status(200).json({
    success: true,
    message: "Account created. Welcome to VOD Auctions!",
    token: result.body.token || null,
  })
}
