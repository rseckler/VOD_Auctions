import { useState } from "react"
import { C, T, S, fmtDate } from "../admin-tokens"
import { Btn, Modal } from "../admin-ui"

type AuditEntry = {
  id: string
  field_name: string
  old_value: string | null
  new_value: string | null
  action: string
  actor_id: string
  actor_email: string | null
  created_at: string
}

/**
 * Values returned by the backend 409 CONFLICT response.
 * - `current_value`: raw DB value (already a proper JS value after JSON parse)
 * - `expected_value` / `target_value`: JSON-encoded strings from audit table
 *   (double-encoded — they were stored via JSON.stringify in logEdit)
 */
type ConflictData = {
  field: string
  current_value: unknown
  expected_value: unknown
  target_value: unknown
}

type ModalView = "confirm" | "conflict" | "locked" | "gone"

type Props = {
  releaseId: string
  entry: AuditEntry
  onClose: () => void
  onReverted: () => void
}

/**
 * Try to unwrap a value that may have been double-JSON-encoded.
 * Audit rows store values via `JSON.stringify()`, so reading them back gives
 * a string we still need to parse once more. current_value from the DB comes
 * through raw and doesn't need this.
 */
function unwrapAuditValue(v: unknown): unknown {
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

function displayValue(v: unknown): string {
  if (v == null) return "—"
  if (v === "") return "(empty)"
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

function FieldRow({
  label,
  value,
  color,
  highlight,
}: {
  label: string
  value: string
  color?: string
  highlight?: boolean
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "160px 1fr",
        gap: S.gap.md,
        padding: "8px 12px",
        background: highlight ? C.warning + "15" : "transparent",
        borderRadius: S.radius.sm,
        alignItems: "baseline",
      }}
    >
      <span style={{ ...T.small, color: C.muted, fontWeight: 600 }}>{label}</span>
      <span
        style={{
          ...T.small,
          color: color || C.text,
          fontWeight: highlight ? 600 : 400,
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
    </div>
  )
}

export function RevertConfirmModal({ releaseId, entry, onClose, onReverted }: Props) {
  const [view, setView] = useState<ModalView>("confirm")
  const [loading, setLoading] = useState(false)
  const [conflict, setConflict] = useState<ConflictData | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const auditOldValue = unwrapAuditValue(entry.old_value)
  const auditNewValue = unwrapAuditValue(entry.new_value)

  const doRevert = async (force: boolean) => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const res = await fetch(
        `/admin/media/${releaseId}/audit-log/${entry.id}/revert`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        }
      )

      if (res.ok) {
        onReverted()
        onClose()
        return
      }

      const body = await res.json().catch(() => ({}))

      if (res.status === 409) {
        setConflict({
          field: body.field || entry.field_name,
          current_value: body.current_value,
          expected_value: unwrapAuditValue(body.expected_value),
          target_value: unwrapAuditValue(body.target_value),
        })
        setView("conflict")
        return
      }

      if (res.status === 403) {
        setErrorMessage(
          body.reason === "release_now_legacy"
            ? "This release is now sourced from the legacy Tape-Mag database. Hard-stammdaten fields cannot be reverted — the next sync would overwrite the revert anyway."
            : body.message || "Revert is not allowed for this release."
        )
        setView("locked")
        return
      }

      if (res.status === 410) {
        setErrorMessage("This edit has already been reverted.")
        setView("gone")
        return
      }

      if (res.status === 400) {
        setErrorMessage(
          body.message || "This action type cannot be reverted (only field edits are supported)."
        )
        setView("locked")
        return
      }

      setErrorMessage(body.message || `Revert failed (HTTP ${res.status})`)
      setView("locked")
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Network error")
      setView("locked")
    } finally {
      setLoading(false)
    }
  }

  if (view === "confirm") {
    return (
      <Modal title="Confirm Revert" onClose={onClose}>
        <div style={{ ...T.small, color: C.muted, marginBottom: S.gap.lg }}>
          This will restore the previous value of <strong style={{ color: C.text }}>{entry.field_name}</strong>.
          A new audit entry will be created, and the Meilisearch index will be updated.
        </div>

        <div style={{ background: C.subtle, borderRadius: S.radius.sm, padding: 6, marginBottom: S.gap.lg }}>
          <FieldRow label="Field" value={entry.field_name} color={C.text} />
          <FieldRow
            label="Set by this edit"
            value={displayValue(auditNewValue)}
            color={C.error}
          />
          <FieldRow
            label="Will restore to"
            value={displayValue(auditOldValue)}
            color={C.success}
            highlight
          />
        </div>

        <div style={{ ...T.micro, color: C.muted, marginBottom: S.gap.lg, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          Original edit: {fmtDate(entry.created_at)} by {entry.actor_email || entry.actor_id}.
          If the field changed since this edit, you'll be prompted to confirm the override.
        </div>

        <div style={{ display: "flex", gap: S.gap.sm, justifyContent: "flex-end" }}>
          <Btn
            label="Cancel"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
            style={{ padding: "7px 16px", fontSize: 13 }}
          />
          <Btn
            label={loading ? "Reverting…" : "Confirm Revert"}
            variant="danger"
            onClick={() => doRevert(false)}
            disabled={loading}
            style={{ padding: "7px 20px", fontSize: 13 }}
          />
        </div>
      </Modal>
    )
  }

  if (view === "conflict" && conflict) {
    return (
      <Modal title="Conflict Detected" onClose={onClose}>
        <div style={{
          ...T.small,
          color: C.warning,
          background: C.warning + "15",
          border: `1px solid ${C.warning}40`,
          borderRadius: S.radius.sm,
          padding: "10px 14px",
          marginBottom: S.gap.lg,
        }}>
          ⚠ The <strong>{conflict.field}</strong> field has changed since this edit was made.
          Reverting now would overwrite the newer value.
        </div>

        <div style={{ background: C.subtle, borderRadius: S.radius.sm, padding: 6, marginBottom: S.gap.lg }}>
          <FieldRow
            label="Value when edited"
            value={displayValue(conflict.expected_value)}
            color={C.muted}
          />
          <FieldRow
            label="Current value"
            value={displayValue(conflict.current_value)}
            color={C.warning}
            highlight
          />
          <FieldRow
            label="Would revert to"
            value={displayValue(conflict.target_value)}
            color={C.blue}
          />
        </div>

        <div style={{ ...T.micro, color: C.muted, marginBottom: S.gap.lg, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          Force-revert will discard the current value and restore the previous one.
          This action is also logged in the audit trail.
        </div>

        <div style={{ display: "flex", gap: S.gap.sm, justifyContent: "flex-end" }}>
          <Btn
            label="Cancel"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
            style={{ padding: "7px 16px", fontSize: 13 }}
          />
          <Btn
            label={loading ? "Forcing revert…" : "Force Revert"}
            variant="danger"
            onClick={() => doRevert(true)}
            disabled={loading}
            style={{ padding: "7px 20px", fontSize: 13 }}
          />
        </div>
      </Modal>
    )
  }

  // locked / gone / other error — terminal state, only close available
  return (
    <Modal title={view === "gone" ? "Already Reverted" : "Revert Not Possible"} onClose={onClose}>
      <div
        style={{
          ...T.small,
          color: C.text,
          background: C.error + "10",
          border: `1px solid ${C.error}30`,
          borderRadius: S.radius.sm,
          padding: "12px 14px",
          marginBottom: S.gap.lg,
        }}
      >
        {errorMessage}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn
          label="Close"
          variant="ghost"
          onClick={onClose}
          style={{ padding: "7px 16px", fontSize: 13 }}
        />
      </div>
    </Modal>
  )
}
