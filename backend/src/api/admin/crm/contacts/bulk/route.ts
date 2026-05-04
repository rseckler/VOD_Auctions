import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

const ADMIN = "admin@vod-auctions.com"

const ALLOWED_TIERS = new Set(["platinum", "gold", "silver", "bronze", "standard", "dormant"])
const ALLOWED_LIFECYCLE = new Set(["lead", "active", "engaged", "at_risk", "dormant", "churned", "lost"])

// POST /admin/crm/contacts/bulk
// Body: { ids: [...], action: '...', value: any }
// Actions:
//   tag_add:        value=string         → push tag (idempotent)
//   tag_remove:     value=string         → remove tag
//   tier_set:       value=string|null    → set tier
//   lifecycle_set:  value=string|null    → set lifecycle_stage + changed_at
//   is_test_set:    value=boolean        → set is_test
//   block:          value={reason}       → is_blocked=true + reason
//   unblock:        no value             → is_blocked=false
type BulkBody = {
  ids?: string[]
  action?: string
  value?: unknown
}

export async function POST(
  req: MedusaRequest<BulkBody>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const body = (req.body || {}) as BulkBody
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string" && x.length > 0) : []
  const action = body.action || ""
  const value = body.value

  if (ids.length === 0) {
    res.status(400).json({ ok: false, error: "ids required" })
    return
  }
  if (ids.length > 5000) {
    res.status(400).json({ ok: false, error: "max 5000 ids per call" })
    return
  }

  try {
    const result = await pgConnection.transaction(async (trx) => {
      const updates: Record<string, unknown> = {}
      const auditAction = action
      let auditDetails: Record<string, unknown> = { bulk: true, count: ids.length }

      if (action === "tag_add") {
        const tag = String(value || "").trim()
        if (!tag) throw new Error("tag value required")
        await trx.raw(
          `UPDATE crm_master_contact
           SET tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tags, '{}'::text[]) || ARRAY[?]::text[])),
               updated_at = NOW()
           WHERE id = ANY(?) AND deleted_at IS NULL`,
          [tag, ids]
        )
        auditDetails.tag = tag
      } else if (action === "tag_remove") {
        const tag = String(value || "").trim()
        if (!tag) throw new Error("tag value required")
        await trx.raw(
          `UPDATE crm_master_contact
           SET tags = array_remove(COALESCE(tags, '{}'::text[]), ?),
               updated_at = NOW()
           WHERE id = ANY(?) AND deleted_at IS NULL`,
          [tag, ids]
        )
        auditDetails.tag = tag
      } else if (action === "tier_set") {
        const t = value === null || value === "" ? null : String(value)
        if (t !== null && !ALLOWED_TIERS.has(t)) throw new Error("invalid tier")
        updates.tier = t
        updates.tier_calculated_at = trx.fn.now()
        auditDetails.tier = t
      } else if (action === "lifecycle_set") {
        const v = value === null || value === "" ? null : String(value)
        if (v !== null && !ALLOWED_LIFECYCLE.has(v)) throw new Error("invalid lifecycle_stage")
        updates.lifecycle_stage = v
        updates.lifecycle_changed_at = trx.fn.now()
        auditDetails.lifecycle_stage = v
      } else if (action === "is_test_set") {
        if (typeof value !== "boolean") throw new Error("boolean value required")
        updates.is_test = value
        auditDetails.is_test = value
      } else if (action === "block") {
        const reason = value && typeof value === "object" && "reason" in (value as Record<string, unknown>)
          ? String((value as Record<string, unknown>).reason || "")
          : ""
        updates.is_blocked = true
        updates.blocked_reason = reason || null
        auditDetails.reason = reason || null
      } else if (action === "unblock") {
        updates.is_blocked = false
        updates.blocked_reason = null
      } else {
        throw new Error(`Unknown action: ${action}`)
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = trx.fn.now()
        await trx("crm_master_contact")
          .whereIn("id", ids)
          .whereNull("deleted_at")
          .update(updates)
      }

      // Audit-Log: 1 Eintrag pro Master mit bulk-marker
      const auditEntries = ids.map((id) => ({
        master_id: id,
        action: auditAction,
        details: auditDetails,
        source: "admin_ui",
        admin_email: ADMIN,
      }))
      // Insert in chunks of 1000 to avoid query-size-issues
      for (let i = 0; i < auditEntries.length; i += 1000) {
        await trx("crm_master_audit_log").insert(auditEntries.slice(i, i + 1000))
      }

      return { affected: ids.length }
    })

    res.json(result)
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    res.status(400).json({ ok: false, error: m })
  }
}
