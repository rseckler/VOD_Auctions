import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"

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
 * Redeem an invite token. Creates a Medusa customer account.
 * Body: { first_name, last_name, email, password }
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { token } = req.params
  const ip = req.headers["x-forwarded-for"] as string || req.socket?.remoteAddress || ""
  const userAgent = req.headers["user-agent"] || ""
  const body = req.body as Record<string, string>

  const { first_name, last_name, email, password } = body

  if (!first_name || !email || !password) {
    res.status(400).json({ success: false, message: "first_name, email, and password are required" })
    return
  }

  // Normalize token
  const rawToken = token.replace(/^VOD-/i, "").replace(/-/g, "").toUpperCase()

  const invite = await pg("invite_tokens")
    .where(function () {
      this.where("token", rawToken).orWhere("token", token)
    })
    .first()

  if (!invite || invite.status !== "active") {
    await pg("invite_token_attempts").insert({
      token, ip, user_agent: userAgent, result: "invalid", attempted_at: new Date(),
    })
    res.status(400).json({ success: false, message: "This invite link is no longer valid" })
    return
  }

  // Check expiry
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await pg("invite_tokens").where("id", invite.id).update({ status: "expired" })
    await pg("invite_token_attempts").insert({
      token, ip, user_agent: userAgent, result: "expired", attempted_at: new Date(),
    })
    res.status(400).json({ success: false, message: "This invite link is no longer valid" })
    return
  }

  try {
    // Step 1: Register auth identity via Medusa's built-in auth
    const backendUrl = process.env.MEDUSA_BACKEND_URL
    if (!backendUrl) {
      console.error("[invite/redeem] MEDUSA_BACKEND_URL is not set!")
      res.status(500).json({ success: false, message: "Server configuration error" })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    let authToken: string | null = null
    let accountExists = false

    const authRes = await fetch(`${backendUrl}/auth/customer/emailpass/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password }),
    })

    if (authRes.ok) {
      const authData = await authRes.json().catch(() => ({}))
      authToken = authData.token || null
    } else {
      const authErr = await authRes.json().catch(() => ({}))
      const errMsg = authErr.message || ""
      // Account already exists — that's OK, just login instead
      if (errMsg.includes("already exists") || errMsg.includes("Identity")) {
        accountExists = true
      } else {
        res.status(400).json({ success: false, message: errMsg || "Registration failed" })
        return
      }
    }

    // Step 2: Create customer record (only for new accounts)
    if (authToken && !accountExists) {
      await fetch(`${backendUrl}/store/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          first_name: first_name.trim(),
          last_name: (last_name || "").trim(),
          email: normalizedEmail,
        }),
      })
    }

    // Step 3: Mark token as used
    await pg("invite_tokens").where("id", invite.id).update({
      status: "used",
      used_at: new Date(),
      used_ip: ip,
    })

    // Step 4: Update waitlist application status
    if (invite.application_id) {
      await pg("waitlist_applications")
        .where("id", invite.application_id)
        .update({ status: "registered", registered_at: new Date() })
    }

    // Log success
    await pg("invite_token_attempts").insert({
      token, ip, user_agent: userAgent, result: "success", attempted_at: new Date(),
    })

    // Step 5: Login to get a session token for the client
    const loginRes = await fetch(`${backendUrl}/auth/customer/emailpass`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    })
    const loginData = await loginRes.json().catch(() => ({}))

    res.json({
      success: true,
      message: "Account created. Welcome to VOD Auctions!",
      token: loginData.token || null,
    })
  } catch (err: any) {
    console.error("[invite/redeem] Error:", err.message)
    res.status(500).json({ success: false, message: "Registration failed. Please try again." })
  }
}
