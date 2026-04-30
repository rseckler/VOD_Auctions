// ─── ContributingArtistsSection ─────────────────────────────────────────────
// CRUD-UI für ReleaseArtist-Tabelle (Mitwirkende mit Rolle).
// Endpoints: GET/POST /admin/media/:id/contributing-artists,
//            PATCH/DELETE /admin/media/:id/contributing-artists/:linkId
import { useState } from "react"
import { C, T, S } from "./admin-tokens"
import { Btn, Modal } from "./admin-ui"
import { ArtistPickerModal } from "./release-detail/PickerModals"

export type ContributingArtist = {
  link_id: string
  artist_id: string
  artist_name: string | null
  artist_slug: string | null
  role: string | null
  created_at: string | null
}

interface Props {
  releaseId: string
  artists: ContributingArtist[]
  onChanged: () => void
}

const ROLE_SUGGESTIONS = [
  "performer",
  "vocals",
  "guitar",
  "bass",
  "drums",
  "keyboards",
  "synthesizer",
  "producer",
  "mixed by",
  "recorded by",
  "mastered by",
  "engineer",
  "written by",
  "arranged by",
  "composed by",
  "remix",
  "featured",
]

export function ContributingArtistsSection({ releaseId, artists, onChanged }: Props) {
  const [showPicker, setShowPicker] = useState(false)
  const [pendingArtist, setPendingArtist] = useState<{ id: string; name: string } | null>(null)
  const [pendingRole, setPendingRole] = useState("performer")
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editingRoleValue, setEditingRoleValue] = useState("")
  const [deleteCandidate, setDeleteCandidate] = useState<ContributingArtist | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleArtistSelected = (item: { id: string; name: string }) => {
    setPendingArtist(item)
    setShowPicker(false)
    setPendingRole("performer")
    setError(null)
  }

  const handleAdd = async () => {
    if (!pendingArtist) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch(`/admin/media/${releaseId}/contributing-artists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          artist_id: pendingArtist.id,
          role: pendingRole.trim() || "performer",
        }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => "")
        throw new Error(`HTTP ${res.status}: ${txt}`)
      }
      setPendingArtist(null)
      setPendingRole("performer")
      onChanged()
    } catch (err: any) {
      setError(`Hinzufügen fehlgeschlagen: ${err?.message ?? err}`)
    } finally {
      setAdding(false)
    }
  }

  const startEditRole = (a: ContributingArtist) => {
    setEditingRoleId(a.link_id)
    setEditingRoleValue(a.role || "")
    setError(null)
  }

  const saveRole = async (a: ContributingArtist) => {
    const newRole = editingRoleValue.trim() || "performer"
    if (newRole === (a.role || "")) {
      setEditingRoleId(null)
      return
    }
    setBusyId(a.link_id)
    setError(null)
    try {
      const res = await fetch(`/admin/media/${releaseId}/contributing-artists/${a.link_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setEditingRoleId(null)
      onChanged()
    } catch (err: any) {
      setError(`Rolle ändern fehlgeschlagen: ${err?.message ?? err}`)
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteCandidate) return
    const a = deleteCandidate
    setBusyId(a.link_id)
    setError(null)
    try {
      const res = await fetch(`/admin/media/${releaseId}/contributing-artists/${a.link_id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDeleteCandidate(null)
      onChanged()
    } catch (err: any) {
      setError(`Löschen fehlgeschlagen: ${err?.message ?? err}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: S.gap.sm }}>
        {artists.length === 0 && !pendingArtist && (
          <div style={{ ...T.small, color: C.muted, fontStyle: "italic" }}>
            Keine Mitwirkenden eingetragen.
          </div>
        )}

        {artists.map((a) => {
          const isEditing = editingRoleId === a.link_id
          const isBusy = busyId === a.link_id
          return (
            <div
              key={a.link_id}
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1fr auto",
                gap: S.gap.sm,
                alignItems: "center",
                padding: "8px 12px",
                background: C.subtle ?? C.card,
                border: `1px solid ${C.border}`,
                borderRadius: S.radius.sm,
                opacity: isBusy ? 0.5 : 1,
              }}
            >
              <div style={{ ...T.body, fontWeight: 500 }}>
                {a.artist_name || <span style={{ color: C.muted }}>(unbekannt)</span>}
              </div>

              {isEditing ? (
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="text"
                    value={editingRoleValue}
                    onChange={(e) => setEditingRoleValue(e.target.value)}
                    list={`role-suggestions-${a.link_id}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRole(a)
                      if (e.key === "Escape") setEditingRoleId(null)
                    }}
                    autoFocus
                    style={{
                      flex: 1, padding: "4px 8px", fontSize: 13,
                      background: C.card, border: `1px solid ${C.gold}`,
                      borderRadius: S.radius.sm, color: C.text,
                    }}
                  />
                  <datalist id={`role-suggestions-${a.link_id}`}>
                    {ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}
                  </datalist>
                  <Btn
                    label="✓"
                    variant="gold"
                    onClick={() => saveRole(a)}
                    disabled={isBusy}
                    style={{ padding: "4px 10px", fontSize: 13 }}
                  />
                  <Btn
                    label="×"
                    variant="ghost"
                    onClick={() => setEditingRoleId(null)}
                    style={{ padding: "4px 10px", fontSize: 13 }}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startEditRole(a)}
                  title="Klick zum Bearbeiten"
                  style={{
                    background: "none", border: "none", textAlign: "left",
                    padding: "4px 8px", borderRadius: S.radius.sm,
                    color: C.text, fontSize: 13, cursor: "pointer",
                    fontFamily: "monospace",
                  }}
                >
                  {a.role || "performer"}
                </button>
              )}

              <button
                type="button"
                title="Mitwirkenden entfernen"
                onClick={() => setDeleteCandidate(a)}
                disabled={isBusy}
                style={{
                  background: "none", border: "none",
                  cursor: isBusy ? "wait" : "pointer",
                  padding: "4px 8px", color: C.muted, fontSize: 14,
                }}
              >×</button>
            </div>
          )
        })}

        {pendingArtist ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr auto auto",
            gap: S.gap.sm,
            alignItems: "center",
            padding: "8px 12px",
            background: C.gold + "08",
            border: `1px dashed ${C.gold}`,
            borderRadius: S.radius.sm,
          }}>
            <div style={{ ...T.body, fontWeight: 500 }}>{pendingArtist.name}</div>
            <input
              type="text"
              value={pendingRole}
              onChange={(e) => setPendingRole(e.target.value)}
              placeholder="performer"
              list="role-suggestions-add"
              onKeyDown={(e) => { if (e.key === "Enter" && !adding) handleAdd() }}
              style={{
                padding: "4px 8px", fontSize: 13,
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: S.radius.sm, color: C.text,
              }}
            />
            <datalist id="role-suggestions-add">
              {ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}
            </datalist>
            <Btn
              label={adding ? "…" : "Hinzufügen"}
              variant="gold"
              disabled={adding}
              onClick={handleAdd}
              style={{ padding: "4px 14px", fontSize: 12 }}
            />
            <Btn
              label="Abbr."
              variant="ghost"
              onClick={() => { setPendingArtist(null); setError(null) }}
              style={{ padding: "4px 10px", fontSize: 12 }}
            />
          </div>
        ) : (
          <Btn
            label="+ Mitwirkenden hinzufügen"
            variant="ghost"
            onClick={() => setShowPicker(true)}
            style={{ padding: "6px 14px", fontSize: 12, alignSelf: "flex-start" }}
          />
        )}

        {error && (
          <div style={{
            ...T.small, color: C.error, background: C.error + "15",
            border: `1px solid ${C.error}40`, borderRadius: S.radius.sm,
            padding: "8px 12px",
          }}>{error}</div>
        )}
      </div>

      {showPicker && (
        <ArtistPickerModal
          onSelect={handleArtistSelected}
          onClose={() => setShowPicker(false)}
        />
      )}

      {deleteCandidate && (
        <Modal
          title="Mitwirkenden entfernen?"
          subtitle={`"${deleteCandidate.artist_name ?? "Unbekannt"}" als ${deleteCandidate.role ?? "performer"}`}
          onClose={() => setDeleteCandidate(null)}
          maxWidth={420}
          footer={
            <div style={{ display: "flex", gap: S.gap.sm, justifyContent: "flex-end" }}>
              <Btn label="Abbrechen" variant="ghost" onClick={() => setDeleteCandidate(null)} />
              <Btn
                label={busyId === deleteCandidate.link_id ? "Lösche…" : "Entfernen"}
                variant="danger"
                disabled={busyId === deleteCandidate.link_id}
                onClick={confirmDelete}
              />
            </div>
          }
        >
          <div style={{ ...T.small, color: C.muted }}>
            Der Artist selbst bleibt erhalten — nur die Verknüpfung zu diesem Release wird entfernt.
          </div>
        </Modal>
      )}
    </>
  )
}
