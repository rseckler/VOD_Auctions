import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/crm/contacts/:id — Master-Contact Detail mit Activity-Timeline
//
// Returnt:
//   - master_contact-Row (alle Felder)
//   - emails (alle Master-Emails mit Source-Info, primary first)
//   - addresses (alle Adressen, primary first)
//   - phones
//   - sources (crm_master_source_link mit raw evidence)
//   - notes (crm_master_note, sortiert pinned DESC, created DESC)
//   - audit_log (crm_master_audit_log, neueste 100)
//   - activity (Timeline: legacy_transactions + bids + orders + imap, max 500)
//
// Sprint S6, Decision 5A — Detail-Drawer.
export async function GET(
  req: MedusaRequest<unknown, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const id = (req.params as { id?: string })?.id

  if (!id) {
    res.status(400).json({ ok: false, error: "id required" })
    return
  }

  try {
    const master = await pgConnection("crm_master_contact")
      .where({ id, deleted_at: null })
      .first()
    if (!master) {
      res.status(404).json({ ok: false, error: "Contact not found" })
      return
    }

    const [emails, addresses, phones, sources, notes, auditLog, transactions] =
      await Promise.all([
        pgConnection("crm_master_email")
          .where({ master_id: id })
          .orderBy("is_primary", "desc")
          .orderBy("created_at", "asc"),
        pgConnection("crm_master_address")
          .where({ master_id: id })
          .orderBy("is_primary", "desc")
          .orderBy("created_at", "asc"),
        pgConnection("crm_master_phone")
          .where({ master_id: id })
          .orderBy("is_primary", "desc")
          .orderBy("created_at", "asc"),
        pgConnection("crm_master_source_link")
          .where({ master_id: id })
          .orderBy("matched_at", "asc"),
        pgConnection("crm_master_note")
          .where({ master_id: id, deleted_at: null })
          .orderBy("pinned", "desc")
          .orderBy("created_at", "desc"),
        pgConnection("crm_master_audit_log")
          .where({ master_id: id })
          .orderBy("created_at", "desc")
          .limit(100),
        // Transactions via source_link (customer_source matches sl.source)
        pgConnection.raw(
          `SELECT t.id, t.source, t.source_record_id, t.doc_type,
                  t.doc_number, t.doc_date, t.delivery_date,
                  t.total_gross, t.currency, t.status,
                  t.payment_method, t.notes_or_warnings,
                  (SELECT COUNT(*) FROM crm_staging_transaction_item ti WHERE ti.transaction_id = t.id) AS item_count
           FROM crm_staging_transaction t
           JOIN crm_master_source_link sl
             ON sl.source = t.customer_source
            AND sl.source_record_id = t.customer_source_record_id
           WHERE sl.master_id = ?
           ORDER BY t.doc_date DESC, t.doc_number DESC NULLS LAST
           LIMIT 200`,
          [id]
        ),
      ])

    // Activity-Timeline: UNION über Transactions + Bids + Orders + IMAP-Mails
    const masterEmails = (emails as Array<{ email_lower: string }>)
      .map((e) => e.email_lower)
      .filter(Boolean)

    let imapMessages: Array<Record<string, unknown>> = []
    if (masterEmails.length > 0) {
      const imapResult = await pgConnection.raw(
        `SELECT id, account, folder, date_header, from_email, from_name,
                to_emails, subject, body_excerpt
         FROM crm_imap_message
         WHERE from_email_lower = ANY(?)
            OR ? && to_emails
            OR ? && cc_emails
         ORDER BY date_header DESC
         LIMIT 100`,
        [masterEmails, masterEmails, masterEmails]
      )
      imapMessages = imapResult.rows || imapResult
    }

    // Bids + Orders über medusa_customer_id
    let bids: Array<Record<string, unknown>> = []
    let orders: Array<Record<string, unknown>> = []
    if (master.medusa_customer_id) {
      const [bidsResult, ordersResult] = await Promise.all([
        pgConnection.raw(
          `SELECT b.id, b.amount, b.is_winning, b.is_outbid, b.created_at,
                  bi.lot_number, ab.title AS auction_title, ab.id AS auction_block_id
           FROM bid b
           LEFT JOIN block_item bi ON bi.id = b.block_item_id
           LEFT JOIN auction_block ab ON ab.id = bi.auction_block_id
           WHERE b.customer_id = ?
           ORDER BY b.created_at DESC
           LIMIT 50`,
          [master.medusa_customer_id]
        ),
        pgConnection.raw(
          `SELECT t.id, t.order_number, t.amount, t.status, t.fulfillment_status,
                  t.payment_provider, t.created_at, t.shipping_country,
                  bi.lot_number, ab.title AS auction_title
           FROM transaction t
           LEFT JOIN block_item bi ON bi.id = t.block_item_id
           LEFT JOIN auction_block ab ON ab.id = bi.auction_block_id
           WHERE t.customer_id = ?
           ORDER BY t.created_at DESC
           LIMIT 100`,
          [master.medusa_customer_id]
        ),
      ])
      bids = bidsResult.rows || bidsResult
      orders = ordersResult.rows || ordersResult
    }

    res.json({
      master: {
        ...master,
        tags: master.tags || [],
      },
      emails,
      addresses,
      phones,
      sources,
      notes,
      audit_log: auditLog,
      transactions: (transactions as { rows?: unknown[] }).rows || transactions,
      bids,
      orders,
      imap_messages: imapMessages,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[admin/crm/contacts/:id] error:", message)
    res.status(500).json({ ok: false, error: message })
  }
}
