import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { ENV_VAR_MODE_HASH, extractBearerToken, tokenMatches } from "../../../lib/api-tokens"
import { getClientIp } from "../../../lib/rate-limiter"

/**
 * GET /print/bridge-config?uuid=<bridge_uuid>
 *
 * Called by the Print Bridge agent on startup to fetch its printer
 * configuration from the database instead of relying on env vars.
 *
 * Auth (Stage C+):
 *   - Bridges mit echtem api_token_hash: Authorization: Bearer <token> Pflicht
 *   - Bridges mit Placeholder-Hash 'rc52-env-var-mode' (Frank/David vor
 *     Stage E/F): kein Bearer nötig — rc52-Compat
 *   - Bridges mit api_token_revoked_at != NULL: 401, auch mit korrektem Token
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
        "b.api_token_revoked_at",
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

    // Auth-Layer:
    //   ENV_VAR_MODE_HASH-Placeholder → Stage-B-Compat, kein Bearer nötig
    //   echter Hash → Bearer Pflicht, sha256(input) muss matchen
    //   revoked → 401 selbst mit altem Token
    if (bridge.api_token_hash && bridge.api_token_hash !== ENV_VAR_MODE_HASH) {
      if (bridge.api_token_revoked_at) {
        res.set("WWW-Authenticate", 'Bearer error="token_revoked"')
        res.status(401).json({ message: "Bridge token has been revoked" })
        return
      }
      const presented = extractBearerToken(req.headers.authorization as string | undefined)
      if (!presented || !tokenMatches(presented, bridge.api_token_hash)) {
        res.set("WWW-Authenticate", 'Bearer error="invalid_token"')
        res.status(401).json({ message: "Invalid or missing Bearer token" })
        return
      }
    }

    // last_seen_at + last_known_ip aktualisieren (best-effort, blockiert die
    // Response nicht — Bridge nutzt das als Health-Heartbeat)
    void pg("bridge_host")
      .where("bridge_uuid", uuid)
      .update({ last_seen_at: new Date(), last_known_ip: getClientIp(req) })
      .catch(() => undefined)

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
