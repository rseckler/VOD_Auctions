import { C, T, S } from "../admin-tokens"

type SourceBadgeProps = {
  source: "legacy" | "discogs_import" | "manual_admin" | string
  syncedAt?: string | null
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  legacy: { label: "Legacy (Tape-Mag)", color: C.muted },
  discogs_import: { label: "Discogs Import", color: C.gold },
  manual_admin: { label: "Manual Edit", color: C.blue },
}

export function SourceBadge({ source, syncedAt }: SourceBadgeProps) {
  const config = SOURCE_LABELS[source] || { label: source, color: C.muted }
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
