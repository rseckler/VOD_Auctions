import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { generateRefCode } from "../../../lib/invite"
import { sendWaitlistConfirmEmail } from "../../../lib/email-helpers"

/**
 * POST /store/waitlist
 * Public endpoint — submit a waitlist application.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const body = req.body as Record<string, unknown>

  const email = (body.email as string || "").trim().toLowerCase()
  if (!email || !email.includes("@")) {
    res.status(400).json({ message: "A valid email address is required" })
    return
  }

  // Check for existing application
  const existing = await pg("waitlist_applications").where("email", email).first()
  if (existing) {
    // Don't reveal whether the email exists — just return success
    res.json({ success: true, message: "Application received" })
    return
  }

  const name = (body.name as string || "").trim() || null
  const country = (body.country as string || "").trim() || null
  const genres = Array.isArray(body.genres) ? body.genres.filter((g: unknown) => typeof g === "string") : null
  const buyChannels = Array.isArray(body.buy_channels) ? body.buy_channels.filter((c: unknown) => typeof c === "string") : null
  const buyVolume = typeof body.buy_volume === "string" ? body.buy_volume : null
  const referrerInfo = typeof body.referrer_info === "string" ? body.referrer_info.trim() || null : null
  const referredBy = typeof body.referred_by === "string" ? body.referred_by.trim() || null : null
  const source = typeof body.source === "string" ? body.source : "organic"

  const applicationId = generateEntityId()
  await pg("waitlist_applications").insert({
    id: applicationId,
    email,
    name,
    country,
    genres,
    buy_channels: buyChannels,
    buy_volume: buyVolume,
    referrer_info: referrerInfo,
    ref_code: generateRefCode(),
    referred_by: referredBy,
    source,
    status: "pending",
    created_at: new Date(),
  })

  // Send confirmation email (async, non-blocking)
  sendWaitlistConfirmEmail(pg, applicationId).catch((err) => {
    console.error("[waitlist] Failed to send confirmation email:", err)
  })

  res.status(201).json({ success: true, message: "Application received" })
}

/**
 * GET /store/waitlist
 * Returns public waitlist count (for the counter on /apply).
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const [{ count }] = await pg("waitlist_applications").count("* as count")

  res.json({ count: Number(count) })
}
