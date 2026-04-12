import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../lib/inventory"
import crypto from "crypto"

/**
 * POST /admin/pos/sessions
 *
 * Create a new POS session. Returns a session_id (UUID) that the client
 * uses to group scanned items. Sessions are ephemeral — cart state lives
 * client-side (Zustand). The session_id is only stored on the final
 * transaction for traceability.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "POS_WALK_IN")

  const sessionId = crypto.randomUUID()

  res.json({
    session_id: sessionId,
    created_at: new Date().toISOString(),
  })
}
