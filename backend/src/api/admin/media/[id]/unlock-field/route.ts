import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { unlockField, isFieldLocked, SYNC_PROTECTED_FIELDS } from "../../../../../lib/release-locks"
import { pushReleaseNow } from "../../../../../lib/meilisearch-push"

// POST /admin/media/:id/unlock-field
// Removes a field from Release.locked_fields, re-enabling legacy_sync_v2 overwrite.
//
// rc51.1 R3: TOCTOU-Fix — die `isFieldLocked`-Prüfung passiert jetzt INNERHALB
// der Transaction mit `FOR UPDATE`-Lock auf der Release-Row. Verhindert dass
// zwei konkurrente Unlock-Requests beide einen `field_unlocked`-Audit-Entry
// schreiben wenn der erste die Spalte schon weggenommen hat.
type UnlockError =
  | { type: "not_found" }
  | { type: "field_not_locked" }

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params
  const { field } = (req.body || {}) as { field?: string }

  if (!field || typeof field !== "string") {
    res.status(400).json({ error: "field_required", message: "Body must contain { field: string }" })
    return
  }

  if (!(SYNC_PROTECTED_FIELDS as readonly string[]).includes(field)) {
    res.status(400).json({
      error: "field_not_lockable",
      message: `Field '${field}' is not a sync-protected field. Lockable fields: ${SYNC_PROTECTED_FIELDS.join(", ")}`,
    })
    return
  }

  const actorId: string = (req as any).auth_context?.actor_id || "admin"
  const actorEmail: string | null = (req as any).auth_context?.actor_email || null

  let result: { remainingLockedFields: string[] } | UnlockError
  try {
    result = await pg.transaction(async (trx) => {
      // FOR UPDATE serialisiert konkurrente Unlock-Requests auf derselben Row.
      const release = await trx("Release")
        .where("id", id)
        .select("id", "locked_fields")
        .forUpdate()
        .first()

      if (!release) {
        return { type: "not_found" as const }
      }

      if (!isFieldLocked(release, field)) {
        return { type: "field_not_locked" as const }
      }

      const remaining = await unlockField(trx, id, field)

      await trx("release_audit_log").insert({
        id: generateEntityId(),
        release_id: id,
        field_name: field,
        old_value: null,
        new_value: null,
        action: "field_unlocked",
        actor_id: actorId,
        actor_email: actorEmail,
        created_at: new Date(),
      })

      return { remainingLockedFields: remaining }
    })
  } catch (err: any) {
    console.error("unlock-field transaction failed", err)
    res.status(500).json({ error: "internal_error", message: err?.message || "Unlock failed" })
    return
  }

  if ("type" in result) {
    if (result.type === "not_found") {
      res.status(404).json({ message: "Release not found" })
      return
    }
    if (result.type === "field_not_locked") {
      res.status(400).json({
        error: "field_not_locked",
        message: `Field '${field}' is not currently locked on this release`,
      })
      return
    }
  }

  res.json({
    release_id: id,
    field,
    locked_fields_remaining: (result as { remainingLockedFields: string[] }).remainingLockedFields,
  })

  pushReleaseNow(pg, id).catch((err) => {
    console.warn(
      JSON.stringify({
        event: "meili_push_now_failed",
        handler: "admin_media_unlock_field",
        release_id: id,
        error: err?.message,
      })
    )
  })
}
