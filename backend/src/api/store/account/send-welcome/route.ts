import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { sendWelcomeEmail } from "../../../../lib/email-helpers"

// POST /store/account/send-welcome — Send welcome email after registration
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  // Send welcome email (async, non-blocking)
  sendWelcomeEmail(pgConnection, customerId).catch((err) => {
    console.error("[send-welcome] Failed:", err)
  })

  res.json({ success: true })
}
