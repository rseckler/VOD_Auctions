import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

/**
 * POST /admin/invite-tokens/:id
 * Actions: revoke
 * Body: { action: "revoke" }
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params
  const { action } = req.body as { action?: string }

  const token = await pg("invite_tokens").where("id", id).first()
  if (!token) {
    res.status(404).json({ message: "Token not found" })
    return
  }

  if (action === "revoke") {
    if (token.status !== "active") {
      res.status(400).json({ message: `Cannot revoke token with status '${token.status}'` })
      return
    }

    await pg("invite_tokens").where("id", id).update({
      status: "revoked",
    })

    const updated = await pg("invite_tokens").where("id", id).first()
    res.json({ token: updated })
  } else {
    res.status(400).json({ message: "Invalid action. Use: revoke" })
  }
}
