import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

/**
 * GET /print/bridge-config?uuid=<bridge_uuid>
 *
 * Called by the Print Bridge agent on startup (Stage B+) to fetch its printer
 * configuration from the database instead of relying on env vars.
 *
 * No admin auth required — bridge_uuid identifies the caller.
 * Stage C adds Bearer-token verification (api_token_hash) on top of this.
 *
 * Returns all active printers so the Bridge can route to any location,
 * not just its default. Useful for mobile Macs (Kay, David) that may
 * temporarily work at a different location.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const uuid = ((req.query as Record<string, string>).uuid ?? "").trim()

  if (!uuid) {
    res.status(400).json({ message: "uuid query param is required" })
    return
  }

  try {
    const bridge = await pg("bridge_host as b")
      .leftJoin("warehouse_location as wl", "b.default_location_id", "wl.id")
      .select(
        "b.bridge_uuid",
        "b.person_label",
        "b.display_name",
        "b.is_mobile",
        "b.is_active",
        "b.api_token_hash",
        "wl.code as default_location_code"
      )
      .where("b.bridge_uuid", uuid)
      .first()

    if (!bridge) {
      res.status(404).json({ message: "Bridge not found" })
      return
    }

    if (!bridge.is_active) {
      res.status(403).json({ message: "Bridge is disabled" })
      return
    }

    // Stage B: any known active UUID gets config.
    // Stage C will enforce: api_token_hash must match Bearer token.
    // Pre-pair placeholder values ('rc52-env-var-mode') intentionally excluded
    // from DB-mode usage — Frank/David use env vars and won't set VOD_BRIDGE_UUID.

    const printers = await pg("printer as p")
      .join("warehouse_location as wl", "p.warehouse_location_id", "wl.id")
      .select(
        "wl.code as location_code",
        "p.ip_address",
        "p.port",
        "p.brother_ql_model",
        "p.label_type",
        "p.is_default_for_location"
      )
      .where("p.is_active", true)
      .orderBy([{ column: "wl.sort_order" }, { column: "p.sort_order" }])

    // Build printers map: { "CODE": { ip, model, label_type, port } }
    // If multiple printers per location, is_default_for_location=true wins.
    const printersMap: Record<string, { ip: string; model: string; label_type: string; port: number }> = {}
    for (const p of printers) {
      if (!printersMap[p.location_code] || p.is_default_for_location) {
        printersMap[p.location_code] = {
          ip: p.ip_address,
          model: p.brother_ql_model || "QL-820NWB",
          label_type: p.label_type,
          port: Number(p.port),
        }
      }
    }

    res.json({
      bridge: {
        bridge_uuid: bridge.bridge_uuid,
        person_label: bridge.person_label,
        display_name: bridge.display_name,
        is_mobile: bridge.is_mobile,
        default_location: bridge.default_location_code ?? null,
      },
      printers: printersMap,
      default_location: bridge.default_location_code ?? null,
    })
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load bridge config" })
  }
}
