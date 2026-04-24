import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { revertEntry, RevertError } from "../../../../../../../lib/release-audit"
import { pushReleaseNow } from "../../../../../../../lib/meilisearch-push"

// POST /admin/media/:id/audit-log/:auditId/revert
//
// Reverts a previous edit. Body:
//   { "force": boolean }   // optional — bypass conflict check (UI override)
//
// Status codes:
//   200  — reverted, returns { revert_audit_id, release_id, field, restored_value }
//   400  — action not supported (track/image revert not yet implemented)
//   403  — release is now legacy + hard-stammdaten field
//   404  — audit entry not found OR audit.release_id != params.id (route mismatch)
//   409  — conflict: current value differs from audit.new_value (use force=true to override)
//   410  — already reverted
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id, auditId } = req.params
  const body = (req.body || {}) as Record<string, any>

  // Defense-in-depth: ensure the audit entry actually belongs to this release
  // (prevents revert via wrong route path which would otherwise still succeed
  // because revertEntry() uses original.release_id from the audit row itself).
  const ownership = await pg("release_audit_log")
    .where("id", auditId)
    .select("release_id")
    .first()

  if (!ownership) {
    res.status(404).json({ error: "not_found", audit_id: auditId })
    return
  }
  if (ownership.release_id !== id) {
    res.status(404).json({
      error: "audit_release_mismatch",
      message: "Audit entry does not belong to this release",
      audit_id: auditId,
      release_id_expected: id,
    })
    return
  }

  const actor = {
    id: (req as any).auth_context?.actor_id || "admin",
    email: (req as any).auth_context?.actor_email || null,
  }
  const force = Boolean(body.force)

  let result: Awaited<ReturnType<typeof revertEntry>>
  try {
    result = await revertEntry(pg, { auditId, actor, force })
  } catch (err) {
    if (err instanceof RevertError) {
      res.status(err.status).json({
        error: err.code.toLowerCase(),
        ...err.details,
      })
      return
    }
    throw err
  }

  // Fire-and-forget Meili reindex (rc48 Klasse-B pattern). NOT in transaction —
  // Meili down should not roll back the revert.
  pushReleaseNow(pg, result.release_id).catch((err) =>
    console.warn(
      JSON.stringify({
        event: "meili_push_now_failed",
        handler: "admin_media_audit_revert",
        release_id: result.release_id,
        error: err?.message,
      })
    )
  )

  res.json(result)
}
