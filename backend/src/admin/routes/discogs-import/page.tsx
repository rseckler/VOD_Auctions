import { useState, useEffect, useCallback } from "react"
import { useAdminNav } from "../../components/admin-nav"
import { C, T, S, fmtDate, fmtNum, relativeTime } from "../../components/admin-tokens"
import { PageHeader, PageShell, Tabs, StatsGrid, SectionHeader, Divider } from "../../components/admin-layout"
import { Btn, Alert, EmptyState, Badge, inputStyle } from "../../components/admin-ui"

// ─── Types ───────────────────────────────────────────────────────────────────

interface UploadResult {
  session_id: string
  row_count: number
  unique_discogs_ids: number
  format_detected: string
  sample_rows: Array<{
    artist: string
    title: string
    year: number | null
    format: string
    discogs_id: number
  }>
}

interface MatchResult {
  artist: string
  title: string
  catalog_number: string
  label: string
  format: string
  year: number | null
  discogs_id: number
  condition: number | null
  db_release_id?: string
  skip_reason?: string
  api_data?: {
    country?: string
    genres?: string[]
    styles?: string[]
    community?: { have: number; want: number }
    lowest_price?: number | null
    num_for_sale?: number
  }
}

interface AnalysisResult {
  summary: {
    total: number
    existing: number
    linkable: number
    new: number
    skipped: number
    has_api_cache: boolean
    cached_count: number
  }
  existing: MatchResult[]
  linkable: MatchResult[]
  new: MatchResult[]
  skipped: MatchResult[]
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

// ─── Main Component ──────────────────────────────────────────────────────────

const DiscogsImportPage = () => {
  useAdminNav()

  const [tab, setTab] = useState("Upload")
  const [error, setError] = useState<string | null>(null)

  // Upload state
  const [file, setFile] = useState<File | null>(null)
  const [collectionName, setCollectionName] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [expanded, setExpanded] = useState({ new: true, existing: false, linkable: false, skipped: false })

  // Selection state (for admin approval)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Import settings
  const [condition, setCondition] = useState("VG+/VG+")
  const [inventoryOn, setInventoryOn] = useState(true)

  // Commit state
  const [committing, setCommitting] = useState(false)
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; artist?: string; title?: string } | null>(null)

  // History state
  const [history, setHistory] = useState<HistoryRun[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  // Load history on tab switch
  useEffect(() => {
    if (tab === "History" && !history) {
      setHistoryLoading(true)
      fetch("/admin/discogs-import/history", { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setHistory(data.runs || []))
        .catch(() => setHistory([]))
        .finally(() => setHistoryLoading(false))
    }
  }, [tab, history])

  // ─── Upload ──────────────────────────────────────────────────────────────

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setUploadResult(null)
      setAnalysis(null)
      setCommitResult(null)
      setError(null)
    }
  }, [])

  const handleUpload = useCallback(async () => {
    if (!file || !collectionName.trim()) return
    setUploading(true)
    setError(null)

    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const resp = await fetch("/admin/discogs-import/upload", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: base64,
          filename: file.name,
          collection_name: collectionName.trim(),
        }),
      })

      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `Upload failed (${resp.status})`)
      setUploadResult(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }, [file, collectionName])

  // ─── Analyze ─────────────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (!uploadResult?.session_id) return
    setAnalyzing(true)
    setError(null)

    try {
      const resp = await fetch("/admin/discogs-import/analyze", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: uploadResult.session_id }),
      })

      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `Analysis failed (${resp.status})`)
      setAnalysis(data)
      // Initialize selection: all NEW + LINKABLE selected by default
      const ids = new Set<number>()
      for (const r of (data.new || [])) ids.add(r.discogs_id)
      for (const r of (data.linkable || [])) ids.add(r.discogs_id)
      for (const r of (data.existing || [])) ids.add(r.discogs_id)
      setSelectedIds(ids)
      setTab("Analysis")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Analysis failed")
    } finally {
      setAnalyzing(false)
    }
  }, [uploadResult])

  // ─── Commit ──────────────────────────────────────────────────────────────

  const handleCommit = useCallback(async () => {
    if (!uploadResult?.session_id) return
    if (!confirm(`Import ${selectedIds.size} releases? This will write to the database.`)) return

    setCommitting(true)
    setImportProgress({ current: 0, total: selectedIds.size })
    setError(null)

    try {
      const [mediaCond, sleeveCond] = condition.split("/")
      const resp = await fetch("/admin/discogs-import/commit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: uploadResult.session_id,
          selected_discogs_ids: Array.from(selectedIds),
          media_condition: mediaCond.trim(),
          sleeve_condition: sleeveCond.trim(),
          inventory: inventoryOn ? 1 : 0,
        }),
      })

      // SSE-style: read streaming response line by line
      if (resp.headers.get("content-type")?.includes("text/event-stream")) {
        const reader = resp.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        while (reader) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const evt = JSON.parse(line.slice(6))
                if (evt.type === "progress") {
                  setImportProgress({ current: evt.current, total: evt.total, artist: evt.artist, title: evt.title })
                } else if (evt.type === "done") {
                  setCommitResult(evt)
                  setHistory(null)
                }
              } catch { /* skip malformed */ }
            }
          }
        }
      } else {
        // Fallback: non-streaming response
        const data = await resp.json()
        if (!resp.ok) throw new Error(data.error || `Import failed (${resp.status})`)
        setCommitResult(data)
        setHistory(null)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setCommitting(false)
      setImportProgress(null)
    }
  }, [uploadResult, selectedIds, condition, inventoryOn])

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <PageShell>
      <PageHeader
        title="Discogs Collection Import"
        subtitle="Import releases from Discogs collection exports"
        badge={
          uploadResult
            ? { label: `${fmtNum(uploadResult.unique_discogs_ids)} releases`, color: C.gold }
            : undefined
        }
      />

      <Tabs
        tabs={["Upload", "Analysis", "History"]}
        active={tab}
        onChange={setTab}
      />

      <div style={{ marginTop: S.gap.lg }}>
        {error && <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>}

        {tab === "Upload" && (
          <UploadTab
            file={file}
            collectionName={collectionName}
            setCollectionName={setCollectionName}
            onFileSelect={handleFileSelect}
            onUpload={handleUpload}
            uploading={uploading}
            uploadResult={uploadResult}
            onAnalyze={handleAnalyze}
            analyzing={analyzing}
          />
        )}

        {tab === "Analysis" && (
          <AnalysisTab
            analysis={analysis}
            expanded={expanded}
            setExpanded={setExpanded}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            condition={condition}
            setCondition={setCondition}
            inventoryOn={inventoryOn}
            setInventoryOn={setInventoryOn}
            onCommit={handleCommit}
            committing={committing}
            commitResult={commitResult}
            importProgress={importProgress}
          />
        )}

        {tab === "History" && (
          <HistoryTab history={history} loading={historyLoading} />
        )}
      </div>
    </PageShell>
  )
}

// ─── Upload Tab ──────────────────────────────────────────────────────────────

function UploadTab({
  file,
  collectionName,
  setCollectionName,
  onFileSelect,
  onUpload,
  uploading,
  uploadResult,
  onAnalyze,
  analyzing,
}: {
  file: File | null
  collectionName: string
  setCollectionName: (v: string) => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onUpload: () => void
  uploading: boolean
  uploadResult: UploadResult | null
  onAnalyze: () => void
  analyzing: boolean
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap.lg }}>
      {/* Dropzone */}
      <div
        style={{
          border: `2px dashed ${C.border}`,
          borderRadius: S.radius.lg,
          padding: "32px 24px",
          textAlign: "center",
          background: C.card,
          cursor: "pointer",
          position: "relative",
        }}
        onClick={() => document.getElementById("discogs-file-input")?.click()}
      >
        <input
          id="discogs-file-input"
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={onFileSelect}
          style={{ display: "none" }}
        />
        <div style={{ ...T.body, color: C.muted, marginBottom: 8 }}>
          {file ? (
            <>
              <span style={{ fontWeight: 600, color: C.text }}>{file.name}</span>
              <span style={{ marginLeft: 8 }}>({(file.size / 1024).toFixed(0)} KB)</span>
            </>
          ) : (
            "Click to select a Discogs export file (.csv or .xlsx)"
          )}
        </div>
        <div style={{ ...T.small }}>
          Supports standard Discogs CSV exports and custom Excel exports
        </div>
      </div>

      {/* Collection Name */}
      <div>
        <label style={{ ...T.small, fontWeight: 600, display: "block", marginBottom: 4 }}>
          Collection Name *
        </label>
        <input
          type="text"
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
          placeholder='e.g. "Sammlung Müller" or "VOD Eigenbestand"'
          style={{ ...inputStyle, maxWidth: 400 }}
        />
        <div style={{ ...T.small, marginTop: 4 }}>
          Used for tracking — identifies which collection these releases came from
        </div>
      </div>

      {/* Upload Button */}
      {!uploadResult && (
        <div>
          <Btn
            label={uploading ? "Uploading..." : "Upload & Parse"}
            variant="gold"
            disabled={!file || !collectionName.trim() || uploading}
            onClick={onUpload}
          />
        </div>
      )}

      {/* Upload Result */}
      {uploadResult && (
        <div>
          <StatsGrid
            stats={[
              { label: "Rows Parsed", value: fmtNum(uploadResult.row_count) },
              { label: "Unique Discogs IDs", value: fmtNum(uploadResult.unique_discogs_ids) },
              { label: "Format", value: uploadResult.format_detected },
            ]}
          />

          {/* Sample rows */}
          {uploadResult.sample_rows.length > 0 && (
            <div style={{ marginTop: S.gap.md }}>
              <SectionHeader title="Sample (first 5 rows)" />
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                <thead>
                  <tr>
                    {["Artist", "Title", "Year", "Format", "Discogs ID"].map((h) => (
                      <th
                        key={h}
                        style={{
                          ...T.micro,
                          color: C.muted,
                          padding: S.cellPadding,
                          borderBottom: `1px solid ${C.border}`,
                          textAlign: "left",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uploadResult.sample_rows.map((r, i) => (
                    <tr key={i}>
                      <td style={cellStyle}>{r.artist}</td>
                      <td style={cellStyle}>{r.title}</td>
                      <td style={cellStyle}>{r.year || "—"}</td>
                      <td style={cellStyle}>{r.format}</td>
                      <td style={{ ...cellStyle, ...T.mono }}>{r.discogs_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: S.gap.lg }}>
            <Btn
              label={analyzing ? "Analyzing..." : "Start Analysis"}
              onClick={onAnalyze}
              disabled={analyzing}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Analysis Tab ────────────────────────────────────────────────────────────

const CONDITION_OPTIONS = [
  "M/M", "NM/NM", "VG+/VG+", "VG+/VG", "VG/VG", "VG/G+", "G+/G+", "G/G", "F/F",
]

function AnalysisTab({
  analysis,
  expanded,
  setExpanded,
  selectedIds,
  setSelectedIds,
  condition,
  setCondition,
  inventoryOn,
  setInventoryOn,
  onCommit,
  committing,
  commitResult,
  importProgress,
}: {
  analysis: AnalysisResult | null
  expanded: Record<string, boolean>
  setExpanded: (v: Record<string, boolean>) => void
  selectedIds: Set<number>
  setSelectedIds: (v: Set<number>) => void
  condition: string
  setCondition: (v: string) => void
  inventoryOn: boolean
  setInventoryOn: (v: boolean) => void
  onCommit: () => void
  committing: boolean
  commitResult: CommitResult | null
  importProgress: { current: number; total: number; artist?: string; title?: string } | null
}) {
  if (!analysis) {
    return <EmptyState icon="📊" title="No analysis yet" description="Upload a file and click 'Start Analysis' first." />
  }

  const s = analysis.summary
  const totalSelected = selectedIds.size

  const toggleId = (id: number) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleAllInCategory = (rows: MatchResult[], on: boolean) => {
    const next = new Set(selectedIds)
    for (const r of rows) {
      if (on) next.add(r.discogs_id)
      else next.delete(r.discogs_id)
    }
    setSelectedIds(next)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap.lg }}>
      <StatsGrid
        stats={[
          { label: "Existing", value: fmtNum(s.existing), color: C.blue },
          { label: "Linkable", value: fmtNum(s.linkable), color: C.gold },
          { label: "New", value: fmtNum(s.new), color: C.success },
          { label: "Skipped", value: fmtNum(s.skipped), color: C.muted },
        ]}
      />

      <div style={{ ...T.body, color: C.muted }}>
        {totalSelected} of {s.existing + s.linkable + s.new} releases selected for import
      </div>

      {!s.has_api_cache && (
        <Alert type="warning">
          No Discogs API cache found. Run the Python script first to fetch enriched data:
          <code style={{ display: "block", marginTop: 4, ...T.mono }}>
            python3 discogs_collection_import.py --file export.xlsx --collection "..."
          </code>
        </Alert>
      )}

      {commitResult && (
        <Alert type="success">
          Import complete! Run ID: <strong>{commitResult.run_id.substring(0, 8)}...</strong>
          {" — "}Inserted: {commitResult.inserted}, Linked: {commitResult.linked},
          Updated: {commitResult.updated}
          {commitResult.errors > 0 && <>, Errors: <strong style={{ color: C.error }}>{commitResult.errors}</strong></>}
        </Alert>
      )}

      {/* NEW Releases */}
      {analysis.new.length > 0 && (
        <CollapsibleSection
          title={`New Releases (${fmtNum(s.new)})`}
          hint="Will be fully imported"
          expanded={expanded.new}
          onToggle={() => setExpanded({ ...expanded, new: !expanded.new })}
          onSelectAll={(on) => toggleAllInCategory(analysis.new, on)}
          allSelected={analysis.new.every((r) => selectedIds.has(r.discogs_id))}
        >
          <ReleaseList rows={analysis.new} selectedIds={selectedIds} onToggle={toggleId} showDetail />
        </CollapsibleSection>
      )}

      {/* LINKABLE */}
      {analysis.linkable.length > 0 && (
        <CollapsibleSection
          title={`Linkable (${fmtNum(s.linkable)})`}
          hint="Existing release matched — discogs_id + enrichment will be added"
          expanded={expanded.linkable}
          onToggle={() => setExpanded({ ...expanded, linkable: !expanded.linkable })}
          onSelectAll={(on) => toggleAllInCategory(analysis.linkable, on)}
          allSelected={analysis.linkable.every((r) => selectedIds.has(r.discogs_id))}
        >
          <ReleaseList rows={analysis.linkable} selectedIds={selectedIds} onToggle={toggleId} showDbId />
        </CollapsibleSection>
      )}

      {/* EXISTING */}
      {analysis.existing.length > 0 && (
        <CollapsibleSection
          title={`Existing (${fmtNum(s.existing)})`}
          hint="Already in DB — prices + community data will be updated"
          expanded={expanded.existing}
          onToggle={() => setExpanded({ ...expanded, existing: !expanded.existing })}
          onSelectAll={(on) => toggleAllInCategory(analysis.existing, on)}
          allSelected={analysis.existing.every((r) => selectedIds.has(r.discogs_id))}
        >
          <ReleaseList rows={analysis.existing} selectedIds={selectedIds} onToggle={toggleId} showDbId />
        </CollapsibleSection>
      )}

      {/* SKIPPED */}
      {analysis.skipped.length > 0 && (
        <CollapsibleSection
          title={`Skipped (${fmtNum(s.skipped)})`}
          hint="API error or not found"
          expanded={expanded.skipped}
          onToggle={() => setExpanded({ ...expanded, skipped: !expanded.skipped })}
        >
          <ResultTable
            rows={analysis.skipped}
            columns={[
              { key: "artist", label: "Artist" },
              { key: "title", label: "Title" },
              { key: "discogs_id", label: "Discogs ID", mono: true },
              { key: "skip_reason", label: "Reason" },
            ]}
          />
        </CollapsibleSection>
      )}

      {/* ── Import Settings + Action ── */}
      {!commitResult && (
        <div style={{ background: C.card, borderRadius: S.radius.lg, border: `1px solid ${C.border}`, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...T.body, fontWeight: 700 }}>Import Settings</div>

          <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
            {/* Condition Dropdown */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ ...T.small, fontWeight: 600 }}>Condition (Media/Sleeve):</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: S.radius.sm,
                  border: `1px solid ${C.border}`,
                  fontSize: 13,
                  background: "white",
                }}
              >
                {CONDITION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Inventory Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ ...T.small, fontWeight: 600 }}>Inventory = 1:</label>
              <input
                type="checkbox"
                checked={inventoryOn}
                onChange={(e) => setInventoryOn(e.target.checked)}
                style={{ cursor: "pointer", width: 18, height: 18 }}
              />
              <span style={T.small}>{inventoryOn ? "Each article set to stock 1" : "Articles created with stock 0"}</span>
            </div>
          </div>

          {/* Live Progress */}
          {importProgress && (
            <div style={{ marginTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={T.small}>
                  {importProgress.artist && importProgress.title
                    ? `${importProgress.artist} — ${importProgress.title}`
                    : "Starting..."}
                </span>
                <span style={{ ...T.mono, ...T.small }}>
                  {importProgress.current} / {importProgress.total}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total * 100) : 0}%`,
                  background: C.gold,
                  borderRadius: 3,
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>
          )}

          {/* Action Button */}
          <div>
            <Btn
              label={committing ? `Importing... (${importProgress?.current || 0}/${importProgress?.total || 0})` : `Approve & Import (${totalSelected} selected)`}
              variant="gold"
              disabled={totalSelected === 0 || committing}
              onClick={onCommit}
            />
            {totalSelected === 0 && !committing && (
              <span style={{ ...T.small, marginLeft: 12 }}>
                Select at least one release to import.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Release List with checkboxes + detail preview ───────────────────────────

function ReleaseList({
  rows,
  selectedIds,
  onToggle,
  showDetail,
  showDbId,
}: {
  rows: MatchResult[]
  selectedIds: Set<number>
  onToggle: (id: number) => void
  showDetail?: boolean
  showDbId?: boolean
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const MAX_DISPLAY = 200
  const displayRows = rows.slice(0, MAX_DISPLAY)

  return (
    <>
      {displayRows.map((row, i) => {
        const selected = selectedIds.has(row.discogs_id)
        const isExpanded = expandedId === row.discogs_id
        return (
          <div key={row.discogs_id} style={{ borderBottom: `1px solid ${C.border}` }}>
            {/* Row header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 4px",
                cursor: "pointer",
                opacity: selected ? 1 : 0.5,
              }}
              onClick={() => showDetail && setExpandedId(isExpanded ? null : row.discogs_id)}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={(e) => { e.stopPropagation(); onToggle(row.discogs_id) }}
                onClick={(e) => e.stopPropagation()}
                style={{ cursor: "pointer" }}
              />
              {row.api_data?.images?.[0]?.uri && (
                <img
                  src={row.api_data.images[0].uri}
                  alt=""
                  style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...T.body, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.artist} — {row.title}
                </div>
                <div style={{ ...T.small, display: "flex", gap: 12 }}>
                  {row.year && <span>{row.year}</span>}
                  <span>{row.format}</span>
                  {showDbId && row.db_release_id && (
                    <a
                      href={`https://vod-auctions.com/catalog/${row.db_release_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: C.gold, textDecoration: "none", ...T.mono }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.db_release_id}
                    </a>
                  )}
                  <a
                    href={`https://www.discogs.com/release/${row.discogs_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: C.blue, textDecoration: "none" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    discogs:{row.discogs_id}
                  </a>
                </div>
              </div>
              {showDetail && (
                <span style={{ ...T.small, color: C.muted }}>{isExpanded ? "▼" : "▶"}</span>
              )}
            </div>

            {/* Expanded detail */}
            {showDetail && isExpanded && row.api_data && (
              <ReleaseDetail data={row.api_data} artist={row.artist} title={row.title} />
            )}
          </div>
        )
      })}
      {rows.length > MAX_DISPLAY && (
        <div style={{ ...T.small, padding: "8px 0" }}>
          Showing {MAX_DISPLAY} of {fmtNum(rows.length)} entries.
        </div>
      )}
    </>
  )
}

// ─── Release Detail Preview ──────────────────────────────────────────────────

function ReleaseDetail({ data, artist, title }: { data: NonNullable<MatchResult["api_data"]>; artist: string; title: string }) {
  return (
    <div style={{ padding: "8px 8px 16px 46px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: C.hover, borderRadius: S.radius.md, margin: "0 4px 8px" }}>
      {/* Left column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Images */}
        {data.images && data.images.length > 0 && (
          <div>
            <div style={detailLabel}>Images ({data.images.length})</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {data.images.slice(0, 5).map((img, i) => (
                <img key={i} src={img.uri} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 4 }} />
              ))}
            </div>
          </div>
        )}
        {/* Description */}
        {data.notes && (
          <div>
            <div style={detailLabel}>Description</div>
            <div style={{ ...T.small, maxHeight: 60, overflow: "hidden" }}>{data.notes}</div>
          </div>
        )}
        {/* Tracklist */}
        {data.tracklist && data.tracklist.length > 0 && (
          <div>
            <div style={detailLabel}>Tracklist ({data.tracklist.length})</div>
            <div style={T.small}>
              {data.tracklist.slice(0, 8).map((t, i) => (
                <div key={i}>{t.position} {t.title} {t.duration ? `(${t.duration})` : ""}</div>
              ))}
              {data.tracklist.length > 8 && <div style={{ color: C.muted }}>+{data.tracklist.length - 8} more</div>}
            </div>
          </div>
        )}
      </div>

      {/* Right column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Genres + Styles */}
        {data.genres && data.genres.length > 0 && (
          <div>
            <div style={detailLabel}>Genres</div>
            <div style={T.small}>{data.genres.join(", ")}</div>
          </div>
        )}
        {data.styles && data.styles.length > 0 && (
          <div>
            <div style={detailLabel}>Styles</div>
            <div style={T.small}>{data.styles.join(", ")}</div>
          </div>
        )}
        {/* Format */}
        {data.formats && data.formats.length > 0 && (
          <div>
            <div style={detailLabel}>Format</div>
            <div style={T.small}>{data.formats.map((f) => [f.name, ...(f.descriptions || [])].join(", ")).join(" + ")}</div>
          </div>
        )}
        {/* Labels */}
        {data.labels && data.labels.length > 0 && (
          <div>
            <div style={detailLabel}>Labels</div>
            <div style={T.small}>{data.labels.map((l) => `${l.name} (${l.catno})`).join(", ")}</div>
          </div>
        )}
        {/* Credits */}
        {data.extraartists && data.extraartists.length > 0 && (
          <div>
            <div style={detailLabel}>Credits ({data.extraartists.length})</div>
            <div style={{ ...T.small, maxHeight: 60, overflow: "hidden" }}>
              {data.extraartists.slice(0, 5).map((ea, i) => (
                <div key={i}>{ea.role}: {ea.name}</div>
              ))}
              {data.extraartists.length > 5 && <div style={{ color: C.muted }}>+{data.extraartists.length - 5} more</div>}
            </div>
          </div>
        )}
        {/* Price + Community */}
        <div>
          <div style={detailLabel}>Market Data</div>
          <div style={T.small}>
            {data.lowest_price != null && <div>Lowest: {data.lowest_price.toFixed(2)}</div>}
            <div>For Sale: {data.num_for_sale ?? 0}</div>
            <div>Have: {data.community?.have ?? 0} / Want: {data.community?.want ?? 0}</div>
          </div>
        </div>
        {/* Source */}
        {data.fetched_at && (
          <div>
            <div style={detailLabel}>Source</div>
            <div style={{ ...T.mono, ...T.small }}>Discogs API, fetched {data.fetched_at.substring(0, 10)}</div>
          </div>
        )}
      </div>
    </div>
  )
}

const detailLabel: React.CSSProperties = {
  ...T.micro,
  color: C.muted,
  marginBottom: 2,
}

// ─── History Tab ─────────────────────────────────────────────────────────────

function HistoryTab({ history, loading }: { history: HistoryRun[] | null; loading: boolean }) {
  if (loading) return <div style={T.body}>Loading...</div>
  if (!history || history.length === 0) {
    return <EmptyState icon="📀" title="No imports yet" description="Upload a Discogs collection export to get started." />
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["Date", "Collection", "Source", "Inserted", "Linked", "Updated", "Skipped", "Run ID"].map((h) => (
            <th
              key={h}
              style={{
                ...T.micro,
                color: C.muted,
                padding: S.cellPadding,
                borderBottom: `1px solid ${C.border}`,
                textAlign: "left",
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {history.map((run) => (
          <tr key={run.run_id} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={cellStyle}>{run.started_at ? fmtDate(run.started_at) : "—"}</td>
            <td style={{ ...cellStyle, fontWeight: 600 }}>{run.collection_name || "—"}</td>
            <td style={cellStyle}>{run.import_source || "—"}</td>
            <td style={{ ...cellStyle, color: C.success, fontWeight: 600 }}>{run.inserted}</td>
            <td style={{ ...cellStyle, color: C.gold, fontWeight: 600 }}>{run.linked}</td>
            <td style={{ ...cellStyle, color: C.blue }}>{run.updated}</td>
            <td style={{ ...cellStyle, color: C.muted }}>{run.skipped}</td>
            <td style={{ ...cellStyle, ...T.mono }}>{run.run_id?.substring(0, 8)}...</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function CollapsibleSection({
  title,
  hint,
  expanded,
  onToggle,
  onSelectAll,
  allSelected,
  children,
}: {
  title: string
  hint: string
  expanded: boolean
  onToggle: () => void
  onSelectAll?: (on: boolean) => void
  allSelected?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ background: C.card, borderRadius: S.radius.lg, border: `1px solid ${C.border}` }}>
      <div
        onClick={onToggle}
        style={{
          padding: "12px 16px",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onSelectAll && (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => { e.stopPropagation(); onSelectAll(!allSelected) }}
              onClick={(e) => e.stopPropagation()}
              style={{ cursor: "pointer" }}
            />
          )}
          <span style={{ ...T.body, fontWeight: 600 }}>{title}</span>
          <span style={{ ...T.small }}>{hint}</span>
        </div>
        <span style={{ ...T.body, color: C.muted }}>{expanded ? "▼" : "▶"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "0 16px 16px", maxHeight: 600, overflowY: "auto" }}>
          {children}
        </div>
      )}
    </div>
  )
}

interface Column {
  key: string
  label: string
  mono?: boolean
}

function ResultTable({ rows, columns }: { rows: MatchResult[]; columns: Column[] }) {
  const MAX_DISPLAY = 200
  const displayRows = rows.slice(0, MAX_DISPLAY)

  return (
    <>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            {columns.map((col) => (
              <th key={col.key} style={thStyle}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, i) => (
            <tr key={row.discogs_id}>
              <td style={{ ...cellStyle, color: C.muted }}>{i + 1}</td>
              {columns.map((col) => {
                const val = (row as Record<string, unknown>)[col.key]
                const display = val != null ? String(val) : "—"
                return (
                  <td key={col.key} style={col.mono ? { ...cellStyle, ...T.mono } : cellStyle}>
                    {col.key === "discogs_id" ? (
                      <a
                        href={`https://www.discogs.com/release/${val}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: C.blue, textDecoration: "none" }}
                      >
                        {display}
                      </a>
                    ) : (
                      display
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > MAX_DISPLAY && (
        <div style={{ ...T.small, padding: "8px 0" }}>
          Showing {MAX_DISPLAY} of {fmtNum(rows.length)} entries.
        </div>
      )}
    </>
  )
}

// ─── Shared styles ───────────────────────────────────────────────────────────

const cellStyle: React.CSSProperties = {
  ...T.body,
  padding: S.cellPadding,
  borderBottom: `1px solid ${C.border}`,
}

const thStyle: React.CSSProperties = {
  ...T.micro,
  color: C.muted,
  padding: S.cellPadding,
  borderBottom: `1px solid ${C.border}`,
  textAlign: "left" as const,
}

export default DiscogsImportPage
