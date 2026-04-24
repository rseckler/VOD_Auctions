import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { logEdit, looseEqual } from "../../../../lib/release-audit"
import { validateReleaseStammdaten } from "../../../../lib/release-validation"
import { pushReleaseNow } from "../../../../lib/meilisearch-push"
import { SYNC_PROTECTED_FIELDS } from "../../../../lib/release-locks"

// Zone-1 Hard-Stammdaten fields allowed in bulk edits
const HARD_STAMMDATEN_BULK = ["title", "year", "country", "catalogNumber", "description"] as const

// POST /admin/media/bulk — Bulk update releases (rc51.0: all releases, including legacy)
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { ids, updates } = req.body as {
    ids: string[]
    updates: Record<string, any>
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ message: "ids must be a non-empty array" })
    return
  }

  if (!updates || typeof updates !== "object" || Object.keys(updates).length === 0) {
    res.status(400).json({ message: "updates must be a non-empty object" })
    return
  }

  const allowedFields = [
    // Zone-3 / Zone-2 (always apply to all releases)
    "estimated_value",
    "media_condition",
    "sleeve_condition",
    "auction_status",
    // Zone-1 Hard-Stammdaten (all releases — auto-locks on edit, rc51.0)
    "title",
    "year",
    "country",
    "catalogNumber",
    "description",
  ]

  const sanitized: Record<string, any> = {}
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      sanitized[field] = updates[field]
    }
  }

  if (Object.keys(sanitized).length === 0) {
    res.status(400).json({
      message: `No valid fields to update. Allowed: ${allowedFields.join(", ")}`,
    })
    return
  }

  // Validate non-stammdaten fields
  const validConditions = ["Mint (M)", "Near Mint (NM or M-)", "Very Good Plus (VG+)", "Very Good (VG)", "Good Plus (G+)", "Good (G)", "Fair (F)", "Poor (P)"]
  if (sanitized.media_condition && !validConditions.includes(sanitized.media_condition)) {
    res.status(400).json({ message: `Invalid media_condition. Must be one of: ${validConditions.join(", ")}` })
    return
  }
  if (sanitized.sleeve_condition && !validConditions.includes(sanitized.sleeve_condition)) {
    res.status(400).json({ message: `Invalid sleeve_condition. Must be one of: ${validConditions.join(", ")}` })
    return
  }

  const validStatuses = ["available", "reserved", "in_auction", "sold", "unsold"]
  if (sanitized.auction_status && !validStatuses.includes(sanitized.auction_status)) {
    res.status(400).json({ message: `Invalid auction_status. Must be one of: ${validStatuses.join(", ")}` })
    return
  }

  if (sanitized.estimated_value !== undefined) {
    const val = Number(sanitized.estimated_value)
    if (isNaN(val) || val < 0) {
      res.status(400).json({ message: "estimated_value must be a non-negative number" })
      return
    }
    sanitized.estimated_value = val
  }

  // Validate stammdaten fields if present (shared FE+BE validation)
  const hardFieldsInUpdate = HARD_STAMMDATEN_BULK.filter(f => sanitized[f] !== undefined)
  if (hardFieldsInUpdate.length > 0) {
    const errors = validateReleaseStammdaten({
      title: sanitized.title,
      year: sanitized.year,
      country: sanitized.country,
      catalogNumber: sanitized.catalogNumber,
      description: sanitized.description,
    })
    if (Object.keys(errors).length > 0) {
      res.status(400).json({
        error: "validation_failed",
        message: Object.values(errors)[0],
        errors,
      })
      return
    }
  }

  sanitized.updatedAt = new Date()

  const actorId: string = (req as any).auth_context?.actor_id || "admin"
  const actorEmail: string | null = (req as any).auth_context?.actor_email || null

  let updatedCount = 0

  await pgConnection.transaction(async (trx) => {
    // Fetch current values for audit logging (only needed for stammdaten fields)
    const oldValues: Record<string, Record<string, unknown>> = {}
    if (hardFieldsInUpdate.length > 0) {
      const currentRows = await trx("Release")
        .select(["id", ...hardFieldsInUpdate])
        .whereIn("id", ids)
      for (const row of currentRows) {
        oldValues[row.id] = row
      }
    }

    updatedCount = await trx("Release")
      .whereIn("id", ids)
      .update(sanitized)

    // Auto-lock: rc51.1 R2 — nur Release-IDs lock'en wo der Field-Wert
    // sich tatsächlich ändert. Vorher haben wir blindly alle Hard-Fields
    // auf alle IDs gelockt, auch wenn der neue Wert === alter Wert war.
    // Dedupe pro Field: IDs sammeln wo das Field changed, dann batched UPDATE.
    if (hardFieldsInUpdate.length > 0) {
      const lockableFields = hardFieldsInUpdate.filter(f =>
        (SYNC_PROTECTED_FIELDS as readonly string[]).includes(f)
      )
      for (const field of lockableFields) {
        const changedIds = ids.filter((releaseId) => {
          const old = oldValues[releaseId]
          if (!old) return false
          return !looseEqual(old[field], sanitized[field])
        })
        if (changedIds.length > 0) {
          await trx("Release")
            .whereIn("id", changedIds)
            .update({
              locked_fields: trx.raw(
                `(SELECT jsonb_agg(DISTINCT v ORDER BY v) FROM jsonb_array_elements_text(locked_fields || ?::jsonb) AS t(v))`,
                [JSON.stringify([field])]
              ),
            })
        }
      }
    }

    // Audit log: one row per release × per changed stammdaten field
    if (hardFieldsInUpdate.length > 0) {
      const auditRows: Record<string, unknown>[] = []
      const now = new Date()

      for (const releaseId of ids) {
        const old = oldValues[releaseId]
        if (!old) continue

        for (const field of hardFieldsInUpdate) {
          const oldValue = old[field]
          const newValue = sanitized[field]
          auditRows.push({
            id: generateEntityId(),
            release_id: releaseId,
            field_name: field,
            old_value: oldValue === undefined ? null : JSON.stringify(oldValue),
            new_value: newValue === undefined ? null : JSON.stringify(newValue),
            action: "edit",
            actor_id: actorId,
            actor_email: actorEmail,
            created_at: now,
          })
        }
      }

      if (auditRows.length > 0) {
        await trx("release_audit_log").insert(auditRows)
      }
    }
  })

  res.json({ updated_count: updatedCount, skipped_count: 0 })

  // Fire-and-forget Meili reindex for all updated releases
  for (const releaseId of ids) {
    pushReleaseNow(pgConnection, releaseId).catch((err) => {
      console.warn(
        JSON.stringify({
          event: "meili_push_now_failed",
          handler: "admin_media_bulk",
          release_id: releaseId,
          error: err?.message,
        })
      )
    })
  }
}
