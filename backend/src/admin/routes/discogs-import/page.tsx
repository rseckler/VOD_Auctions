import { useState, useEffect, useCallback, useRef } from "react"
import { useAdminNav } from "../../components/admin-nav"
import { C, T, S, fmtDate, fmtNum } from "../../components/admin-tokens"
import { PageHeader, PageShell, Tabs, StatsGrid, SectionHeader } from "../../components/admin-layout"
import { Btn, Alert, EmptyState, inputStyle } from "../../components/admin-ui"

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface UploadResult {
  session_id: string
  row_count: number
  unique_discogs_ids: number
  format_detected: string
  export_type?: string
  sample_rows: Array<Record<string, unknown>>
}

interface MatchRow {
  artist: string
  title: string
  catalog_number: string
  label: string
  format: string
  year: number | null
  discogs_id: number
  condition: number | null
  db_release_id?: string
  match_score?: number
  skip_reason?: string
  api_data?: Record<string, unknown>
}

interface AnalysisResult {
  summary: { total: number; existing: number; linkable: number; new: number; skipped: number }
  existing: MatchRow[]
  linkable: MatchRow[]
  new: MatchRow[]
  skipped: MatchRow[]
}

interface CommitResult {
  run_id: string
  collection: string
  inserted: number
  linked: number
  updated: number
  skipped: number
  errors: number
}

interface HistoryRun {
  run_id: string
  collection_name: string
  import_source: string
  started_at: string
  total: number
  inserted: number
  linked: number
  updated: number
  skipped: number
}

/* ─── Styles ────────────────────────────────────────────────────────────────── */

const cell: React.CSSProperties = { fontSize: 13, padding: "10px 14px", borderBottom: "1px solid " + C.border }
const th: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: C.muted, padding: "10px 14px", borderBottom: "1px solid " + C.border, textAlign: "left" as const }
const dlabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: C.muted, marginBottom: 2 }

const CONDITIONS = ["M/M", "NM/NM", "VG+/VG+", "VG+/VG", "VG/VG", "VG/G+", "G+/G+", "G/G", "F/F"]

/* ─── Main ──────────────────────────────────────────────────────────────────── */

const DiscogsImportPage = () => {
  useAdminNav()

  const [tab, setTab] = useState("Upload")
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [collectionName, setCollectionName] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ new: true, existing: false, linkable: false, skipped: false })
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [condition, setCondition] = useState("VG+/VG+")
  const [inventoryOn, setInventoryOn] = useState(true)
  const [priceMarkup, setPriceMarkup] = useState(1.2)
  const [committing, setCommitting] = useState(false)
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; artist?: string; title?: string } | null>(null)
  const [history, setHistory] = useState<HistoryRun[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  // Fetch state
  const fetchDoneRef = useRef(false)
  const [fetching, setFetching] = useState(false)
  const [fetchProgress, setFetchProgress] = useState<{ current: number; total: number; fetched: number; cached: number; errors: number; artist?: string; title?: string; eta_min?: number } | null>(null)
  const [fetchResult, setFetchResult] = useState<{ fetched: number; cached: number; errors: number; duration_min: number } | null>(null)

  // Load history on tab switch
  useEffect(() => {
    if (tab === "History" && history === null) {
      setHistoryLoading(true)
      fetch("/admin/discogs-import/history", { credentials: "include" })
        .then(r => r.json()).then(d => setHistory(d.runs || []))
        .catch(() => setHistory([]))
        .finally(() => setHistoryLoading(false))
    }
  }, [tab, history])

  const handleUpload = useCallback(async () => {
    if (!file || !collectionName.trim()) return
    setUploading(true)
    setError(null)
    try {
      const ext = file.name.toLowerCase().split(".").pop() || ""
      let payload: Record<string, string>
      if (ext === "csv") {
        payload = { data: await file.text(), filename: file.name, collection_name: collectionName.trim(), encoding: "text" }
      } else {
        const b64 = await new Promise<string>((res, rej) => {
          const r = new FileReader()
          r.onload = () => { const s = r.result as string; res(s.split(",")[1] || s) }
          r.onerror = () => rej(new Error("Failed to read file"))
          r.readAsDataURL(file)
        })
        payload = { data: b64, filename: file.name, collection_name: collectionName.trim(), encoding: "base64" }
      }
      const resp = await fetch("/admin/discogs-import/upload", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || "Upload failed (" + resp.status + ")")
      setUploadResult(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally { setUploading(false) }
  }, [file, collectionName])

  const handleFetch = useCallback(async () => {
    if (!uploadResult) return
    setFetching(true)
    setFetchProgress(null)
    setFetchResult(null)
    setError(null)
    try {
      const resp = await fetch("/admin/discogs-import/fetch", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: uploadResult.session_id }),
      })
      const reader = resp.body?.getReader()
      const dec = new TextDecoder()
      let buf = ""
      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split("\n"); buf = lines.pop() || ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === "progress") setFetchProgress(evt)
            else if (evt.type === "done") { setFetchResult(evt); fetchDoneRef.current = true }
            else if (evt.type === "error") setError(evt.error)
          } catch { /* skip */ }
        }
      }
      // Auto-start analysis after fetch completes
      if (fetchDoneRef.current) {
        fetchDoneRef.current = false
        handleAnalyze()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Fetch failed")
    } finally { setFetching(false) }
  }, [uploadResult])

  const handleAnalyze = useCallback(async () => {
    if (!uploadResult) return
    setAnalyzing(true)
    setError(null)
    try {
      const resp = await fetch("/admin/discogs-import/analyze", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: uploadResult.session_id }) })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || "Analysis failed")
      setAnalysis(data)
      const ids = new Set<number>()
      for (const r of [...(data.new || []), ...(data.linkable || []), ...(data.existing || [])]) ids.add(r.discogs_id)
      setSelectedIds(ids)
      setTab("Analysis")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Analysis failed")
    } finally { setAnalyzing(false) }
  }, [uploadResult])

  const handleCommit = useCallback(async () => {
    if (!uploadResult) return
    if (!confirm("Import " + selectedIds.size + " releases? This will write to the database.")) return
    setCommitting(true)
    setImportProgress({ current: 0, total: selectedIds.size })
    setError(null)
    try {
      const [mc, sc] = condition.split("/")
      const resp = await fetch("/admin/discogs-import/commit", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: uploadResult.session_id, selected_discogs_ids: Array.from(selectedIds), media_condition: mc.trim(), sleeve_condition: sc.trim(), inventory: inventoryOn ? 1 : 0, price_markup: priceMarkup }),
      })
      if (resp.headers.get("content-type")?.includes("text/event-stream")) {
        const reader = resp.body?.getReader()
        const dec = new TextDecoder()
        let buf = ""
        while (reader) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split("\n"); buf = lines.pop() || ""
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            try {
              const evt = JSON.parse(line.slice(6))
              if (evt.type === "progress") setImportProgress({ current: evt.current, total: evt.total, artist: evt.artist, title: evt.title })
              else if (evt.type === "done") { setCommitResult(evt); setHistory(null) }
              else if (evt.type === "error") { setError(evt.error) }
            } catch { /* skip */ }
          }
        }
      } else {
        const data = await resp.json()
        if (!resp.ok) throw new Error(data.error || "Import failed")
        setCommitResult(data); setHistory(null)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed")
    } finally { setCommitting(false); setImportProgress(null) }
  }, [uploadResult, selectedIds, condition, inventoryOn, priceMarkup])

  const toggleId = (id: number) => { const n = new Set(selectedIds); if (n.has(id)) n.delete(id); else n.add(id); setSelectedIds(n) }
  const toggleAll = (rows: MatchRow[], on: boolean) => { const n = new Set(selectedIds); for (const r of rows) { if (on) n.add(r.discogs_id); else n.delete(r.discogs_id) }; setSelectedIds(n) }

  /* ─── Render ─────────────────────────────────────────────────────────────── */

  return (
    <PageShell>
      <PageHeader title="Discogs Collection Import" subtitle="Import releases from Discogs collection exports"
        badge={uploadResult ? { label: fmtNum(uploadResult.unique_discogs_ids) + " releases", color: C.gold } : undefined} />
      <Tabs tabs={["Upload", "Analysis", "History"]} active={tab} onChange={setTab} />
      <div style={{ marginTop: 16 }}>
        {error && <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>}

        {/* ── Upload Tab ─────────────────────────────────────────────── */}
        {tab === "Upload" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ border: "2px dashed " + C.border, borderRadius: 8, padding: "32px 24px", textAlign: "center", background: C.card, cursor: "pointer" }}
              onClick={() => document.getElementById("dfi")?.click()}>
              <input id="dfi" type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setUploadResult(null); setAnalysis(null); setCommitResult(null); setError(null) } }} />
              <div style={{ fontSize: 13, color: C.muted }}>{file ? <><b style={{ color: C.text }}>{file.name}</b> ({(file.size / 1024).toFixed(0)} KB)</> : "Click to select a Discogs export file (.csv or .xlsx)"}</div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Collection Name *</label>
              <input type="text" value={collectionName} onChange={e => setCollectionName(e.target.value)} placeholder='e.g. "Sammlung Müller"' style={{ ...inputStyle, maxWidth: 400 }} />
            </div>
            {!uploadResult && <Btn label={uploading ? "Uploading..." : "Upload & Parse"} variant="gold" disabled={!file || !collectionName.trim() || uploading} onClick={handleUpload} />}
            {uploadResult && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <StatsGrid stats={[
                  { label: "Rows Parsed", value: fmtNum(uploadResult.row_count) },
                  { label: "Unique Discogs IDs", value: fmtNum(uploadResult.unique_discogs_ids) },
                  { label: "Format", value: uploadResult.format_detected + (uploadResult.export_type ? " (" + uploadResult.export_type + ")" : "") },
                  ...((uploadResult as Record<string, unknown>).already_cached != null ? [
                    { label: "Already Cached", value: fmtNum((uploadResult as Record<string, unknown>).already_cached as number), color: C.success },
                    { label: "To Fetch", value: fmtNum((uploadResult as Record<string, unknown>).to_fetch as number), color: (uploadResult as Record<string, unknown>).to_fetch === 0 ? C.success : C.gold },
                  ] : []),
                ]} />

                {/* Step 2: Fetch Discogs Data */}
                <div style={{ background: C.card, borderRadius: 8, border: "1px solid " + C.border, padding: "16px 18px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Step 2: Fetch Discogs Data</div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
                    Fetches images, tracklist, credits, genres, and prices for each release from the Discogs API.
                    {!fetching && !fetchResult && <> Estimated time: ~{Math.ceil(uploadResult.unique_discogs_ids / 20)} minutes.</>}
                  </div>

                  {/* Fetch Progress */}
                  {fetchProgress && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                        <span>{fetchProgress.artist ? fetchProgress.artist + " — " + fetchProgress.title : "Starting..."}</span>
                        <span style={{ fontFamily: "monospace" }}>
                          {fetchProgress.current} / {fetchProgress.total}
                          {fetchProgress.eta_min != null && fetchProgress.eta_min > 0 && <span style={{ color: C.muted }}> (~{fetchProgress.eta_min} min left)</span>}
                        </span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: (fetchProgress.total > 0 ? fetchProgress.current / fetchProgress.total * 100 : 0) + "%", background: C.gold, borderRadius: 3, transition: "width 0.3s" }} />
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 11, color: C.muted, marginTop: 4 }}>
                        <span>Fetched: {fetchProgress.fetched || 0}</span>
                        <span>Cached: {fetchProgress.cached || 0}</span>
                        {(fetchProgress.errors || 0) > 0 && <span style={{ color: C.error }}>Errors: {fetchProgress.errors}</span>}
                      </div>
                    </div>
                  )}

                  {/* Fetch Result */}
                  {fetchResult && (
                    <Alert type="success" style={{ marginBottom: 12 }}>
                      Fetch complete! {fetchResult.fetched} fetched, {fetchResult.cached} cached, {fetchResult.errors} errors ({fetchResult.duration_min} min)
                    </Alert>
                  )}

                  {/* Buttons */}
                  {!fetchResult && (
                    <div style={{ display: "flex", gap: 12 }}>
                      <Btn label={fetching ? "Fetching..." : "Fetch Discogs Data" + ((uploadResult as Record<string, unknown>).to_fetch != null ? " (" + fmtNum((uploadResult as Record<string, unknown>).to_fetch as number) + " releases)" : "")} variant="gold" onClick={handleFetch} disabled={fetching} />
                      <Btn label="Skip (use cached only)" variant="ghost" onClick={handleAnalyze} disabled={fetching || analyzing} />
                    </div>
                  )}
                  {fetchResult && (
                    <Btn label={analyzing ? "Analyzing..." : "Start Analysis"} onClick={handleAnalyze} disabled={analyzing} />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Analysis Tab ───────────────────────────────────────────── */}
        {tab === "Analysis" && !analysis && <EmptyState icon="📊" title="No analysis yet" description="Upload a file and click 'Start Analysis' first." />}
        {tab === "Analysis" && analysis && (() => {
          const s = analysis.summary
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <StatsGrid stats={[
                { label: "Existing", value: fmtNum(s.existing), color: C.blue },
                { label: "Linkable", value: fmtNum(s.linkable), color: C.gold },
                { label: "New", value: fmtNum(s.new), color: C.success },
                { label: "Skipped", value: fmtNum(s.skipped), color: C.muted },
              ]} />
              <div style={{ fontSize: 13, color: C.muted }}>{selectedIds.size} of {s.existing + s.linkable + s.new} releases selected for import</div>

              {commitResult && (
                <Alert type="success">
                  Import complete! Run ID: <b>{commitResult.run_id.substring(0, 8)}...</b> — Inserted: {commitResult.inserted}, Linked: {commitResult.linked}, Updated: {commitResult.updated}
                  {commitResult.errors > 0 && <span> Errors: <b style={{ color: C.error }}>{commitResult.errors}</b></span>}
                </Alert>
              )}

              {/* Release sections */}
              {renderSection("New Releases", analysis.new, "Will be fully imported", "new", true)}
              {renderSection("Linkable", analysis.linkable, "Existing release matched", "linkable", false)}
              {renderSection("Existing", analysis.existing, "Prices + community data will be updated", "existing", false)}
              {analysis.skipped.length > 0 && renderSection("Skipped", analysis.skipped, "API error or not found", "skipped", false)}

              {/* Import Settings + Action */}
              {!commitResult && (
                <div style={{ background: C.card, borderRadius: 8, border: "1px solid " + C.border, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Import Settings</div>
                  <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ fontWeight: 600 }}>Condition:</span>
                      <select value={condition} onChange={e => setCondition(e.target.value)} style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 13 }}>
                        {CONDITIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ fontWeight: 600 }}>Inventory = 1:</span>
                      <input type="checkbox" checked={inventoryOn} onChange={e => setInventoryOn(e.target.checked)} />
                      <span style={{ color: C.muted }}>{inventoryOn ? "Stock 1" : "Stock 0"}</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ fontWeight: 600 }}>Price Markup (VG+ x):</span>
                      <select value={priceMarkup} onChange={e => setPriceMarkup(parseFloat(e.target.value))} style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 13 }}>
                        {[1.0, 1.1, 1.2, 1.3, 1.5].map(v => <option key={v} value={v}>{v} ({v === 1 ? "no markup" : "+" + Math.round((v - 1) * 100) + "%"})</option>)}
                      </select>
                    </label>
                  </div>
                  {importProgress && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                        <span>{importProgress.artist ? importProgress.artist + " — " + importProgress.title : "Starting..."}</span>
                        <span style={{ fontFamily: "monospace" }}>{importProgress.current} / {importProgress.total}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: (importProgress.total > 0 ? importProgress.current / importProgress.total * 100 : 0) + "%", background: C.gold, borderRadius: 3, transition: "width 0.3s" }} />
                      </div>
                    </div>
                  )}
                  <Btn label={committing ? "Importing... (" + (importProgress?.current || 0) + "/" + (importProgress?.total || 0) + ")" : "Approve & Import (" + selectedIds.size + " selected)"} variant="gold" disabled={selectedIds.size === 0 || committing} onClick={handleCommit} />
                </div>
              )}
            </div>
          )
        })()}

        {/* ── History Tab ────────────────────────────────────────────── */}
        {tab === "History" && (
          historyLoading ? <div style={{ fontSize: 13 }}>Loading...</div>
          : !history || history.length === 0 ? <EmptyState icon="📀" title="No imports yet" />
          : <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Date", "Collection", "Source", "Inserted", "Linked", "Updated", "Skipped", "Run ID"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{history.map(r => (
                <tr key={r.run_id}>
                  <td style={cell}>{r.started_at ? fmtDate(r.started_at) : "—"}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>{r.collection_name || "—"}</td>
                  <td style={cell}>{r.import_source || "—"}</td>
                  <td style={{ ...cell, color: C.success, fontWeight: 600 }}>{r.inserted}</td>
                  <td style={{ ...cell, color: C.gold, fontWeight: 600 }}>{r.linked}</td>
                  <td style={{ ...cell, color: C.blue }}>{r.updated}</td>
                  <td style={{ ...cell, color: C.muted }}>{r.skipped}</td>
                  <td style={{ ...cell, fontFamily: "monospace", fontSize: 12 }}>{r.run_id?.substring(0, 8)}...</td>
                </tr>
              ))}</tbody>
            </table>
        )}
      </div>
    </PageShell>
  )

  /* ─── Helper: Collapsible section with checkboxes ────────────────────────── */

  function renderSection(title: string, rows: MatchRow[], hint: string, key: string, showDetail: boolean) {
    if (rows.length === 0) return null
    const allSelected = rows.every(r => selectedIds.has(r.discogs_id))
    const isExpanded = expanded[key]
    return (
      <div style={{ background: C.card, borderRadius: 8, border: "1px solid " + C.border }}>
        <div onClick={() => setExpanded({ ...expanded, [key]: !isExpanded })} style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {key !== "skipped" && <input type="checkbox" checked={allSelected} onClick={e => e.stopPropagation()} onChange={() => toggleAll(rows, !allSelected)} />}
            <span style={{ fontSize: 13, fontWeight: 600 }}>{title} ({fmtNum(rows.length)})</span>
            <span style={{ fontSize: 12, color: C.muted }}>{hint}</span>
          </div>
          <span style={{ color: C.muted }}>{isExpanded ? "▼" : "▶"}</span>
        </div>
        {isExpanded && (
          <div style={{ padding: "0 16px 16px", maxHeight: 600, overflowY: "auto" }}>
            {rows.slice(0, 200).map((row, i) => {
              const sel = selectedIds.has(row.discogs_id)
              const isExp = expandedRow === row.discogs_id
              const api = row.api_data as Record<string, unknown> | undefined
              const images = (api?.images || []) as Array<{ uri?: string }>
              return (
                <div key={row.discogs_id} style={{ borderBottom: "1px solid " + C.border }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", cursor: showDetail ? "pointer" : "default", opacity: sel ? 1 : 0.5 }}
                    onClick={() => showDetail && setExpandedRow(isExp ? null : row.discogs_id)}>
                    <input type="checkbox" checked={sel} onClick={e => e.stopPropagation()} onChange={() => toggleId(row.discogs_id)} />
                    {images[0]?.uri && <img src={String(images[0].uri)} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.artist} — {row.title}</div>
                      <div style={{ fontSize: 12, color: C.muted, display: "flex", gap: 12, alignItems: "center" }}>
                        {row.year && <span>{row.year}</span>}
                        <span>{row.format}</span>
                        {row.match_score != null && row.match_score < 100 && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: row.match_score >= 80 ? C.success + "22" : row.match_score >= 60 ? C.gold + "22" : C.error + "22", color: row.match_score >= 80 ? C.success : row.match_score >= 60 ? C.gold : C.error }}>{row.match_score}% match</span>
                        )}
                        {row.db_release_id && <a href={"https://vod-auctions.com/catalog/" + row.db_release_id} target="_blank" rel="noopener noreferrer" style={{ color: C.gold, textDecoration: "none", fontFamily: "monospace" }} onClick={e => e.stopPropagation()}>{row.db_release_id}</a>}
                        <a href={"https://www.discogs.com/release/" + row.discogs_id} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "none" }} onClick={e => e.stopPropagation()}>discogs:{row.discogs_id}</a>
                      </div>
                    </div>
                    {showDetail && <span style={{ color: C.muted, fontSize: 13 }}>{isExp ? "▼" : "▶"}</span>}
                  </div>
                  {showDetail && isExp && api && renderDetail(api)}
                </div>
              )
            })}
            {rows.length > 200 && <div style={{ fontSize: 12, color: C.muted, padding: 8 }}>Showing 200 of {fmtNum(rows.length)}</div>}
          </div>
        )}
      </div>
    )
  }

  function renderDetail(api: Record<string, unknown>) {
    const images = (api.images || []) as Array<{ uri?: string }>
    const tracks = (api.tracklist || []) as Array<{ position?: string; title?: string; duration?: string }>
    const credits = (api.extraartists || []) as Array<{ name?: string; role?: string }>
    const labels = (api.labels || []) as Array<{ name?: string; catno?: string }>
    const formats = (api.formats || []) as Array<{ name?: string; descriptions?: string[] }>
    const genres = (api.genres || []) as string[]
    const styles = (api.styles || []) as string[]
    const community = (api.community || {}) as { have?: number; want?: number }
    const lp = api.lowest_price as number | null
    return (
      <div style={{ padding: "8px 8px 16px 46px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: C.hover, borderRadius: 6, margin: "0 4px 8px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {images.length > 0 && <div><div style={dlabel}>Images ({images.length})</div><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{images.slice(0, 5).map((img, i) => <img key={i} src={String(img.uri || "")} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 4 }} />)}</div></div>}
          {api.notes && <div><div style={dlabel}>Description</div><div style={{ fontSize: 12, maxHeight: 60, overflow: "hidden" }}>{String(api.notes)}</div></div>}
          {tracks.length > 0 && <div><div style={dlabel}>Tracklist ({tracks.length})</div><div style={{ fontSize: 12 }}>{tracks.slice(0, 8).map((t, i) => <div key={i}>{t.position} {t.title} {t.duration ? "(" + t.duration + ")" : ""}</div>)}{tracks.length > 8 && <div style={{ color: C.muted }}>+{tracks.length - 8} more</div>}</div></div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {genres.length > 0 && <div><div style={dlabel}>Genres</div><div style={{ fontSize: 12 }}>{genres.join(", ")}</div></div>}
          {styles.length > 0 && <div><div style={dlabel}>Styles</div><div style={{ fontSize: 12 }}>{styles.join(", ")}</div></div>}
          {formats.length > 0 && <div><div style={dlabel}>Format</div><div style={{ fontSize: 12 }}>{formats.map(f => [f.name, ...(f.descriptions || [])].join(", ")).join(" + ")}</div></div>}
          {labels.length > 0 && <div><div style={dlabel}>Labels</div><div style={{ fontSize: 12 }}>{labels.map(l => l.name + " (" + l.catno + ")").join(", ")}</div></div>}
          {credits.length > 0 && <div><div style={dlabel}>Credits ({credits.length})</div><div style={{ fontSize: 12, maxHeight: 60, overflow: "hidden" }}>{credits.slice(0, 5).map((c, i) => <div key={i}>{c.role}: {c.name}</div>)}</div></div>}
          <div><div style={dlabel}>Market Data</div><div style={{ fontSize: 12 }}>{lp != null && <div>Lowest: {Number(lp).toFixed(2)}</div>}<div>For Sale: {String(api.num_for_sale ?? 0)}</div><div>Have: {community.have ?? 0} / Want: {community.want ?? 0}</div></div></div>
          {api.fetched_at && <div><div style={dlabel}>Source</div><div style={{ fontFamily: "monospace", fontSize: 12 }}>Discogs API, fetched {String(api.fetched_at).substring(0, 10)}</div></div>}
        </div>
      </div>
    )
  }
}

export default DiscogsImportPage
