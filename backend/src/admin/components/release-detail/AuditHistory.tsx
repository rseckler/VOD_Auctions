import { useEffect, useState } from "react"
import { C, T, S, fmtDate, BADGE_VARIANTS } from "../admin-tokens"
import { Btn } from "../admin-ui"
import { RevertConfirmModal } from "./RevertConfirmModal"

type AuditAction = "edit" | "revert" | "track_add" | "track_edit" | "track_delete" | "image_add" | "image_delete" | "field_unlocked"

type AuditEntry = {
  id: string
  field_name: string
  old_value: string | null
  new_value: string | null
  action: AuditAction
  actor_id: string
  actor_email: string | null
  created_at: string
  reverted_at: string | null
  reverted_by: string | null
  parent_audit_id: string | null
}

function parseVal(raw: string | null): string {
  if (raw == null) return "—"
  try {
    const v = JSON.parse(raw)
    if (v == null) return "—"
    if (v === "") return "(empty)"
    if (typeof v === "object") return JSON.stringify(v)
    return String(v)
  } catch {
    return raw
  }
}

function trackLabel(raw: string | null): string {
  try {
    const v = JSON.parse(raw ?? "null")
    if (!v) return "—"
    const t = v.after ?? v
    const pos = t.position ? `${t.position} — ` : ""
    return `${pos}${t.title ?? "?"}`
  } catch {
    return "—"
  }
}

const ACTION_STYLE: Record<AuditAction, typeof BADGE_VARIANTS[keyof typeof BADGE_VARIANTS]> = {
  edit: BADGE_VARIANTS.info,
  revert: BADGE_VARIANTS.warning,
  track_add: BADGE_VARIANTS.success,
  track_edit: BADGE_VARIANTS.info,
  track_delete: BADGE_VARIANTS.error,
  image_add: BADGE_VARIANTS.success,
  image_delete: BADGE_VARIANTS.error,
  field_unlocked: BADGE_VARIANTS.neutral,
}

const ACTION_LABEL: Record<AuditAction, string> = {
  edit: "Edit",
  revert: "Revert",
  track_add: "Track +",
  track_edit: "Track Edit",
  track_delete: "Track ×",
  image_add: "Image +",
  image_delete: "Image ×",
  field_unlocked: "Unlocked",
}

type Props = {
  releaseId: string
  /** Bump this key to force a refresh (e.g. after a revert or stammdaten save). */
  refreshKey?: number
}

export function AuditHistory({ releaseId, refreshKey }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [revertModalEntry, setRevertModalEntry] = useState<AuditEntry | null>(null)
  const [internalRefresh, setInternalRefresh] = useState(0)

  const load = async (append = false) => {
    setLoading(true)
    const offset = append ? entries.length : 0
    try {
      const res = await fetch(
        `/admin/media/${releaseId}/audit-log?limit=50&offset=${offset}`,
        { credentials: "include" }
      )
      const d = await res.json()
      const incoming: AuditEntry[] = d.entries || []
      setEntries(prev => append ? [...prev, ...incoming] : incoming)
      setTotal(d.total || 0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [releaseId, refreshKey, internalRefresh])

  if (loading && entries.length === 0) {
    return <div style={{ ...T.small, color: C.muted, padding: `${S.gap.lg}px 0` }}>Loading history…</div>
  }

  if (!loading && entries.length === 0) {
    return <div style={{ ...T.small, color: C.muted, padding: `${S.gap.lg}px 0` }}>No edit history yet.</div>
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {entries.map((entry) => {
          const isReverted = !!entry.reverted_at
          const canRevert = !isReverted && entry.action === "edit" && !entry.parent_audit_id

          return (
            <div
              key={entry.id}
              style={{
                padding: "10px 14px",
                borderRadius: S.radius.sm,
                background: isReverted ? "transparent" : C.card,
                border: `1px solid ${C.border}`,
                opacity: isReverted ? 0.5 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: S.gap.sm, flexWrap: "wrap" }}>
                <span style={ACTION_STYLE[entry.action] || BADGE_VARIANTS.neutral}>
                  {ACTION_LABEL[entry.action] || entry.action}
                </span>
                <span style={{ ...T.small, color: C.muted, fontSize: 11 }}>
                  {fmtDate(entry.created_at)} · {entry.actor_email || entry.actor_id}
                </span>
                {isReverted && (
                  <span style={{ ...BADGE_VARIANTS.neutral, fontSize: 10 }}>↶ reverted</span>
                )}
                <span style={{ flex: 1 }} />
                {canRevert && (
                  <Btn
                    label="↩ Revert"
                    variant="ghost"
                    onClick={() => setRevertModalEntry(entry)}
                    style={{ padding: "3px 10px", fontSize: 11 }}
                  />
                )}
              </div>

              <div style={{ marginTop: 6 }}>
                {(entry.action === "edit" || entry.action === "revert") && (
                  <div style={{ ...T.small, color: C.text, display: "flex", gap: S.gap.sm, flexWrap: "wrap" }}>
                    <span style={{ color: C.muted }}>{entry.field_name}:</span>
                    <span style={{ color: C.error, textDecoration: isReverted ? "none" : "line-through" }}>
                      {parseVal(entry.old_value)}
                    </span>
                    <span style={{ color: C.muted }}>→</span>
                    <span style={{ color: isReverted ? C.muted : C.success }}>
                      {parseVal(entry.new_value)}
                    </span>
                  </div>
                )}
                {(entry.action === "track_add" || entry.action === "track_edit" || entry.action === "track_delete") && (
                  <div style={{ ...T.small, color: C.text }}>
                    {entry.action === "track_edit"
                      ? `${trackLabel(entry.old_value)} → ${trackLabel(entry.new_value)}`
                      : trackLabel(entry.action === "track_add" ? entry.new_value : entry.old_value)
                    }
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {entries.length < total && (
        <Btn
          label={loading ? "Loading…" : `Load more (${total - entries.length} remaining)`}
          variant="ghost"
          onClick={() => load(true)}
          disabled={loading}
          style={{ marginTop: S.gap.md, fontSize: 12 }}
        />
      )}

      {revertModalEntry && (
        <RevertConfirmModal
          releaseId={releaseId}
          entry={revertModalEntry}
          onClose={() => setRevertModalEntry(null)}
          onReverted={() => setInternalRefresh(k => k + 1)}
        />
      )}
    </div>
  )
}
