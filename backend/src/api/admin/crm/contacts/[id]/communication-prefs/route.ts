import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

const ADMIN = "admin@vod-auctions.com"
const CHANNELS = new Set(["email_marketing", "email_transactional", "sms", "phone", "postal", "push"])

// GET — alle Prefs eines Masters
export async function GET(
  req: MedusaRequest<unknown, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const id = (req.params as { id?: string })?.id
  if (!id) { res.status(400).json({ ok: false, error: "id required" }); return }
  try {
    const prefs = await pgConnection("crm_master_communication_pref")
      .where({ master_id: id }).orderBy("channel")
    res.json({ prefs })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

// POST — Pref upsert (channel + opted_in)
type CreateBody = { channel?: string; opted_in?: boolean; source?: string; notes?: string }

export async function POST(
  req: MedusaRequest<CreateBody, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const id = (req.params as { id?: string })?.id
  const body = (req.body || {}) as CreateBody
  const channel = body.channel || ""
  if (!id || !CHANNELS.has(channel)) {
    res.status(400).json({ ok: false, error: "id + valid channel required" })
    return
  }
  const optedIn = body.opted_in !== false
  try {
    const result = await pgConnection.transaction(async (trx) => {
      const existing = await trx("crm_master_communication_pref")
        .where({ master_id: id, channel }).first()

      const now = trx.fn.now()
      let pref
      if (existing) {
        const updates: Record<string, unknown> = { opted_in: optedIn, updated_at: now }
        if (optedIn && !existing.opted_in) {
          updates.opted_in_at = now
          updates.opted_out_at = null
        } else if (!optedIn && existing.opted_in) {
          updates.opted_out_at = now
        }
        if (body.source) updates.source = body.source
        if (body.notes !== undefined) updates.notes = body.notes
        ;[pref] = await trx("crm_master_communication_pref")
          .where({ id: existing.id }).update(updates).returning("*")
      } else {
        ;[pref] = await trx("crm_master_communication_pref").insert({
          master_id: id,
          channel,
          opted_in: optedIn,
          opted_in_at: optedIn ? now : null,
          opted_out_at: optedIn ? null : now,
          source: body.source || "admin_ui",
          notes: body.notes || null,
        }).returning("*")
      }
      await trx("crm_master_audit_log").insert({
        master_id: id,
        action: optedIn ? "comm_pref_opt_in" : "comm_pref_opt_out",
        details: { channel, source: body.source || "admin_ui" },
        source: "admin_ui",
        admin_email: ADMIN,
      })
      return pref
    })
    res.json({ pref: result })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
