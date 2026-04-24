import { C, T, S } from "../admin-tokens"

type SourceBadgeProps = {
  source: "legacy" | "discogs_import" | "manual_admin" | string
  syncedAt?: string | null
  lockedFields?: string[]
}

// Note: hex literals (not C.muted) — opacity-suffix concat ("color + '15'")
// requires hex; CSS-var tokens like var(--vod-muted) silently break.
const MUTED_HEX = "#78716c"

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  legacy: { label: "Legacy (Tape-Mag)", color: MUTED_HEX },
  discogs_import: { label: "Discogs Import", color: C.gold },
  manual_admin: { label: "Manual Edit", color: C.blue },
}

export function SourceBadge({ source, syncedAt, lockedFields }: SourceBadgeProps) {
  const config = SOURCE_LABELS[source] || { label: source, color: MUTED_HEX }
  const syncDate = syncedAt ? new Date(syncedAt).toLocaleDateString("de-DE") : null
  const lockCount = lockedFields?.length ?? 0

  const tooltip = [
    syncDate ? `Synced: ${syncDate}` : "Data source",
    lockCount > 0 ? `Locked fields: ${lockedFields!.join(", ")}` : null,
  ].filter(Boolean).join(" · ")

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: S.radius.sm,
        backgroundColor: config.color + "15",
        border: `1px solid ${config.color}40`,
      }}
      title={tooltip}
    >
      <span style={{ ...T.small, fontSize: 12, color: config.color, fontWeight: 600 }}>
        {config.label}
      </span>
      {lockCount > 0 && (
        <span style={{ ...T.small, fontSize: 11, color: config.color, opacity: 0.85 }}>
          · {lockCount} field{lockCount > 1 ? "s" : ""} locked from sync
        </span>
      )}
    </div>
  )
}
