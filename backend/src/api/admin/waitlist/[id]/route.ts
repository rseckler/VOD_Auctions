import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { generateRawToken, formatToken } from "../../../../lib/invite"
import { sendInviteWelcomeEmail } from "../../../../lib/email-helpers"

/**
 * GET /admin/waitlist/:id
 * Returns a single waitlist application + any associated invite tokens.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params

  const application = await pg("waitlist_applications").where("id", id).first()
  if (!application) {
    res.status(404).json({ message: "Application not found" })
    return
  }

  const tokens = await pg("invite_tokens")
    .where("application_id", id)
    .orderBy("issued_at", "desc")

  res.json({ application, tokens })
}

/**
 * POST /admin/waitlist/:id
 * Update application: approve, reject, add notes, or invite.
 * Body: { action: "approve"|"reject"|"invite"|"notes", notes?: string, wave?: number }
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const adminEmail = (req as any).auth_context?.actor_id || "admin"
  const { id } = req.params
  const { action, notes, wave } = req.body as {
    action?: string
    notes?: string
    wave?: number
  }

  const application = await pg("waitlist_applications").where("id", id).first()
  if (!application) {
    res.status(404).json({ message: "Application not found" })
    return
  }

  switch (action) {
    case "approve":
      await pg("waitlist_applications").where("id", id).update({
        status: "approved",
        approved_at: new Date(),
        wave: wave ?? application.wave,
      })
      break

    case "reject":
      await pg("waitlist_applications").where("id", id).update({
        status: "rejected",
      })
      break

    case "invite": {
      // Approve first if needed
      if (application.status === "pending") {
        await pg("waitlist_applications").where("id", id).update({
          status: "approved",
          approved_at: new Date(),
        })
      }

      // Generate token
      const raw = generateRawToken()
      const display = formatToken(raw)
      const expiresAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000)

      await pg("invite_tokens").insert({
        id: generateEntityId(),
        token: raw,
        token_display: display,
        application_id: id,
        email: application.email,
        issued_by: adminEmail,
        issued_at: new Date(),
        expires_at: expiresAt,
        status: "active",
      })

      await pg("waitlist_applications").where("id", id).update({
        status: "invited",
        invited_at: new Date(),
        wave: wave ?? application.wave,
      })

      // Send invite email
      await sendInviteWelcomeEmail(pg, id).catch((err) => {
        console.error(`[waitlist/${id}] Failed to send invite email:`, err)
      })
      break
    }

    case "notes":
      await pg("waitlist_applications").where("id", id).update({
        admin_notes: notes || null,
      })
      break

    default:
      res.status(400).json({ message: "Invalid action. Use: approve, reject, invite, notes" })
      return
  }

  const updated = await pg("waitlist_applications").where("id", id).first()
  res.json({ application: updated })
}

/**
 * DELETE /admin/waitlist/:id
 * Permanently delete a waitlist application and its tokens.
 */
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params

  await pg("invite_tokens").where("application_id", id).delete()
  await pg("waitlist_applications").where("id", id).delete()

  res.json({ success: true })
}
