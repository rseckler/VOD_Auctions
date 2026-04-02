import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { generateRawToken, formatToken } from "../../../lib/invite"

/**
 * GET /admin/invite-tokens
 * Paginated list of invite tokens. Query: ?status, ?q, ?limit, ?offset
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Number(req.query.offset) || 0
  const status = req.query.status as string | undefined
  const q = req.query.q as string | undefined

  let query = pg("invite_tokens")
  let countQuery = pg("invite_tokens")

  if (status) {
    query = query.where("status", status)
    countQuery = countQuery.where("status", status)
  }
  if (q) {
    const like = `%${q}%`
    query = query.where(function () {
      this.whereILike("email", like).orWhereILike("token_display", like)
    })
    countQuery = countQuery.where(function () {
      this.whereILike("email", like).orWhereILike("token_display", like)
    })
  }

  const [tokens, [{ count }]] = await Promise.all([
    query.orderBy("issued_at", "desc").limit(limit).offset(offset),
    countQuery.count("* as count"),
  ])

  res.json({ tokens, count: Number(count), limit, offset })
}

/**
 * POST /admin/invite-tokens
 * Create a manual invite token (without waitlist application).
 * Body: { email, expires_days?: number }
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const adminEmail = (req as any).auth_context?.actor_id || "admin"
  const { email, expires_days } = req.body as { email?: string; expires_days?: number }

  if (!email || !email.includes("@")) {
    res.status(400).json({ message: "Valid email address is required" })
    return
  }

  const raw = generateRawToken()
  const display = formatToken(raw)
  const days = expires_days && expires_days > 0 ? expires_days : 21
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  const id = generateEntityId()
  await pg("invite_tokens").insert({
    id,
    token: raw,
    token_display: display,
    application_id: null,
    email: email.trim().toLowerCase(),
    issued_by: adminEmail,
    issued_at: new Date(),
    expires_at: expiresAt,
    status: "active",
  })

  const token = await pg("invite_tokens").where("id", id).first()
  res.status(201).json({ token })
}
