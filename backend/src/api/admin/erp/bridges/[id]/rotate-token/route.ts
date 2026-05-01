import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { generateApiToken, ENV_VAR_MODE_HASH } from "../../../../../../lib/api-tokens"

/**
 * POST /admin/erp/bridges/:id/rotate-token
 *
 * Generiert einen neuen api_token für eine bridge_host-Row, alter Hash wird
 * überschrieben (kein Audit-Log nötig — paired_at + api_token_issued_at decken
 * das Audit-Bedürfnis ab). Klartext nur 1× im Response.
 *
 * Frank/David im rc52-env-var-Mode (api_token_hash='rc52-env-var-mode')
 * können explizit nicht rotiert werden — sie haben gar keinen Token, das wäre
 * der Stage-E/F-Cutover und nicht eine Rotation.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params

  try {
    const bridge = await pg("bridge_host").where("id", id).first()
    if (!bridge) {
      res.status(404).json({ message: "Bridge not found" })
      return
    }
    if (bridge.api_token_hash === ENV_VAR_MODE_HASH || !bridge.api_token_hash) {
      res
        .status(409)
        .json({
          message:
            "Bridge is in env-var mode (rc52). Use the pairing flow to issue a real token instead of rotating.",
        })
      return
    }

    const { clear, hash } = generateApiToken()
    const now = new Date()
    await pg("bridge_host").where("id", id).update({
      api_token_hash: hash,
      api_token_issued_at: now,
      api_token_revoked_at: null,
      updated_at: now,
    })

    res.json({
      api_token: clear,
      bridge_host_id: id,
      issued_at: now.toISOString(),
    })
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to rotate token" })
  }
}
