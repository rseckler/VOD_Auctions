import type { Knex } from "knex"
import { generateEntityId } from "@medusajs/framework/utils"
import { isStammdatenEditable } from "./release-source"
import { SYNC_PROTECTED_FIELDS } from "./release-locks"

// Zone 1 — Hard-Stammdaten. rc51.1: Re-export aus release-locks.ts um Drift zu
// verhindern. Diese Liste wird vom Audit-Log und vom Revert-Hard-Field-Check
// genutzt; release-locks.SYNC_PROTECTED_FIELDS wird vom Auto-Lock + Sync-UPSERT
// genutzt. Früher waren's zwei Listen die sich um format/barcode unterschieden.
export const HARD_STAMMDATEN_FIELDS = SYNC_PROTECTED_FIELDS

// Zone 0 — System-IDs: never editable, stripped before any write
export const SYSTEM_ID_FIELDS = [
  "id",
  "article_number",
  "data_source",
] as const

export type AuditActor = {
  id: string
  email?: string | null
}

export type AuditAction =
  | "edit"
  | "revert"
  | "track_add"
  | "track_edit"
  | "track_delete"
  | "image_add"
  | "image_delete"
  | "field_unlocked"

export type AuditEntry = {
  id: string
  release_id: string
  field_name: string
  old_value: unknown
  new_value: unknown
  action: AuditAction
  actor_id: string
  actor_email: string | null
  created_at: string
  reverted_at: string | null
  reverted_by: string | null
  parent_audit_id: string | null
}

/**
 * Log one or more field-level edits for a release.
 * Call inside a Knex transaction together with the Release UPDATE.
 */
export async function logEdit(
  trx: Knex | Knex.Transaction,
  params: {
    releaseId: string
    fields: Record<string, { oldValue: unknown; newValue: unknown }>
    actor: AuditActor
  }
): Promise<void> {
  const { releaseId, fields, actor } = params
  const now = new Date()

  const rows = Object.entries(fields).map(([field, { oldValue, newValue }]) => ({
    id: generateEntityId(),
    release_id: releaseId,
    field_name: field,
    old_value: oldValue === undefined ? null : JSON.stringify(oldValue),
    new_value: newValue === undefined ? null : JSON.stringify(newValue),
    action: "edit" as AuditAction,
    actor_id: actor.id,
    actor_email: actor.email ?? null,
    created_at: now,
  }))

  if (rows.length > 0) {
    await trx("release_audit_log").insert(rows)
  }
}

/**
 * Log a track-level change (add / edit / delete) for a release.
 */
export async function logTrackChange(
  trx: Knex | Knex.Transaction,
  params: {
    releaseId: string
    action: "track_add" | "track_edit" | "track_delete"
    trackPayload: unknown
    actor: AuditActor
  }
): Promise<void> {
  const { releaseId, action, trackPayload, actor } = params

  await trx("release_audit_log").insert({
    id: generateEntityId(),
    release_id: releaseId,
    field_name: "track",
    old_value: action === "track_add" ? null : JSON.stringify(trackPayload),
    new_value: action === "track_delete" ? null : JSON.stringify(trackPayload),
    action,
    actor_id: actor.id,
    actor_email: actor.email ?? null,
    created_at: new Date(),
  })
}

/**
 * List audit entries for a release, newest first.
 */
export async function listForRelease(
  pg: Knex,
  releaseId: string,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<{ entries: AuditEntry[]; total: number }> {
  const [entries, countResult] = await Promise.all([
    pg("release_audit_log")
      .where("release_id", releaseId)
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .select("*"),
    pg("release_audit_log")
      .where("release_id", releaseId)
      .count("id as total")
      .first(),
  ])

  return {
    entries,
    total: Number(countResult?.total ?? 0),
  }
}

/**
 * Custom error class for revert failures.
 * Routes catch this and map `code` → HTTP status.
 */
export class RevertError extends Error {
  constructor(
    public code: "CONFLICT" | "LOCKED" | "NOT_FOUND" | "GONE" | "NOT_SUPPORTED",
    public status: number,
    public details: Record<string, unknown> = {}
  ) {
    super(`Revert error: ${code}`)
    this.name = "RevertError"
  }
}

/**
 * Loose equality for conflict-detection.
 *
 * Handles common storage-roundtrip mismatches:
 *  - Knex DECIMAL → "30.00" string vs JSONB-stored 30 number
 *  - null vs undefined
 *  - Deep equality for objects/arrays via JSON canonicalization
 *
 * Does NOT handle date-string vs Date object — Release stammdaten don't have
 * date fields editable through the audit-log path, so this is acceptable.
 */
export function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false

  // Number-string equivalence (handles DECIMAL roundtrip)
  const aNum = typeof a === "string" ? Number(a) : a
  const bNum = typeof b === "string" ? Number(b) : b
  if (
    typeof aNum === "number" &&
    typeof bNum === "number" &&
    Number.isFinite(aNum) &&
    Number.isFinite(bNum)
  ) {
    return aNum === bNum
  }

  // Deep equality for objects/arrays via JSON
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/**
 * Revert a previous edit. Atomically:
 *   1. Validates audit entry exists, not already reverted, action='edit'
 *   2. Conflict-check: current Release[field] must equal audit.new_value (unless force=true)
 *   3. Lock-check: if Release is now legacy AND field is hard-stammdaten, refuse
 *   4. Writes Release[field] = audit.old_value
 *   5. Inserts new audit row with action='revert', parent_audit_id=auditId
 *   6. Updates original audit row with reverted_at, reverted_by
 *
 * Caller is responsible for:
 *   - Calling pushReleaseNow(pg, releaseId) AFTER this function returns successfully
 *   - HTTP error mapping via err.status (RevertError has structured fields)
 *
 * @returns The id of the new revert audit row + the field/value that was restored
 * @throws RevertError on any validation or conflict failure
 */
export async function revertEntry(
  pg: Knex,
  params: {
    auditId: string
    actor: AuditActor
    force?: boolean
  }
): Promise<{
  revert_audit_id: string
  release_id: string
  field: string
  restored_value: unknown
}> {
  const { auditId, actor, force = false } = params

  return pg.transaction(async (trx) => {
    // 1. Load original audit entry (lock for update to prevent concurrent revert)
    const original = await trx("release_audit_log")
      .where("id", auditId)
      .forUpdate()
      .first<AuditEntry>()

    if (!original) {
      throw new RevertError("NOT_FOUND", 404, { audit_id: auditId })
    }

    // Only field-level edits / reverts are revertable in Phase 1.5
    // Track / image actions need a separate code path (touch other tables)
    if (original.action !== "edit" && original.action !== "revert") {
      throw new RevertError("NOT_SUPPORTED", 400, {
        audit_id: auditId,
        action: original.action,
        message: "Track and image actions cannot be reverted yet",
      })
    }

    // Already reverted → no double-revert (UI should hide button, but defense-in-depth)
    if (original.reverted_at != null) {
      throw new RevertError("GONE", 410, {
        audit_id: auditId,
        reverted_at: original.reverted_at,
        reverted_by: original.reverted_by,
      })
    }

    // 2. Load current Release state with FOR UPDATE lock
    //    Prevents lost-update race: a concurrent POST /admin/media/:id could
    //    otherwise land between our conflict-check and our UPDATE, silently
    //    overwriting the concurrent edit. (Codex review 2026-04-24)
    const release = await trx("Release")
      .where("id", original.release_id)
      .select("id", "data_source", original.field_name)
      .forUpdate()
      .first()

    if (!release) {
      throw new RevertError("NOT_FOUND", 404, {
        release_id: original.release_id,
      })
    }

    // 3. Lock-check: hard-fields on now-legacy releases cannot be reverted
    //    (next sync would overwrite anyway → user-confusing)
    const isHardField = HARD_STAMMDATEN_FIELDS.includes(
      original.field_name as (typeof HARD_STAMMDATEN_FIELDS)[number]
    )
    if (isHardField && !isStammdatenEditable(release)) {
      throw new RevertError("LOCKED", 403, {
        audit_id: auditId,
        field: original.field_name,
        reason: "release_now_legacy",
      })
    }

    // 4. Conflict-check: did anything change since the audit was logged?
    const currentValue = release[original.field_name]
    const expectedValue = original.new_value
    if (!force && !looseEqual(currentValue, expectedValue)) {
      throw new RevertError("CONFLICT", 409, {
        audit_id: auditId,
        field: original.field_name,
        current_value: currentValue,
        expected_value: expectedValue,
        target_value: original.old_value,
      })
    }

    // 5. Write Release[field] = old_value (the value we're restoring).
    //    Note: Release uses camelCase updatedAt (legacy convention), not
    //    snake_case updated_at. (Codex review 2026-04-24)
    //
    //    2026-04-26 codex-review: jsonb-array fields need JSON.stringify before
    //    update — node-postgres serializes JS arrays as text[] literals ('{a,b}')
    //    which PG cannot implicit-cast to jsonb. Same pattern as rc51.9.1 in
    //    media/[id]/route.ts. text[] fields (genres, styles) keep JS arrays.
    const JSONB_ARRAY_FIELDS = new Set(["format_descriptors", "locked_fields"])
    const restoreValue =
      JSONB_ARRAY_FIELDS.has(original.field_name) && Array.isArray(original.old_value)
        ? JSON.stringify(original.old_value)
        : original.old_value
    await trx("Release")
      .where("id", original.release_id)
      .update({
        [original.field_name]: restoreValue as any,
        updatedAt: new Date(),
      })

    // 6. Insert revert audit row (must come BEFORE updating original.reverted_by FK)
    const revertId = generateEntityId()
    const now = new Date()

    await trx("release_audit_log").insert({
      id: revertId,
      release_id: original.release_id,
      field_name: original.field_name,
      // For revert: old_value=what was there (=original.new_value), new_value=what we restored (=original.old_value)
      old_value:
        original.new_value === undefined
          ? null
          : JSON.stringify(original.new_value),
      new_value:
        original.old_value === undefined
          ? null
          : JSON.stringify(original.old_value),
      action: "revert" as AuditAction,
      actor_id: actor.id,
      actor_email: actor.email ?? null,
      created_at: now,
      parent_audit_id: auditId,
    })

    // 7. Mark original as reverted
    await trx("release_audit_log").where("id", auditId).update({
      reverted_at: now,
      reverted_by: revertId,
    })

    return {
      revert_audit_id: revertId,
      release_id: original.release_id,
      field: original.field_name,
      restored_value: original.old_value,
    }
  })
}
