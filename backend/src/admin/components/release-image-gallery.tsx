// ─── ReleaseImageGallery ────────────────────────────────────────────────────
// Cover + Gallery + Upload/Reorder/Set-Cover/Delete UI für Catalog-Detail-Page.
// Endpoints: POST/PATCH/DELETE /admin/media/:id/images[...]
import { useRef, useState, type ChangeEvent } from "react"
import { C, S, T } from "./admin-tokens"
import { Btn, Modal } from "./admin-ui"

export type GalleryImage = {
  id: string
  url: string
  alt?: string | null
  rang?: number | null
  source?: string | null
}

interface Props {
  releaseId: string
  images: GalleryImage[]
  onChanged: () => void
  onLightbox?: (index: number) => void
}

export function ReleaseImageGallery({ releaseId, images, onChanged, onLightbox }: Props) {
  const [uploading, setUploading] = useState(false)
  const [deleteCandidate, setDeleteCandidate] = useState<GalleryImage | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sorted = [...images].sort((a, b) => {
    const ra = a.rang ?? 0
    const rb = b.rang ?? 0
    if (ra !== rb) return ra - rb
    return a.id.localeCompare(b.id)
  })
  const cover = sorted[0]
  const rest = sorted.slice(1)

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = "" // reset so re-upload of same file fires change
    if (!file.type.startsWith("image/")) {
      setError("Datei ist kein Bild")
      return
    }
    setError(null)
    setUploading(true)
    try {
      const dataUrl = await fileToBase64(file)
      const res = await fetch(`/admin/media/${releaseId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ image_data: dataUrl }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => "")
        throw new Error(`HTTP ${res.status}: ${txt}`)
      }
      onChanged()
    } catch (err: any) {
      setError(`Upload fehlgeschlagen: ${err?.message ?? err}`)
    } finally {
      setUploading(false)
    }
  }

  const handleSetCover = async (img: GalleryImage) => {
    setBusyId(img.id)
    setError(null)
    try {
      const res = await fetch(`/admin/media/${releaseId}/images/${img.id}/set-cover`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onChanged()
    } catch (err: any) {
      setError(`Cover setzen fehlgeschlagen: ${err?.message ?? err}`)
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteCandidate) return
    const img = deleteCandidate
    setBusyId(img.id)
    setError(null)
    try {
      const res = await fetch(`/admin/media/${releaseId}/images/${img.id}`, {
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

  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      setDragOverId(null)
      return
    }
    const ids = sorted.map((i) => i.id)
    const fromIdx = ids.indexOf(dragId)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx < 0 || toIdx < 0) {
      setDragId(null)
      setDragOverId(null)
      return
    }
    const newOrder = [...ids]
    newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, dragId)
    setDragId(null)
    setDragOverId(null)
    setError(null)
    try {
      const res = await fetch(`/admin/media/${releaseId}/images/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ order: newOrder }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onChanged()
    } catch (err: any) {
      setError(`Reihenfolge speichern fehlgeschlagen: ${err?.message ?? err}`)
    }
  }

  const thumbCommonStyle = {
    width: "100%",
    aspectRatio: "1",
    objectFit: "cover" as const,
    borderRadius: S.radius.sm,
    border: `1px solid ${C.border}`,
    cursor: "pointer",
    background: C.card,
  }

  return (
    <div>
      {/* Cover (rang=0) — groß */}
      {cover ? (
        <div style={{ position: "relative" }}>
          <img
            src={cover.url}
            alt={cover.alt ?? ""}
            onClick={() => onLightbox?.(0)}
            style={{
              width: "100%", borderRadius: S.radius.lg, border: `1px solid ${C.border}`,
              aspectRatio: "1", objectFit: "cover", cursor: "pointer",
            }}
          />
          <span style={{
            position: "absolute", top: 8, left: 8, fontSize: 11, fontWeight: 600,
            background: C.gold, color: "#1c1915",
            padding: "3px 8px", borderRadius: 12, letterSpacing: "0.03em",
          }}>
            ★ COVER
          </span>
          <button
            type="button"
            title="Cover löschen"
            onClick={() => setDeleteCandidate(cover)}
            style={{
              position: "absolute", top: 8, right: 8, width: 28, height: 28,
              borderRadius: "50%", border: "none", cursor: "pointer",
              background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 16, lineHeight: 1,
            }}
          >×</button>
        </div>
      ) : (
        <div style={{
          width: "100%", aspectRatio: "1", borderRadius: S.radius.lg,
          background: C.card, border: `1px dashed ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 48, color: C.muted,
        }}>
          ♬
        </div>
      )}

      {/* Upload + Counter */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: S.gap.md }}>
        <div style={{ ...T.small, color: C.muted }}>
          {sorted.length} {sorted.length === 1 ? "Bild" : "Bilder"}
        </div>
        <div style={{ display: "flex", gap: S.gap.sm }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <Btn
            label={uploading ? "Lade hoch…" : "+ Bild"}
            variant="gold"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: "6px 14px", fontSize: 12 }}
          />
        </div>
      </div>

      {error && (
        <div style={{
          ...T.small, color: C.error, background: C.error + "15",
          border: `1px solid ${C.error}40`, borderRadius: S.radius.sm,
          padding: "8px 12px", marginTop: S.gap.sm,
        }}>{error}</div>
      )}

      {/* Galerie-Grid (alle außer Cover, drag-sortierbar) */}
      {rest.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6,
          marginTop: S.gap.md, maxHeight: 400, overflowY: "auto",
        }}>
          {rest.map((img, i) => {
            const isDragging = dragId === img.id
            const isDragOver = dragOverId === img.id
            const isBusy = busyId === img.id
            return (
              <div
                key={img.id}
                draggable={!isBusy}
                onDragStart={() => setDragId(img.id)}
                onDragOver={(e) => { e.preventDefault(); setDragOverId(img.id) }}
                onDragLeave={() => setDragOverId((curr) => curr === img.id ? null : curr)}
                onDrop={(e) => { e.preventDefault(); handleDrop(img.id) }}
                onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                style={{
                  position: "relative",
                  opacity: isDragging ? 0.4 : isBusy ? 0.6 : 1,
                  outline: isDragOver ? `2px solid ${C.gold}` : "none",
                  borderRadius: S.radius.sm,
                  cursor: isBusy ? "wait" : "grab",
                }}
              >
                <img
                  src={img.url}
                  alt={img.alt ?? ""}
                  onClick={() => onLightbox?.(i + 1)}
                  style={thumbCommonStyle}
                />
                {/* Set-as-cover (Stern) */}
                <button
                  type="button"
                  title="Als Cover setzen"
                  disabled={isBusy}
                  onClick={(e) => { e.stopPropagation(); handleSetCover(img) }}
                  style={{
                    position: "absolute", bottom: 4, left: 4, width: 22, height: 22,
                    borderRadius: "50%", border: "none", cursor: isBusy ? "wait" : "pointer",
                    background: "rgba(0,0,0,0.6)", color: C.gold, fontSize: 13, lineHeight: 1,
                  }}
                >★</button>
                {/* Delete (X) */}
                <button
                  type="button"
                  title="Bild löschen"
                  disabled={isBusy}
                  onClick={(e) => { e.stopPropagation(); setDeleteCandidate(img) }}
                  style={{
                    position: "absolute", top: 4, right: 4, width: 22, height: 22,
                    borderRadius: "50%", border: "none", cursor: isBusy ? "wait" : "pointer",
                    background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 12, lineHeight: 1,
                  }}
                >×</button>
              </div>
            )
          })}
        </div>
      )}

      {rest.length > 1 && (
        <div style={{ ...T.small, color: C.muted, marginTop: 4, fontSize: 11 }}>
          Tipp: Bilder per Drag&amp;Drop umsortieren · ★ = als Cover · × = löschen
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteCandidate && (
        <Modal
          title="Bild löschen?"
          subtitle="Die Datei bleibt im Speicher erhalten (Audit-Trail), wird aber aus diesem Release entfernt."
          onClose={() => setDeleteCandidate(null)}
          maxWidth={420}
          footer={
            <div style={{ display: "flex", gap: S.gap.sm, justifyContent: "flex-end" }}>
              <Btn label="Abbrechen" variant="ghost" onClick={() => setDeleteCandidate(null)} />
              <Btn
                label={busyId === deleteCandidate.id ? "Lösche…" : "Löschen"}
                variant="danger"
                disabled={busyId === deleteCandidate.id}
                onClick={confirmDelete}
              />
            </div>
          }
        >
          <img
            src={deleteCandidate.url}
            alt=""
            style={{
              width: 120, height: 120, objectFit: "cover", borderRadius: S.radius.sm,
              border: `1px solid ${C.border}`,
            }}
          />
        </Modal>
      )}
    </div>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
