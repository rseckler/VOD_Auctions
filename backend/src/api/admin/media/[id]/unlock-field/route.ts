import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { unlockField, isFieldLocked, SYNC_PROTECTED_FIELDS } from "../../../../../lib/release-locks"
import { pushReleaseNow } from "../../../../../lib/meilisearch-push"

// POST /admin/media/:id/unlock-field
// Removes a field from Release.locked_fields, re-enabling legacy_sync_v2 overwrite.
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

  const release = await pg("Release").where("id", id).select("id", "locked_fields").first()
  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  if (!isFieldLocked(release, field)) {
    res.status(400).json({
      error: "field_not_locked",
      message: `Field '${field}' is not currently locked on this release`,
    })
    return
  }

  const actorId: string = (req as any).auth_context?.actor_id || "admin"
  const actorEmail: string | null = (req as any).auth_context?.actor_email || null

  const remainingLockedFields = await pg.transaction(async (trx) => {
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

    return remaining
  })

  res.json({
    release_id: id,
    field,
    locked_fields_remaining: remainingLockedFields,
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
