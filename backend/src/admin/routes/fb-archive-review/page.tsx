import { useEffect, useState, useCallback, useRef } from "react"
import { useAdminNav } from "../../components/admin-nav"
import { C } from "../../components/admin-tokens"
import { PageHeader, PageShell } from "../../components/admin-layout"

type ArtistCand = { id: string; name: string; score: number }
type ReleaseCand = {
  id: string; title: string;
  main_artist_name: string | null; catalog_number: string | null;
  score: number;
}
type Decision = {
  fb_id: string
  decision: "ok" | "skip" | "edit"
  filename: string | null
  decided_at: string
  decided_by: string | null
}
type Row = {
  fb_id: string
  r2_url: string
  post_date: string
  photo_index: number | null
  photo_total: number
  post_text: string
  suggested_filename: string | null
  ai_confidence: number | null
  ai_artist_name: string | null
  ai_release_title: string | null
  ai_reason: string | null
  artist_candidates: ArtistCand[]
  release_candidates: ReleaseCand[]
  decision: Decision | null
}
type Resp = {
  counts: { total: number; pending: number; decided: number }
  page: number
  pageSize: number
  pages: number
  filter: "pending" | "decided" | "all"
  include_tier1: boolean
  rows: Row[]
}

function FBArchiveReview() {
  useAdminNav()
  const [data, setData] = useState<Resp | null>(null)
  const [filter, setFilter] = useState<"pending" | "decided" | "all">("pending")
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [includeTier1, setIncludeTier1] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [editFb, setEditFb] = useState<string | null>(null)
  const [editFilename, setEditFilename] = useState("")
  const [busyFb, setBusyFb] = useState<string | null>(null)
  const focusRowRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(() => {
    const params = new URLSearchParams({
      filter,
      page: String(page),
      pageSize: String(pageSize),
      include_tier1: String(includeTier1),
    })
    setLoading(true)
    fetch(`/admin/fb-archive/review?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        setData(d as Resp)
        setErr(null)
      })
      .catch((e) => setErr(String(e?.message || e)))
      .finally(() => setLoading(false))
  }, [filter, page, pageSize, includeTier1])

  useEffect(() => {
    load()
  }, [load])

  const decide = async (
    fb_id: string,
    decision: "ok" | "skip" | "edit",
    filename: string | null = null,
  ) => {
    setBusyFb(fb_id)
    try {
      const r = await fetch("/admin/fb-archive/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fb_id, decision, filename }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      // Reload current page (decision moves item out of "pending" filter)
      load()
      setEditFb(null)
      setEditFilename("")
    } catch (e: any) {
      setErr(`decide failed: ${String(e?.message || e)}`)
    } finally {
      setBusyFb(null)
    }
  }

  // Keyboard shortcuts: 1 = ok, 2 = skip, 3 = edit, → = next page, ← = prev
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editFb) return // disable shortcuts while editing
      const tgt = e.target as HTMLElement
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) return
      if (!data || data.rows.length === 0) return
      const first = data.rows[0]
      if (e.key === "1" && first) {
        e.preventDefault()
        const fname = first.suggested_filename || ""
        if (fname) decide(first.fb_id, "edit", fname)
        else decide(first.fb_id, "ok")
      } else if (e.key === "2" && first) {
        e.preventDefault()
        decide(first.fb_id, "skip")
      } else if (e.key === "3" && first) {
        e.preventDefault()
        setEditFb(first.fb_id)
        setEditFilename(first.suggested_filename || "")
      } else if (e.key === "ArrowRight" && data.page < data.pages) {
        e.preventDefault()
        setPage(data.page + 1)
      } else if (e.key === "ArrowLeft" && data.page > 1) {
        e.preventDefault()
        setPage(data.page - 1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [data, editFb])

  if (loading && !data) {
    return (
      <PageShell>
        <PageHeader title="FB Archive — Manual Review" subtitle="Loading…" />
      </PageShell>
    )
  }
  if (err) {
    return (
      <PageShell>
        <PageHeader title="FB Archive — Manual Review" />
        <div style={{
          background: C.error + "15", border: `1px solid ${C.error}40`,
          color: C.error, padding: 12, borderRadius: 6,
        }}>
          {err}
        </div>
      </PageShell>
    )
  }
  if (!data) return null

  const progressPct =
    data.counts.total > 0
      ? Math.round((data.counts.decided / data.counts.total) * 1000) / 10
      : 0

  return (
    <PageShell>
      <PageHeader
        title="FB Archive — Manual Review"
        subtitle={`Frank's Tier-2-Reviews · ${data.counts.decided} / ${data.counts.total} entschieden (${progressPct}%)`}
      />

      {/* Top bar: filter + progress + shortcuts hint */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: 14, marginBottom: 14,
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["pending", "decided", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1) }}
              style={{
                padding: "6px 12px", fontSize: 12, fontWeight: 600,
                background: filter === f ? C.gold : C.subtle,
                color: filter === f ? "#fff" : C.text,
                border: "none", borderRadius: 6, cursor: "pointer",
              }}
            >
              {f === "pending" ? `Pending (${data.counts.pending})`
                : f === "decided" ? `Decided (${data.counts.decided})`
                : `All (${data.counts.total})`}
            </button>
          ))}
        </div>
        <label style={{
          fontSize: 11, color: C.muted, display: "flex",
          alignItems: "center", gap: 6, cursor: "pointer",
        }}>
          <input
            type="checkbox"
            checked={includeTier1}
            onChange={(e) => { setIncludeTier1(e.target.checked); setPage(1) }}
          />
          auch Tier-1-Treffer (Spot-Check der 1.524 high-conf Renames)
        </label>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{
            background: C.subtle, borderRadius: 4, height: 8, overflow: "hidden",
          }}>
            <div style={{
              background: C.gold, height: "100%",
              width: `${progressPct}%`, transition: "width 0.5s",
            }} />
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>
          [1]=ok · [2]=skip · [3]=edit · ←→=Seite
        </div>
      </div>

      {/* Cards */}
      {data.rows.length === 0 ? (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: 40, textAlign: "center",
          color: C.muted, fontSize: 14,
        }}>
          {filter === "pending" ? "Alles entschieden 🎉" : "Keine Einträge"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.rows.map((row, i) => (
            <ReviewCard
              key={row.fb_id}
              row={row}
              focused={i === 0}
              busy={busyFb === row.fb_id}
              editing={editFb === row.fb_id}
              editFilename={editFilename}
              setEditFilename={setEditFilename}
              onOk={() => {
                const fname = row.suggested_filename || ""
                if (fname) decide(row.fb_id, "edit", fname)
                else decide(row.fb_id, "ok")
              }}
              onSkip={() => decide(row.fb_id, "skip")}
              onEdit={() => {
                setEditFb(row.fb_id)
                setEditFilename(row.suggested_filename || "")
              }}
              onEditCancel={() => { setEditFb(null); setEditFilename("") }}
              onEditSave={() => decide(row.fb_id, "edit", editFilename)}
              focusRowRef={i === 0 ? focusRowRef : undefined}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data.pages > 1 && (
        <div style={{
          marginTop: 14, display: "flex", justifyContent: "center",
          alignItems: "center", gap: 12, fontSize: 12,
        }}>
          <button
            disabled={data.page <= 1}
            onClick={() => setPage(data.page - 1)}
            style={{
              padding: "6px 12px",
              background: data.page <= 1 ? C.subtle : C.card,
              color: data.page <= 1 ? C.muted : C.text,
              border: `1px solid ${C.border}`, borderRadius: 6,
              cursor: data.page <= 1 ? "default" : "pointer",
            }}
          >
            ← prev
          </button>
          <span style={{ color: C.muted }}>
            Seite {data.page} / {data.pages}
          </span>
          <button
            disabled={data.page >= data.pages}
            onClick={() => setPage(data.page + 1)}
            style={{
              padding: "6px 12px",
              background: data.page >= data.pages ? C.subtle : C.card,
              color: data.page >= data.pages ? C.muted : C.text,
              border: `1px solid ${C.border}`, borderRadius: 6,
              cursor: data.page >= data.pages ? "default" : "pointer",
            }}
          >
            next →
          </button>
        </div>
      )}
    </PageShell>
  )
}

function ReviewCard({
  row, focused, busy, editing, editFilename, setEditFilename,
  onOk, onSkip, onEdit, onEditCancel, onEditSave, focusRowRef,
}: {
  row: Row
  focused: boolean
  busy: boolean
  editing: boolean
  editFilename: string
  setEditFilename: (v: string) => void
  onOk: () => void
  onSkip: () => void
  onEdit: () => void
  onEditCancel: () => void
  onEditSave: () => void
  focusRowRef?: React.MutableRefObject<HTMLDivElement | null>
}) {
  const conf = row.ai_confidence
  const confColor =
    conf == null ? C.muted : conf >= 0.85 ? C.success : conf >= 0.6 ? C.warning : C.error
  return (
    <div
      ref={focusRowRef}
      style={{
        background: C.card, border: `1px solid ${focused ? C.gold + "80" : C.border}`,
        borderRadius: 10, padding: 16,
        display: "grid", gridTemplateColumns: "320px 1fr 220px", gap: 16,
        opacity: busy ? 0.5 : 1, transition: "opacity 0.2s",
      }}
    >
      {/* Image */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 6,
        alignItems: "center", justifyContent: "flex-start",
      }}>
        <a href={row.r2_url} target="_blank" rel="noreferrer noopener">
          <img
            src={row.r2_url}
            alt={row.fb_id}
            style={{
              maxWidth: "100%", maxHeight: 320,
              borderRadius: 6, border: `1px solid ${C.border}`,
              background: C.subtle,
            }}
          />
        </a>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>
          {row.fb_id} · {row.post_date}
          {row.photo_total > 1 && ` · ${(row.photo_index ?? 0) + 1}/${row.photo_total}`}
        </div>
      </div>

      {/* Center: post text + AI suggestion + candidates */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <div style={{
          fontSize: 12, color: C.text, lineHeight: 1.5,
          background: C.subtle, padding: 10, borderRadius: 6,
          maxHeight: 110, overflow: "auto",
        }}>
          {row.post_text || <em style={{ color: C.muted }}>(kein Text)</em>}
        </div>
        {row.suggested_filename && (
          <div style={{
            background: confColor + "12", border: `1px solid ${confColor}50`,
            borderRadius: 6, padding: 10, fontSize: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: confColor, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                AI-Vorschlag
              </span>
              {conf != null && (
                <span style={{ fontSize: 10, color: confColor, fontWeight: 700 }}>
                  conf {(conf * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <div style={{ fontFamily: "monospace", fontWeight: 600, color: C.text, marginBottom: 4 }}>
              {row.suggested_filename}
            </div>
            {row.ai_reason && (
              <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>
                {row.ai_reason}
              </div>
            )}
          </div>
        )}
        {(row.artist_candidates.length > 0 || row.release_candidates.length > 0) && (
          <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
            {row.artist_candidates.length > 0 && (
              <div>
                <b>Artists:</b>{" "}
                {row.artist_candidates.map((a, i) => (
                  <span key={a.id}>
                    {i > 0 && " · "}
                    {a.name} <span style={{ opacity: 0.6 }}>({a.score})</span>
                  </span>
                ))}
              </div>
            )}
            {row.release_candidates.length > 0 && (
              <div>
                <b>Releases:</b>{" "}
                {row.release_candidates.map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && " · "}
                    {r.title}
                    {r.catalog_number && <span style={{ opacity: 0.6 }}> [{r.catalog_number}]</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {row.decision && (
          <div style={{
            background: C.subtle, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: 8, fontSize: 11,
            color: C.muted,
          }}>
            <b>Entschieden:</b>{" "}
            <span style={{
              color: row.decision.decision === "ok" ? C.success
                : row.decision.decision === "skip" ? C.muted
                : C.gold,
              fontWeight: 600,
            }}>
              {row.decision.decision}
            </span>
            {row.decision.filename && (
              <span style={{ fontFamily: "monospace", marginLeft: 8 }}>
                → {row.decision.filename}
              </span>
            )}
            <span style={{ marginLeft: 8, opacity: 0.6 }}>
              {new Date(row.decision.decided_at).toLocaleString("de-DE")}
            </span>
          </div>
        )}
      </div>

      {/* Right: action buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {editing ? (
          <>
            <input
              type="text"
              value={editFilename}
              onChange={(e) => setEditFilename(e.target.value)}
              autoFocus
              placeholder="Artist - Release FB.jpg"
              style={{
                padding: "8px 10px", fontSize: 12, fontFamily: "monospace",
                background: C.subtle, border: `1px solid ${C.border}`,
                borderRadius: 6, color: C.text,
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onEditSave()
                if (e.key === "Escape") onEditCancel()
              }}
            />
            <button
              onClick={onEditSave}
              disabled={!editFilename.trim() || busy}
              style={{
                padding: "8px 12px", fontSize: 13, fontWeight: 600,
                background: C.gold, color: "#fff",
                border: "none", borderRadius: 6, cursor: "pointer",
              }}
            >
              Save (Enter)
            </button>
            <button
              onClick={onEditCancel}
              style={{
                padding: "8px 12px", fontSize: 13,
                background: C.subtle, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer",
              }}
            >
              Cancel (Esc)
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onOk}
              disabled={busy}
              style={{
                padding: "10px 12px", fontSize: 13, fontWeight: 600,
                background: C.success, color: "#fff",
                border: "none", borderRadius: 6, cursor: "pointer",
              }}
            >
              ✓ OK [1]
            </button>
            <button
              onClick={onSkip}
              disabled={busy}
              style={{
                padding: "10px 12px", fontSize: 13, fontWeight: 600,
                background: C.muted, color: "#fff",
                border: "none", borderRadius: 6, cursor: "pointer",
              }}
            >
              ⨯ Skip [2]
            </button>
            <button
              onClick={onEdit}
              disabled={busy}
              style={{
                padding: "10px 12px", fontSize: 13, fontWeight: 600,
                background: C.subtle, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer",
              }}
            >
              ✎ Edit [3]
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default FBArchiveReview
