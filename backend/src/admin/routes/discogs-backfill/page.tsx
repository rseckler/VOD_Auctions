import { useEffect, useState, useCallback, useRef } from "react"
import { useAdminNav } from "../../components/admin-nav"
import { C, T, S } from "../../components/admin-tokens"
import { PageHeader, PageShell, Tabs, StatsGrid } from "../../components/admin-layout"
import { Btn, Toast, Alert, EmptyState } from "../../components/admin-ui"

// ─── Types ────────────────────────────────────────────────────────────────

type Proposed = {
  genres: string[] | null
  styles: string[] | null
  credits: string | null
  tracklist: Array<{ position: string; title: string; duration: string }>
}

type Candidate = {
  release_id: string
  discogs_id: number
  status: string
  gaps: string[]
  proposed: Proposed | null
  error: string | null
  fetched_at: string | null
  applied_at: string | null
  release: {
    title: string | null
    artist_name: string | null
    catalog_number: string | null
    cover_image: string | null
    discogs_url: string | null
    current: {
      genres: string[]
      styles: string[]
      credits: string | null
      track_count: number
    }
  }
}

type Resp = {
  counts: Record<string, number>
  job_running: boolean
  stalled?: boolean
  status: string
  candidates: Candidate[]
}

const TAB_STATUS: Record<string, string> = {
  Pending: "pending",
  Applied: "applied",
  Rejected: "rejected",
  Errors: "error",
}

// ─── Field diff cell ──────────────────────────────────────────────────────

function arrText(a: string[] | null | undefined): string {
  return Array.isArray(a) && a.length > 0 ? a.join(", ") : ""
}

/** Renders current → proposed for one field. Highlights gaps that get filled. */
function DiffCell({
  inGap, currentText, proposedText,
}: { inGap: boolean; currentText: string; proposedText: string }) {
  if (!inGap) {
    // Feld ist nicht leer → wird additiv NICHT angefasst.
    return (
      <span style={{ ...T.small, color: C.muted }}>
        {currentText ? `${currentText.slice(0, 60)}${currentText.length > 60 ? "…" : ""}` : "—"}
        <span style={{ color: C.muted, opacity: 0.6 }}> · kept</span>
      </span>
    )
  }
  if (!proposedText) {
    // Lücke, aber Discogs liefert auch nichts.
    return <span style={{ ...T.small, color: C.muted }}>— · Discogs empty</span>
  }
  return (
    <span style={{ ...T.small, color: C.text }}>
      <span style={{ color: C.muted }}>— → </span>
      <strong style={{ color: C.gold }}>
        {proposedText.length > 70 ? proposedText.slice(0, 70) + "…" : proposedText}
      </strong>
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

function DiscogsBackfill() {
  useAdminNav()

  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState("Pending")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async (status: string) => {
    try {
      const res = await fetch(`/admin/discogs-backfill?status=${status}`, { credentials: "include" })
      const json = (await res.json()) as Resp
      setData(json)
    } catch {
      setToast({ message: "Failed to load candidates", type: "error" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    setSelected(new Set())
    load(TAB_STATUS[tab])
  }, [tab, load])

  // Poll während der Fetch-Job läuft.
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (data?.job_running) {
      pollRef.current = setInterval(() => load(TAB_STATUS[tab]), 4000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [data?.job_running, tab, load])

  const prepare = async () => {
    setBusy(true)
    try {
      const res = await fetch("/admin/discogs-backfill/prepare", { method: "POST", credentials: "include" })
      const json = await res.json()
      setToast({ message: json.message || "Prepare started", type: "success" })
      await load(TAB_STATUS[tab])
    } catch {
      setToast({ message: "Prepare failed", type: "error" })
    } finally {
      setBusy(false)
    }
  }

  const runAction = async (action: "apply" | "reject", ids: string[]) => {
    if (ids.length === 0) return
    setBusy(true)
    try {
      const res = await fetch(`/admin/discogs-backfill/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release_ids: ids }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || "Action failed")
      const msg = action === "apply"
        ? `${json.applied} accepted${json.failed ? `, ${json.failed} failed` : ""}`
        : `${json.rejected} rejected`
      setToast({ message: msg, type: "success" })
      setSelected(new Set())
      await load(TAB_STATUS[tab])
    } catch (e: any) {
      setToast({ message: e.message || "Action failed", type: "error" })
    } finally {
      setBusy(false)
    }
  }

  const counts = data?.counts || {}
  const candidates = data?.candidates || []
  const isPendingTab = tab === "Pending"

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const allSelected = candidates.length > 0 && candidates.every((c) => selected.has(c.release_id))
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(candidates.map((c) => c.release_id)))
  }

  const total = counts.total || 0
  const fetched = total - (counts.fetch_pending || 0)
  const progressPct = total > 0 ? Math.round((fetched / total) * 100) : 0

  return (
    <PageShell maxWidth={1480}>
      <PageHeader
        title="Discogs Metadata Backfill"
        subtitle="Verifizierte, mit Discogs verlinkte Releases mit fehlenden Genres / Styles / Credits / Tracklist — review & accept. Nichts wird automatisch geschrieben."
        actions={
          total === 0 ? null : (
            <Btn
              label={busy ? "Working…" : data?.stalled ? "Resume fetch" : "Re-scan candidates"}
              variant={data?.stalled ? "gold" : "ghost"}
              disabled={busy || data?.job_running}
              onClick={prepare}
            />
          )
        }
      />

      {loading && <div style={{ ...T.small, padding: 24 }}>Loading…</div>}

      {!loading && total === 0 && (
        <div style={{ marginTop: 16 }}>
          <EmptyState
            icon="🪪"
            title="No candidate list yet"
            description="Build the list — this scans all verified linked releases and fetches the missing metadata from Discogs (rate-limited, ~20 min for ~1,250 releases). Nothing is written to releases."
          />
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <Btn
              label={busy ? "Starting…" : "Build candidate list"}
              variant="gold"
              disabled={busy}
              onClick={prepare}
            />
          </div>
        </div>
      )}

      {!loading && total > 0 && (
        <>
          <StatsGrid
            stats={[
              { label: "Pending review", value: counts.pending || 0, color: C.gold },
              { label: "Accepted", value: counts.applied || 0, color: C.success },
              { label: "Rejected", value: counts.rejected || 0 },
              { label: "Fetch errors", value: counts.error || 0, color: (counts.error || 0) > 0 ? C.error : undefined },
              { label: "Total", value: total },
            ]}
          />

          {data?.job_running && (
            <Alert type="info">
              Fetching from Discogs… {fetched} / {total} ({progressPct}%). This page refreshes automatically.
              <div style={{ marginTop: 8, height: 6, background: C.subtle, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${progressPct}%`, height: "100%", background: C.gold }} />
              </div>
            </Alert>
          )}

          {data?.stalled && (
            <Alert type="warning">
              Fetch interrupted — {counts.fetch_pending} of {total} releases not yet fetched (no worker running,
              likely a backend restart). Click <strong>Resume fetch</strong> to continue.
            </Alert>
          )}

          <Tabs
            tabs={Object.keys(TAB_STATUS).map((t) => {
              const n = counts[TAB_STATUS[t]] || 0
              return `${t} (${n})`
            })}
            active={`${tab} (${counts[TAB_STATUS[tab]] || 0})`}
            onChange={(label) => setTab(label.replace(/ \(\d+\)$/, ""))}
          />

          {isPendingTab && candidates.length > 0 && (
            <div style={{ display: "flex", gap: S.gap.sm, alignItems: "center", marginBottom: S.gap.md }}>
              <Btn
                label={`Accept selected (${selected.size})`}
                variant="gold"
                disabled={busy || selected.size === 0}
                onClick={() => runAction("apply", Array.from(selected))}
              />
              <Btn
                label={`Reject selected (${selected.size})`}
                variant="ghost"
                disabled={busy || selected.size === 0}
                onClick={() => runAction("reject", Array.from(selected))}
              />
              <span style={{ ...T.small, marginLeft: "auto" }}>
                Accepting fills only empty fields — never overwrites existing data.
              </span>
            </div>
          )}

          {candidates.length === 0 && (
            <div style={{ ...T.small, padding: 24, textAlign: "center" }}>
              {data?.job_running ? "Waiting for fetch to populate this list…" : "Nothing here."}
            </div>
          )}

          {candidates.length > 0 && (
            <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: S.radius.lg }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
                <thead>
                  <tr style={{ background: C.card, borderBottom: `1px solid ${C.border}` }}>
                    {isPendingTab && (
                      <th style={thStyle}>
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                      </th>
                    )}
                    <th style={thStyle}>Release</th>
                    <th style={thStyle}>Genres</th>
                    <th style={thStyle}>Styles</th>
                    <th style={thStyle}>Credits</th>
                    <th style={thStyle}>Tracklist</th>
                    {tab === "Errors" && <th style={thStyle}>Error</th>}
                    {isPendingTab && <th style={thStyle}></th>}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const cur = c.release.current
                    const pr = c.proposed
                    const checked = selected.has(c.release_id)
                    return (
                      <tr key={c.release_id} style={{ borderBottom: `1px solid ${C.border}`, background: checked ? C.gold + "0c" : "transparent" }}>
                        {isPendingTab && (
                          <td style={tdStyle}>
                            <input type="checkbox" checked={checked} onChange={() => toggle(c.release_id)} />
                          </td>
                        )}
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            {c.release.cover_image ? (
                              <img src={c.release.cover_image} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: S.radius.sm, flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 44, height: 44, background: C.subtle, borderRadius: S.radius.sm, flexShrink: 0 }} />
                            )}
                            <div style={{ minWidth: 160 }}>
                              <div style={{ ...T.body, fontWeight: 600 }}>{c.release.artist_name || "Unknown"}</div>
                              <div style={{ ...T.small }}>{c.release.title || "—"}</div>
                              <div style={{ ...T.micro, marginTop: 2 }}>
                                {c.release.catalog_number || ""}
                                {c.release.discogs_url && (
                                  <>
                                    {c.release.catalog_number ? " · " : ""}
                                    <a href={c.release.discogs_url} target="_blank" rel="noopener noreferrer" style={{ color: C.gold, textTransform: "none", letterSpacing: 0 }}>
                                      Discogs ↗
                                    </a>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <DiffCell inGap={c.gaps.includes("genres")} currentText={arrText(cur.genres)} proposedText={arrText(pr?.genres)} />
                        </td>
                        <td style={tdStyle}>
                          <DiffCell inGap={c.gaps.includes("styles")} currentText={arrText(cur.styles)} proposedText={arrText(pr?.styles)} />
                        </td>
                        <td style={tdStyle}>
                          <DiffCell inGap={c.gaps.includes("credits")} currentText={cur.credits || ""} proposedText={pr?.credits || ""} />
                        </td>
                        <td style={tdStyle}>
                          {c.gaps.includes("tracklist") ? (
                            <span style={{ ...T.small, color: C.text }}>
                              <span style={{ color: C.muted }}>0 → </span>
                              <strong style={{ color: C.gold }}>{pr?.tracklist?.length || 0} tracks</strong>
                            </span>
                          ) : (
                            <span style={{ ...T.small, color: C.muted }}>{cur.track_count} · kept</span>
                          )}
                        </td>
                        {tab === "Errors" && (
                          <td style={tdStyle}>
                            <span style={{ ...T.small, color: C.error }}>{c.error || "—"}</span>
                          </td>
                        )}
                        {isPendingTab && (
                          <td style={tdStyle}>
                            <Btn
                              label="Accept"
                              variant="primary"
                              disabled={busy}
                              onClick={() => runAction("apply", [c.release_id])}
                              style={{ fontSize: 12, padding: "5px 10px" }}
                            />
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </PageShell>
  )
}

const thStyle: React.CSSProperties = {
  ...T.micro, textAlign: "left", padding: "10px 12px", whiteSpace: "nowrap",
}
const tdStyle: React.CSSProperties = {
  padding: "10px 12px", verticalAlign: "top",
}

export default DiscogsBackfill
