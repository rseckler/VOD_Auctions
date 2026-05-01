import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { generatePairingCode } from "../../../../../lib/pairing-codes"

const PAIRING_TTL_MIN = 30

/**
 * POST /admin/erp/bridges/pairing-tokens
 *
 * Erzeugt einen Pairing-Code (Crockford-Base32, 12 Chars in 4-4-4-Gruppen mit
 * VOD-Prefix), schreibt eine bridge_pairing_token-Row mit Pre-fill-Feldern
 * für die später entstehende bridge_host-Row und liefert Code + expires_at +
 * token_id zurück. Der Code wird nur 1× ausgespielt (kein Re-Read möglich
 * — `bridge_pairing_token` speichert ihn aber im Klartext im Index, weil die
 * /print/bridges/pair-Route ihn ja matchen muss).
 *
 * Body: { person_label, display_name, is_mobile?, default_location_id?, notes? }
 * Response: { id, pairing_code, expires_at }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const adminEmail = (req as any).auth_context?.actor_id || "admin"
  const body = (req.body || {}) as Record<string, unknown>

  const person_label = String(body.person_label || "").trim()
  const display_name = String(body.display_name || "").trim()
  if (!person_label || !display_name) {
    res.status(400).json({ message: "person_label and display_name are required" })
    return
  }
  const is_mobile = body.is_mobile === true
  const default_location_id =
    typeof body.default_location_id === "string" && body.default_location_id.trim()
      ? body.default_location_id.trim()
      : null
  const notes =
    typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null

  // Falls default_location_id gesetzt → existence-check
  if (default_location_id) {
    const wl = await pg("warehouse_location").where("id", default_location_id).first()
    if (!wl) {
      res.status(400).json({ message: "default_location_id not found" })
      return
    }
  }

  // Code-Collision unwahrscheinlich (60 bit Entropie), aber retry sicherheitshalber
  let code = ""
  let id = ""
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generatePairingCode()
    const dup = await pg("bridge_pairing_token")
      .where("pairing_code", code)
      .whereNull("used_at")
      .first()
    if (!dup) {
      id = generateEntityId()
      break
    }
  }
  if (!id) {
    res.status(500).json({ message: "Failed to generate unique pairing code after 5 attempts" })
    return
  }

  const expiresAt = new Date(Date.now() + PAIRING_TTL_MIN * 60_000)
  try {
    await pg("bridge_pairing_token").insert({
      id,
      pairing_code: code,
      person_label,
      display_name,
      is_mobile,
      default_location_id,
      notes,
      expires_at: expiresAt,
      created_by_admin_id: adminEmail,
      created_at: new Date(),
    })
    res.status(201).json({
      id,
      pairing_code: code,
      expires_at: expiresAt.toISOString(),
      ttl_minutes: PAIRING_TTL_MIN,
    })
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create pairing token" })
  }
}
