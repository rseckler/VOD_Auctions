/**
 * Release data source helpers
 * Determines editability of stammdaten based on Release.data_source
 */

export const EDITABLE_STAMMDATEN_SOURCES = ['discogs_import'] as const;

export function isStammdatenEditable(release: {
  id: string;
  data_source: string | null;
}): boolean {
  // Zone 0: System-IDs are never editable
  if (release.id.startsWith('legacy-')) {
    return false;
  }

  // Discogs-Import is editable
  if (EDITABLE_STAMMDATEN_SOURCES.includes(release.data_source as any)) {
    return true;
  }

  return false;
}

export function getLockedReason(release: {
  id: string;
  data_source: string | null;
}): string | null {
  if (!isStammdatenEditable(release)) {
    if (release.id.startsWith('legacy-')) {
      return 'Synced from tape-mag legacy database (hourly updates). Changes would be overwritten at next sync.';
    }
    return 'Stammdaten are locked for this release.';
  }

  return null;
}
