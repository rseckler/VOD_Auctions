import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/crm/contacts/:id/gdpr-export
// Vollständiger Datenexport pro DSGVO Art. 15 (Auskunftspflicht).
// Inkl. master + alle 1:N Sub-Tabellen + transactions/bids/orders/imap.
export async function GET(
  req: MedusaRequest<unknown, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const id = (req.params as { id?: string })?.id
  const admin = "admin@vod-auctions.com"

  if (!id) {
    res.status(400).json({ ok: false, error: "id required" })
    return
  }

  try {
    const master = await pgConnection("crm_master_contact").where({ id }).first()
    if (!master) {
      res.status(404).json({ ok: false, error: "Contact not found" })
      return
    }

    const [emails, addresses, phones, sources, notes, audit, tasks, transactions] = await Promise.all([
      pgConnection("crm_master_email").where({ master_id: id }),
      pgConnection("crm_master_address").where({ master_id: id }),
      pgConnection("crm_master_phone").where({ master_id: id }),
      pgConnection("crm_master_source_link").where({ master_id: id }),
      pgConnection("crm_master_note").where({ master_id: id }),
      pgConnection("crm_master_audit_log").where({ master_id: id }).orderBy("created_at", "desc"),
      pgConnection("crm_master_task").where({ master_id: id }),
      pgConnection.raw(
        `SELECT t.*, COALESCE((
           SELECT json_agg(ti ORDER BY ti.position)
           FROM crm_staging_transaction_item ti WHERE ti.transaction_id = t.id
         ), '[]'::json) AS items
         FROM crm_staging_transaction t
         JOIN crm_master_source_link sl
           ON sl.source = t.customer_source AND sl.source_record_id = t.customer_source_record_id
         WHERE sl.master_id = ?`,
        [id]
      ),
    ])

    let imap: unknown[] = []
    const masterEmails = (emails as Array<{ email_lower: string }>).map((e) => e.email_lower).filter(Boolean)
    if (masterEmails.length > 0) {
      const r = await pgConnection.raw(
        `SELECT id, account, folder, date_header, from_email, from_name, to_emails, subject, body_excerpt
         FROM crm_imap_message
         WHERE from_email_lower = ANY(?) OR ? && to_emails OR ? && cc_emails`,
        [masterEmails, masterEmails, masterEmails]
      )
      imap = r.rows || r
    }

    let medusaCustomer: unknown = null
    if (master.medusa_customer_id) {
      const c = await pgConnection("customer").where({ id: master.medusa_customer_id }).first()
      if (c) medusaCustomer = c
    }

    // Audit-Log: GDPR-Export wurde durchgeführt
    await pgConnection("crm_master_audit_log").insert({
      master_id: id,
      action: "gdpr_export",
      details: { exported_at: new Date().toISOString() },
      source: "admin_ui",
      admin_email: admin,
    })

    const fname = `gdpr-export-${id}-${new Date().toISOString().slice(0, 10)}.json`
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`)
    res.json({
      exported_at: new Date().toISOString(),
      master_contact: master,
      emails,
      addresses,
      phones,
      sources,
      notes,
      audit_log: audit,
      tasks,
      transactions: (transactions as { rows?: unknown[] }).rows || transactions,
      imap_messages: imap,
      medusa_customer: medusaCustomer,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
