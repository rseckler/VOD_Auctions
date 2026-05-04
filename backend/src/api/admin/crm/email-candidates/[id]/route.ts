import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

const ADMIN = "admin@vod-auctions.com"

// PATCH /admin/crm/email-candidates/:id — accept/reject + bei accept Email anlegen
type Body = { action?: "accept" | "reject"; notes?: string; set_primary?: boolean }

export async function PATCH(
  req: MedusaRequest<Body, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const id = (req.params as { id?: string })?.id
  const body = (req.body || {}) as Body
  if (!id || (body.action !== "accept" && body.action !== "reject")) {
    res.status(400).json({ ok: false, error: "id + action (accept|reject) required" })
    return
  }
  try {
    const result = await pgConnection.transaction(async (trx) => {
      const cand = await trx("crm_email_candidate").where({ id }).first()
      if (!cand) throw new Error("Candidate not found")
      if (cand.status !== "pending") throw new Error(`Already ${cand.status}`)

      if (body.action === "reject") {
        await trx("crm_email_candidate").where({ id }).update({
          status: "rejected",
          reviewed_by: ADMIN,
          reviewed_at: trx.fn.now(),
          review_notes: body.notes || null,
        })
        await trx("crm_master_audit_log").insert({
          master_id: cand.master_id,
          action: "email_candidate_rejected",
          details: { email: cand.email, candidate_id: id },
          source: "admin_ui",
          admin_email: ADMIN,
        })
        return { ok: true, action: "rejected" }
      }

      // ACCEPT: Email anlegen wenn nicht existiert + ggf. primary
      const existing = await trx("crm_master_email")
        .where({ master_id: cand.master_id, email_lower: cand.email.toLowerCase() })
        .first()
      let emailRow = existing
      if (!existing) {
        const master = await trx("crm_master_contact").where({ id: cand.master_id }).first()
        const setPrimary = body.set_primary || !master?.primary_email_lower
        ;[emailRow] = await trx("crm_master_email").insert({
          master_id: cand.master_id,
          email: cand.email,
          is_primary: setPrimary,
          is_verified: false,
          source_count: 1,
          source_list: ["imap_match_reviewed"],
        }).returning("*")
        if (setPrimary) {
          await trx("crm_master_email")
            .where({ master_id: cand.master_id })
            .andWhereNot({ id: emailRow.id })
            .update({ is_primary: false })
          await trx("crm_master_contact").where({ id: cand.master_id }).update({
            primary_email: emailRow.email,
            primary_email_lower: emailRow.email_lower,
            updated_at: trx.fn.now(),
          })
        }
      }

      await trx("crm_email_candidate").where({ id }).update({
        status: "accepted",
        reviewed_by: ADMIN,
        reviewed_at: trx.fn.now(),
        review_notes: body.notes || null,
      })
      await trx("crm_master_audit_log").insert({
        master_id: cand.master_id,
        action: "email_candidate_accepted",
        details: { email: cand.email, candidate_id: id, email_id: emailRow?.id },
        source: "admin_ui",
        admin_email: ADMIN,
      })

      return { ok: true, action: "accepted", email_id: emailRow?.id }
    })
    res.json(result)
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    res.status(m === "Candidate not found" ? 404 : 500).json({ ok: false, error: m })
  }
}
