import type { Knex } from "knex";

/**
 * Zone-1 Hard-Stammdaten fields that get auto-locked when edited via admin.
 * Sync-script mirrors this list as HARD_STAMMDATEN_FIELDS in legacy_sync_v2.py.
 */
export const SYNC_PROTECTED_FIELDS = [
  "title",
  "year",
  "country",
  "catalogNumber",
  "barcode",
  "description",
  "artistId",
  "labelId",
  "coverImage",
  "format_id",
  "format_v2",
  "legacy_format_detail",
  "legacy_condition",
  "legacy_available",
  "legacy_price",
] as const;

export type SyncProtectedField = (typeof SYNC_PROTECTED_FIELDS)[number];

export function isFieldLocked(
  release: { locked_fields?: string[] | null },
  fieldName: string
): boolean {
  if (!release.locked_fields || !Array.isArray(release.locked_fields)) return false;
  return release.locked_fields.includes(fieldName);
}

/**
 * Idempotent merge of fields into Release.locked_fields.
 * Uses jsonb_agg(DISTINCT) to dedup — safe to call repeatedly with same fields.
 */
export async function lockFields(
  trx: Knex | Knex.Transaction,
  releaseId: string,
  fields: string[]
): Promise<void> {
  if (fields.length === 0) return;
  await trx("Release")
    .where("id", releaseId)
    .update({
      locked_fields: trx.raw(
        `(SELECT jsonb_agg(DISTINCT v ORDER BY v) FROM jsonb_array_elements_text(locked_fields || ?::jsonb) AS t(v))`,
        [JSON.stringify(fields)]
      ),
    });
}

/**
 * Remove a single field from Release.locked_fields.
 * Next legacy_sync_v2 run will overwrite this field.
 */
export async function unlockField(
  pg: Knex | Knex.Transaction,
  releaseId: string,
  field: string
): Promise<string[]> {
  const rows = await pg("Release")
    .where("id", releaseId)
    .update({
      locked_fields: pg.raw(
        `(SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM jsonb_array_elements_text(locked_fields) AS t(v) WHERE v != ?)`,
        [field]
      ),
    })
    .returning("locked_fields");

  // Knex .returning() gives us the updated row
  const remaining = rows[0]?.locked_fields ?? [];
  return Array.isArray(remaining) ? remaining : [];
}

/**
 * Returns the subset of SYNC_PROTECTED_FIELDS that are present in a request body object.
 */
export function getHardFieldsInBody(body: Record<string, unknown>): string[] {
  return SYNC_PROTECTED_FIELDS.filter((f) => body[f] !== undefined);
}
