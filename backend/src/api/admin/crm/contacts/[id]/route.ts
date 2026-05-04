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

    const [emails, addresses, phones, sources, notes, auditLog, tasks, transactions] =
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
        // Tasks (S6.6)
        pgConnection("crm_master_task")
          .where({ master_id: id })
          .whereNull("deleted_at")
          .orderByRaw(`status = 'done' ASC, status = 'cancelled' ASC,
                       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                       due_at NULLS LAST, created_at DESC`),
        // Transactions via source_link (customer_source matches sl.source) + Line-Items
        pgConnection.raw(
          `WITH txns AS (
             SELECT t.id, t.source, t.source_record_id, t.doc_type,
                    t.doc_number, t.doc_date, t.delivery_date,
                    t.total_gross, t.total_net, t.total_tax, t.shipping_cost,
                    t.currency, t.status,
                    t.payment_method, t.notes_or_warnings,
                    t.billing_address_raw, t.shipping_address_raw
             FROM crm_staging_transaction t
             JOIN crm_master_source_link sl
               ON sl.source = t.customer_source
              AND sl.source_record_id = t.customer_source_record_id
             WHERE sl.master_id = ?
             ORDER BY t.doc_date DESC, t.doc_number DESC NULLS LAST
             LIMIT 200
           )
           SELECT
             txns.*,
             (SELECT COUNT(*) FROM crm_staging_transaction_item ti WHERE ti.transaction_id = txns.id) AS item_count,
             COALESCE((
               SELECT json_agg(item ORDER BY pos)
               FROM (
                 SELECT ti.position AS pos,
                        json_build_object(
                          'position', ti.position,
                          'article_no', ti.article_no,
                          'article_name', ti.article_name,
                          'quantity', ti.quantity,
                          'unit', ti.unit,
                          'unit_price', ti.unit_price,
                          'line_total_gross', ti.line_total_gross,
                          'line_total_net', ti.line_total_net,
                          'vat_rate', ti.vat_rate,
                          'is_shipping', ti.is_shipping,
                          'is_discount', ti.is_discount
                        ) AS item
                 FROM crm_staging_transaction_item ti
                 WHERE ti.transaction_id = txns.id
                 ORDER BY ti.position
                 LIMIT 100
               ) sub
             ), '[]'::json) AS items
           FROM txns
           ORDER BY doc_date DESC, doc_number DESC NULLS LAST`,
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
      tasks,
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

// ── PATCH /admin/crm/contacts/:id — Master-Felder editieren ──────────────
//
// Editable: display_name, contact_type, tier, is_test, is_blocked,
//           blocked_reason, tags, manual_review_status
//
// Per-Field-Diff im Audit-Log:
//   - field-changes → 'master_updated' (details.fields_changed)
//   - tier change → zusätzlich 'tier_set' (details.from/to)
//   - is_blocked true → 'block' (details.reason), false → 'unblock'
//   - is_test change → 'is_test_set' / 'is_test_unset'
//   - tags array diff → 'tag_added' / 'tag_removed' per tag
type PatchBody = {
  // Naming
  display_name?: string
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  salutation?: string | null
  title?: string | null
  // Classification
  contact_type?: "person" | "business" | null
  tier?: "platinum" | "gold" | "silver" | "bronze" | "standard" | "dormant" | null
  lifecycle_stage?: "lead" | "active" | "engaged" | "at_risk" | "dormant" | "churned" | "lost" | null
  // Profile
  preferred_language?: string | null
  avatar_url?: string | null
  birthday?: string | null  // ISO date
  // Acquisition
  acquisition_channel?: string | null
  acquisition_campaign?: string | null
  acquisition_date?: string | null
  // Status
  is_test?: boolean
  is_blocked?: boolean
  blocked_reason?: string | null
  tags?: string[]
  manual_review_status?: string | null
}

const ALLOWED_TIERS = new Set([
  "platinum", "gold", "silver", "bronze", "standard", "dormant",
])
const ALLOWED_REVIEW = new Set(["auto", "pending", "reviewed", "rejected"])
const ALLOWED_CONTACT_TYPES = new Set(["person", "business"])
const ALLOWED_LIFECYCLE = new Set([
  "lead", "active", "engaged", "at_risk", "dormant", "churned", "lost",
])

// Simple-String-Felder, die direkt mit before-Wert verglichen werden können
const SIMPLE_STRING_FIELDS = [
  "first_name", "last_name", "company", "salutation", "title",
  "preferred_language", "avatar_url",
  "acquisition_channel", "acquisition_campaign",
] as const

// Date-Felder (input als ISO-string, gespeichert als date)
const DATE_FIELDS = ["birthday", "acquisition_date"] as const

export async function PATCH(
  req: MedusaRequest<PatchBody, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const id = (req.params as { id?: string })?.id
  const payload = (req.body as PatchBody) || {}
  const admin = "admin@vod-auctions.com"

  if (!id) {
    res.status(400).json({ ok: false, error: "id required" })
    return
  }

  try {
    const before = await pgConnection("crm_master_contact")
      .where({ id, deleted_at: null })
      .first()
    if (!before) {
      res.status(404).json({ ok: false, error: "Contact not found" })
      return
    }

    const updates: Record<string, unknown> = {}
    const fieldsChanged: string[] = []

    if (typeof payload.display_name === "string" && payload.display_name.trim()) {
      const v = payload.display_name.trim()
      if (v !== before.display_name) {
        updates.display_name = v
        fieldsChanged.push("display_name")
      }
    }

    // Simple String-Felder: trim, "" → null
    for (const f of SIMPLE_STRING_FIELDS) {
      if ((payload as Record<string, unknown>)[f] !== undefined) {
        const raw = (payload as Record<string, unknown>)[f]
        const v = raw === null || raw === "" ? null : String(raw).trim() || null
        if (v !== (before as Record<string, unknown>)[f]) {
          updates[f] = v
          fieldsChanged.push(f)
        }
      }
    }

    // Date-Felder
    for (const f of DATE_FIELDS) {
      if ((payload as Record<string, unknown>)[f] !== undefined) {
        const raw = (payload as Record<string, unknown>)[f]
        const v = raw === null || raw === "" ? null : String(raw).trim() || null
        // Date-Compare: stringify before-Wert
        const beforeVal = (before as Record<string, unknown>)[f]
        const beforeStr = beforeVal instanceof Date
          ? beforeVal.toISOString().slice(0, 10)
          : beforeVal === null || beforeVal === undefined
            ? null
            : String(beforeVal).slice(0, 10)
        if (v !== beforeStr) {
          updates[f] = v
          fieldsChanged.push(f)
        }
      }
    }

    // Lifecycle-Stage (mit Validierung + Auto-Setzen lifecycle_changed_at)
    if (payload.lifecycle_stage !== undefined) {
      const v = payload.lifecycle_stage === null || payload.lifecycle_stage === ""
        ? null
        : payload.lifecycle_stage
      if (v !== null && !ALLOWED_LIFECYCLE.has(v)) {
        res.status(400).json({ ok: false, error: "invalid lifecycle_stage" })
        return
      }
      if (v !== before.lifecycle_stage) {
        updates.lifecycle_stage = v
        updates.lifecycle_changed_at = pgConnection.fn.now()
        fieldsChanged.push("lifecycle_stage")
      }
    }
    if (payload.contact_type !== undefined) {
      const v = payload.contact_type === null || payload.contact_type === ""
        ? null
        : payload.contact_type
      if (v !== null && !ALLOWED_CONTACT_TYPES.has(v)) {
        res.status(400).json({ ok: false, error: "invalid contact_type" })
        return
      }
      if (v !== before.contact_type) {
        updates.contact_type = v
        fieldsChanged.push("contact_type")
      }
    }
    if (payload.tier !== undefined) {
      const v = payload.tier === null || payload.tier === ""
        ? null
        : payload.tier
      if (v !== null && !ALLOWED_TIERS.has(v)) {
        res.status(400).json({ ok: false, error: "invalid tier" })
        return
      }
      if (v !== before.tier) {
        updates.tier = v
        updates.tier_calculated_at = pgConnection.fn.now()
        fieldsChanged.push("tier")
      }
    }
    if (typeof payload.is_test === "boolean" && payload.is_test !== before.is_test) {
      updates.is_test = payload.is_test
      fieldsChanged.push("is_test")
    }
    if (typeof payload.is_blocked === "boolean" && payload.is_blocked !== before.is_blocked) {
      updates.is_blocked = payload.is_blocked
      fieldsChanged.push("is_blocked")
    }
    if (payload.blocked_reason !== undefined) {
      const v = payload.blocked_reason === null || payload.blocked_reason === ""
        ? null
        : String(payload.blocked_reason).trim()
      if (v !== before.blocked_reason) {
        updates.blocked_reason = v
        fieldsChanged.push("blocked_reason")
      }
    }
    if (Array.isArray(payload.tags)) {
      const cleaned = Array.from(new Set(payload.tags.map((t) => String(t).trim()).filter(Boolean)))
      const beforeTags: string[] = (before.tags as string[]) || []
      if (
        cleaned.length !== beforeTags.length ||
        cleaned.some((t, i) => t !== beforeTags[i]) ||
        beforeTags.some((t) => !cleaned.includes(t))
      ) {
        updates.tags = cleaned
        fieldsChanged.push("tags")
      }
    }
    if (payload.manual_review_status !== undefined) {
      const v = payload.manual_review_status === null || payload.manual_review_status === ""
        ? null
        : payload.manual_review_status
      if (v !== null && !ALLOWED_REVIEW.has(v)) {
        res.status(400).json({ ok: false, error: "invalid manual_review_status" })
        return
      }
      if (v !== before.manual_review_status) {
        updates.manual_review_status = v
        fieldsChanged.push("manual_review_status")
      }
    }

    if (fieldsChanged.length === 0) {
      res.json({ ok: true, master: before, changed: [] })
      return
    }

    updates.updated_at = pgConnection.fn.now()

    // Knex .update() braucht JSON.stringify nicht für text[] (nur für jsonb).
    // tags ist text[] → array literal works direkt.
    const [after] = await pgConnection("crm_master_contact")
      .where({ id })
      .update(updates)
      .returning("*")

    // Audit-Log-Einträge
    const auditEntries: Array<Record<string, unknown>> = []
    auditEntries.push({
      master_id: id,
      action: "master_updated",
      details: { fields_changed: fieldsChanged },
      source: "admin_ui",
      admin_email: admin,
    })

    if (fieldsChanged.includes("tier")) {
      auditEntries.push({
        master_id: id,
        action: "tier_set",
        details: { from: before.tier, to: updates.tier },
        source: "admin_ui",
        admin_email: admin,
      })
    }
    if (fieldsChanged.includes("lifecycle_stage")) {
      auditEntries.push({
        master_id: id,
        action: "lifecycle_stage_changed",
        details: { from: before.lifecycle_stage, to: updates.lifecycle_stage },
        source: "admin_ui",
        admin_email: admin,
      })
    }
    if (fieldsChanged.includes("is_blocked")) {
      auditEntries.push({
        master_id: id,
        action: updates.is_blocked ? "block" : "unblock",
        details: { reason: updates.blocked_reason || null },
        source: "admin_ui",
        admin_email: admin,
      })
    }
    if (fieldsChanged.includes("is_test")) {
      auditEntries.push({
        master_id: id,
        action: updates.is_test ? "is_test_set" : "is_test_unset",
        details: {},
        source: "admin_ui",
        admin_email: admin,
      })
    }
    if (fieldsChanged.includes("tags")) {
      const beforeTags: string[] = (before.tags as string[]) || []
      const afterTags: string[] = (updates.tags as string[]) || []
      const added = afterTags.filter((t) => !beforeTags.includes(t))
      const removed = beforeTags.filter((t) => !afterTags.includes(t))
      for (const t of added) {
        auditEntries.push({
          master_id: id,
          action: "tag_added",
          details: { tag: t },
          source: "admin_ui",
          admin_email: admin,
        })
      }
      for (const t of removed) {
        auditEntries.push({
          master_id: id,
          action: "tag_removed",
          details: { tag: t },
          source: "admin_ui",
          admin_email: admin,
        })
      }
    }

    if (auditEntries.length > 0) {
      await pgConnection("crm_master_audit_log").insert(auditEntries)
    }

    res.json({ ok: true, master: after, changed: fieldsChanged })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[admin/crm/contacts/:id PATCH] error:", message)
    res.status(500).json({ ok: false, error: message })
  }
}
