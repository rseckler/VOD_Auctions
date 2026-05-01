import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

/**
 * GET /admin/erp/bridges
 * Lists all bridge_host rows with optional warehouse_location join.
 * Returns last_seen_at so the UI can show online/offline status.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  try {
    const bridges = await pg("bridge_host as b")
      .leftJoin("warehouse_location as wl", "b.default_location_id", "wl.id")
      .select(
        "b.id", "b.bridge_uuid", "b.person_label", "b.display_name",
        "b.is_mobile", "b.is_active", "b.hostname", "b.platform",
        "b.bridge_version", "b.last_known_ip", "b.last_seen_at",
        "b.last_print_at", "b.last_location_used", "b.notes",
        "b.paired_at", "b.created_at", "b.updated_at",
        "b.default_location_id",
        "wl.code as default_location_code",
        "wl.name as default_location_name"
      )
      .orderBy([{ column: "b.is_active", order: "desc" }, { column: "b.person_label" }])
    res.json({ bridges, count: bridges.length })
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load bridges" })
  }
}
