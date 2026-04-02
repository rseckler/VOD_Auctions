import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { generateRawToken, formatToken } from "../../../lib/invite"
import { sendInviteWelcomeEmail } from "../../../lib/email-helpers"

/**
 * GET /admin/waitlist
 * Paginated waitlist applications. Query: ?status, ?wave, ?source, ?q, ?sort, ?limit, ?offset
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Number(req.query.offset) || 0
  const status = req.query.status as string | undefined
  const wave = req.query.wave as string | undefined
  const source = req.query.source as string | undefined
  const q = req.query.q as string | undefined
  const sort = (req.query.sort as string) || "created_at:desc"

  let query = pg("waitlist_applications")
  let countQuery = pg("waitlist_applications")

  if (status) {
    query = query.where("status", status)
    countQuery = countQuery.where("status", status)
  }
  if (wave) {
    query = query.where("wave", Number(wave))
    countQuery = countQuery.where("wave", Number(wave))
  }
  if (source) {
    query = query.where("source", source)
    countQuery = countQuery.where("source", source)
  }
  if (q) {
    const like = `%${q}%`
    query = query.where(function () {
      this.whereILike("email", like).orWhereILike("name", like)
    })
    countQuery = countQuery.where(function () {
      this.whereILike("email", like).orWhereILike("name", like)
    })
  }

  const [sortField, sortDir] = sort.split(":")
  query = query.orderBy(sortField || "created_at", sortDir === "asc" ? "asc" : "desc")

  const [applications, [{ count }]] = await Promise.all([
    query.limit(limit).offset(offset),
    countQuery.count("* as count"),
  ])

  // Stats
  const stats = await pg("waitlist_applications")
    .select("status")
    .count("* as count")
    .groupBy("status")

  const statsMap: Record<string, number> = {}
  for (const s of stats) {
    statsMap[s.status] = Number(s.count)
  }

  res.json({ applications, count: Number(count), limit, offset, stats: statsMap })
}

/**
 * POST /admin/waitlist
 * Bulk approve + invite.
 * Body: { ids: string[], wave?: number }
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const adminEmail = (req as any).auth_context?.actor_id || "admin"
  const { ids, wave } = req.body as { ids?: string[]; wave?: number }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ message: "ids array is required" })
    return
  }

  const applications = await pg("waitlist_applications").whereIn("id", ids)
  let invited = 0
  let errors: string[] = []

  for (const app of applications) {
    try {
      // Approve if pending
      if (app.status === "pending") {
        await pg("waitlist_applications").where("id", app.id).update({
          status: "approved",
          approved_at: new Date(),
          wave: wave || null,
        })
      }

      // Check if already has an active token
      const existingToken = await pg("invite_tokens")
        .where("application_id", app.id)
        .whereIn("status", ["active"])
        .first()

      if (existingToken) {
        errors.push(`${app.email}: already has active invite`)
        continue
      }

      // Generate token
      const raw = generateRawToken()
      const display = formatToken(raw)
      const expiresAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000) // 21 days

      await pg("invite_tokens").insert({
        id: generateEntityId(),
        token: raw,
        token_display: display,
        application_id: app.id,
        email: app.email,
        issued_by: adminEmail,
        issued_at: new Date(),
        expires_at: expiresAt,
        status: "active",
      })

      // Update application status
      await pg("waitlist_applications").where("id", app.id).update({
        status: "invited",
        invited_at: new Date(),
        wave: wave || app.wave,
      })

      // Send invite email
      await sendInviteWelcomeEmail(pg, app.id).catch((err) => {
        console.error(`[waitlist] Failed to send invite email to ${app.email}:`, err)
      })

      invited++
    } catch (err: any) {
      errors.push(`${app.email}: ${err.message}`)
    }
  }

  res.json({
    success: true,
    invited,
    total: ids.length,
    errors: errors.length > 0 ? errors : undefined,
  })
}
