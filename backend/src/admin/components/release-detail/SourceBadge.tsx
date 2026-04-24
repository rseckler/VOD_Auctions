import { C, T, S } from "../admin-tokens"

type SourceBadgeProps = {
  source: "legacy" | "discogs_import" | "manual_admin" | string
  syncedAt?: string | null
}

// Note: hex literals (not C.muted) — opacity-suffix concat ("color + '15'")
// requires hex; CSS-var tokens like var(--vod-muted) silently break.
const MUTED_HEX = "#78716c"

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  legacy: { label: "Legacy (Tape-Mag)", color: MUTED_HEX },
  discogs_import: { label: "Discogs Import", color: C.gold },
  manual_admin: { label: "Manual Edit", color: C.blue },
}

export function SourceBadge({ source, syncedAt }: SourceBadgeProps) {
  const config = SOURCE_LABELS[source] || { label: source, color: MUTED_HEX }
  const syncDate = syncedAt ? new Date(syncedAt).toLocaleDateString("de-DE") : null

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
      title={syncDate ? `Synced: ${syncDate}` : "Data source"}
    >
      <span style={{ ...T.small, fontSize: 12, color: config.color, fontWeight: 600 }}>
        {config.label}
      </span>
    </div>
  )
}
