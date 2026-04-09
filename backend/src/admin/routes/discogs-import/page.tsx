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

  // Commit state
  const [committing, setCommitting] = useState(false)
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)

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
    if (!confirm("Are you sure you want to import? This will write to the database.")) return

    setCommitting(true)
    setError(null)

    try {
      const resp = await fetch("/admin/discogs-import/commit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: uploadResult.session_id }),
      })

      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `Import failed (${resp.status})`)
      setCommitResult(data)
      setHistory(null) // refresh on next visit
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setCommitting(false)
    }
  }, [uploadResult])

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
            onCommit={handleCommit}
            committing={committing}
            commitResult={commitResult}
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

function AnalysisTab({
  analysis,
  expanded,
  setExpanded,
  onCommit,
  committing,
  commitResult,
}: {
  analysis: AnalysisResult | null
  expanded: Record<string, boolean>
  setExpanded: (v: Record<string, boolean>) => void
  onCommit: () => void
  committing: boolean
  commitResult: CommitResult | null
}) {
  if (!analysis) {
    return <EmptyState icon="📊" title="No analysis yet" description="Upload a file and click 'Start Analysis' first." />
  }

  const s = analysis.summary
  const canCommit = s.new > 0 || s.linkable > 0

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
        >
          <ResultTable
            rows={analysis.new}
            columns={[
              { key: "artist", label: "Artist" },
              { key: "title", label: "Title" },
              { key: "year", label: "Year" },
              { key: "format", label: "Format" },
              { key: "discogs_id", label: "Discogs ID", mono: true },
            ]}
          />
        </CollapsibleSection>
      )}

      {/* LINKABLE */}
      {analysis.linkable.length > 0 && (
        <CollapsibleSection
          title={`Linkable (${fmtNum(s.linkable)})`}
          hint="Existing release matched — discogs_id will be added"
          expanded={expanded.linkable}
          onToggle={() => setExpanded({ ...expanded, linkable: !expanded.linkable })}
        >
          <ResultTable
            rows={analysis.linkable}
            columns={[
              { key: "db_release_id", label: "DB Release ID", mono: true },
              { key: "artist", label: "Artist" },
              { key: "title", label: "Title" },
              { key: "discogs_id", label: "Discogs ID", mono: true },
            ]}
          />
        </CollapsibleSection>
      )}

      {/* EXISTING */}
      {analysis.existing.length > 0 && (
        <CollapsibleSection
          title={`Existing (${fmtNum(s.existing)})`}
          hint="Already in DB — prices + community data will be updated"
          expanded={expanded.existing}
          onToggle={() => setExpanded({ ...expanded, existing: !expanded.existing })}
        >
          <ResultTable
            rows={analysis.existing}
            columns={[
              { key: "db_release_id", label: "DB Release ID", mono: true },
              { key: "artist", label: "Artist" },
              { key: "title", label: "Title" },
              { key: "discogs_id", label: "Discogs ID", mono: true },
            ]}
          />
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

      {/* Commit */}
      {!commitResult && (
        <div style={{ marginTop: S.gap.md }}>
          <Btn
            label={committing ? "Importing..." : "Confirm Import"}
            variant="gold"
            disabled={!canCommit || committing}
            onClick={onCommit}
          />
          {!canCommit && (
            <span style={{ ...T.small, marginLeft: 12 }}>
              Nothing to import — all releases are already in the database.
            </span>
          )}
        </div>
      )}
    </div>
  )
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
  children,
}: {
  title: string
  hint: string
  expanded: boolean
  onToggle: () => void
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
        <div>
          <span style={{ ...T.body, fontWeight: 600 }}>{title}</span>
          <span style={{ ...T.small, marginLeft: 8 }}>{hint}</span>
        </div>
        <span style={{ ...T.body, color: C.muted }}>{expanded ? "▼" : "▶"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "0 16px 16px", maxHeight: 500, overflowY: "auto" }}>
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
