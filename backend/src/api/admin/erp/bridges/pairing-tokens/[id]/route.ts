import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

/**
 * GET /admin/erp/bridges/pairing-tokens/:id
 *
 * Status-Polling für das Admin-UI-Modal. Liefert "pending" (noch nicht
 * eingelöst, noch nicht abgelaufen), "consumed" (eingelöst — bridge_host_id
 * im Body) oder "expired" (TTL überschritten ohne Einlösung).
 *
 * Wird vom Admin-UI im 5-Sekunden-Takt gepollt während das Pairing-Modal
 * offen ist.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params
  try {
    const row = await pg("bridge_pairing_token").where("id", id).first()
    if (!row) {
      res.status(404).json({ message: "Pairing token not found" })
      return
    }

    let status: "pending" | "consumed" | "expired"
    let bridge_host_id: string | null = null

    if (row.used_at) {
      status = "consumed"
      // Find the bridge_host row that consumed it
      if (row.used_by_bridge_uuid) {
        const bh = await pg("bridge_host")
          .select("id")
          .where("bridge_uuid", row.used_by_bridge_uuid)
          .first()
        bridge_host_id = bh?.id ?? null
      }
    } else if (new Date(row.expires_at).getTime() < Date.now()) {
      status = "expired"
    } else {
      status = "pending"
    }

    res.json({
      id: row.id,
      status,
      pairing_code: row.pairing_code,
      person_label: row.person_label,
      display_name: row.display_name,
      expires_at: row.expires_at,
      used_at: row.used_at,
      bridge_host_id,
    })
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load pairing token" })
  }
}
