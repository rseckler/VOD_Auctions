/**
 * Release data source helpers.
 * rc51.0: All releases are Zone-1 editable — lock is per-field via locked_fields JSONB.
 */

export const EDITABLE_STAMMDATEN_SOURCES = ['discogs_import', 'legacy', 'manual_admin'] as const;

export function isStammdatenEditable(_release: {
  id: string;
  data_source?: string | null;
}): boolean {
  // rc51.0: All releases are editable. Hard-Stammdaten edits auto-lock the field
  // against sync overwrite via Release.locked_fields. Zone-0 (id/article_number/
  // data_source) are protected by the API allowlist, not this function.
  return true;
}

export function getLockedReason(_release: {
  id: string;
  data_source?: string | null;
}): string | null {
  // rc51.0: No release-level lock reason — lock is per-field in locked_fields array.
  return null;
}
