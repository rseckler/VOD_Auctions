import { useState, useEffect } from "react"
import { C, T, S } from "../admin-tokens"
import { Btn, Modal, inputStyle } from "../admin-ui"

type Track = {
  id: string
  position: string | null
  title: string
  duration: string | null
  releaseId: string
}

type TrackModalState =
  | { mode: "add" }
  | { mode: "edit"; track: Track }

function TrackForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Partial<Track>
  onSave: (data: { position: string; title: string; duration: string }) => void
  onCancel: () => void
  saving: boolean
}) {
  const [position, setPosition] = useState(initial?.position ?? "")
  const [title, setTitle] = useState(initial?.title ?? "")
  const [duration, setDuration] = useState(initial?.duration ?? "")
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    if (!title.trim()) {
      setError("Title is required")
      return
    }
    if (duration && !/^\d{1,3}:\d{2}$/.test(duration.trim())) {
      setError("Duration must be MM:SS or H:MM:SS (e.g. 3:45)")
      return
    }
    setError(null)
    onSave({ position: position.trim(), title: title.trim(), duration: duration.trim() })
  }

  return (
    <>
      {error && (
        <div style={{
          ...T.small, color: C.error,
          background: C.error + "15", border: `1px solid ${C.error}40`,
          borderRadius: S.radius.sm, padding: "8px 12px", marginBottom: S.gap.md,
        }}>
          {error}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr 1fr", gap: S.gap.md, marginBottom: S.gap.md }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Side/Pos</div>
          <input
            type="text"
            value={position}
            onChange={(e) => setPosition(e.target.value.toUpperCase())}
            placeholder="A1"
            maxLength={6}
            style={inputStyle}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Title *</div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Track title"
            style={inputStyle}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Duration</div>
          <input
            type="text"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="3:45"
            maxLength={8}
            style={inputStyle}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: S.gap.sm }}>
        <Btn
          label={saving ? "Saving…" : "Save Track"}
          variant="gold"
          onClick={handleSave}
          disabled={saving}
          style={{ padding: "7px 20px", fontSize: 13 }}
        />
        <Btn
          label="Cancel"
          variant="ghost"
          onClick={onCancel}
          disabled={saving}
          style={{ padding: "7px 16px", fontSize: 13 }}
        />
      </div>
    </>
  )
}

type Props = {
  releaseId: string
  /** Bump to force track list refresh. */
  refreshKey?: number
  onTrackChange?: () => void
}

export function TrackManagement({ releaseId, refreshKey, onTrackChange }: Props) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<TrackModalState | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadTracks = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/admin/media/${releaseId}/tracks`, { credentials: "include" })
      const d = await res.json()
      setTracks(d.tracks || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTracks() }, [releaseId, refreshKey])

  const handleAdd = async (data: { position: string; title: string; duration: string }) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/admin/media/${releaseId}/tracks`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        setModal(null)
        await loadTracks()
        onTrackChange?.()
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.message || "Failed to add track")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (trackId: string, data: { position: string; title: string; duration: string }) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/admin/media/${releaseId}/tracks/${trackId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        setModal(null)
        await loadTracks()
        onTrackChange?.()
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.message || "Failed to update track")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (trackId: string) => {
    setDeletingId(trackId)
    setError(null)
    try {
      const res = await fetch(`/admin/media/${releaseId}/tracks/${trackId}`, {
        method: "DELETE", credentials: "include",
      })
      if (res.ok) {
        setConfirmDeleteId(null)
        await loadTracks()
        onTrackChange?.()
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.message || "Failed to delete track")
        setConfirmDeleteId(null)
      }
    } finally {
      setDeletingId(null)
    }
  }

  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "40px 1fr 70px auto",
    gap: S.gap.md,
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: S.radius.sm,
  }

  return (
    <div>
      {error && (
        <div style={{
          ...T.small, color: C.error,
          background: C.error + "15", border: `1px solid ${C.error}40`,
          borderRadius: S.radius.sm, padding: "8px 12px", marginBottom: S.gap.md,
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ ...T.small, color: C.muted }}>Loading tracks…</div>
      ) : tracks.length === 0 ? (
        <div style={{ ...T.small, color: C.muted, fontStyle: "italic" }}>No tracks yet.</div>
      ) : (
        <div style={{ marginBottom: S.gap.md }}>
          <div style={{ ...rowStyle, background: "transparent" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pos</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Title</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Duration</div>
            <div />
          </div>
          {tracks.map((track) => (
            <div key={track.id}>
              <div
                style={{ ...rowStyle, background: C.card, border: `1px solid ${C.border}`, marginBottom: 2 }}
                onMouseOver={(e) => (e.currentTarget.style.background = C.hover)}
                onMouseOut={(e) => (e.currentTarget.style.background = C.card)}
              >
                <div style={{ ...T.small, color: C.muted, fontSize: 11 }}>{track.position ?? "—"}</div>
                <div style={{ ...T.small, color: C.text }}>{track.title}</div>
                <div style={{ ...T.small, color: C.muted, fontSize: 11 }}>{track.duration ?? "—"}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => { setModal({ mode: "edit", track }); setError(null) }}
                    title="Edit track"
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.blue, fontSize: 13, padding: "2px 4px" }}
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(track.id)}
                    title="Delete track"
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.error, fontSize: 13, padding: "2px 4px" }}
                  >
                    ×
                  </button>
                </div>
              </div>
              {confirmDeleteId === track.id && (
                <div style={{
                  display: "flex", alignItems: "center", gap: S.gap.sm,
                  padding: "6px 10px", marginBottom: 2,
                  background: C.error + "10", border: `1px solid ${C.error}30`,
                  borderRadius: S.radius.sm,
                }}>
                  <span style={{ ...T.small, color: C.error }}>Delete "{track.title}"?</span>
                  <Btn
                    label={deletingId === track.id ? "Deleting…" : "Delete"}
                    variant="danger"
                    onClick={() => handleDelete(track.id)}
                    disabled={!!deletingId}
                    style={{ padding: "3px 10px", fontSize: 11 }}
                  />
                  <Btn
                    label="Cancel"
                    variant="ghost"
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={!!deletingId}
                    style={{ padding: "3px 10px", fontSize: 11 }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Btn
        label="+ Add Track"
        variant="ghost"
        onClick={() => { setModal({ mode: "add" }); setError(null) }}
        style={{ fontSize: 12, padding: "6px 14px" }}
      />

      {modal && (
        <Modal
          title={modal.mode === "add" ? "Add Track" : "Edit Track"}
          onClose={() => { setModal(null); setError(null) }}
        >
          <TrackForm
            initial={modal.mode === "edit" ? modal.track : undefined}
            onSave={(data) =>
              modal.mode === "add"
                ? handleAdd(data)
                : handleEdit(modal.track.id, data)
            }
            onCancel={() => { setModal(null); setError(null) }}
            saving={saving}
          />
        </Modal>
      )}
    </div>
  )
}
