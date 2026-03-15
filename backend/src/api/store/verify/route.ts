import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /store/verify?token=xxx — Public endpoint, no auth required
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const token = req.query.token as string
  if (!token) {
    res.status(400).json({ success: false, message: "Token is required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const verification = await pgConnection("customer_verification")
    .where("token", token)
    .whereNull("verified_at")
    .where("expires_at", ">", new Date())
    .first()

  if (!verification) {
    res.json({ success: false, message: "Invalid or expired token" })
    return
  }

  const now = new Date()

  // Mark token as verified
  await pgConnection("customer_verification")
    .where("id", verification.id)
    .update({ verified_at: now })

  // Set customer as email_verified
  await pgConnection("customer")
    .where("id", verification.customer_id)
    .update({ email_verified: true })

  res.json({ success: true })
}
