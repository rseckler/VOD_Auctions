import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useAdminNav } from "../../components/admin-nav"
import { C, fmtDate, fmtNum } from "../../components/admin-tokens"
import { PageHeader, PageShell, Tabs, StatsGrid } from "../../components/admin-layout"
import { Btn, Alert, EmptyState, inputStyle } from "../../components/admin-ui"
import {
  useSSEPostReader,
  useSessionPolling,
  ImportPhaseStepper,
  ImportPhaseProgressBar,
  ImportLiveLog,
  SessionResumeBanner,
  saveActiveSessionId,
  loadActiveSessionId,
  clearActiveSessionId,
  type ImportEvent,
  type SessionStatus,
  type PhaseKey,
  type PhaseState,
} from "../../components/discogs-import"

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface UploadResult {
  session_id: string
  row_count: number
  unique_discogs_ids: number
  format_detected: string
  export_type?: string
  already_cached?: number
  to_fetch?: number
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

/* ─── Styles ────────────────────────────────────────────────────────────────── */

const cell: React.CSSProperties = { fontSize: 13, padding: "10px 14px", borderBottom: "1px solid " + C.border }
const th: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: C.muted, padding: "10px 14px", borderBottom: "1px solid " + C.border, textAlign: "left" as const }
const dlabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: C.muted, marginBottom: 2 }

const CONDITIONS = ["M/M", "NM/NM", "VG+/VG+", "VG+/VG", "VG/VG", "VG/G+", "G+/G+", "G/G", "F/F"]

/* ─── Main ──────────────────────────────────────────────────────────────────── */

const DiscogsImportPage = () => {
  useAdminNav()
  const navigate = useNavigate()

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
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  // ── Progress state (shared across all phases) ──
  const [events, setEvents] = useState<ImportEvent[]>([])
  const [logFilter, setLogFilter] = useState<"all" | "progress" | "errors">("all")
  const [currentPhase, setCurrentPhase] = useState<PhaseKey>("upload")
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null)

  // Upload progress
  const [parseProgress, setParseProgress] = useState<{ rows: number; total: number } | null>(null)

  // Fetch progress
  const [fetching, setFetching] = useState(false)
  const [fetchProgress, setFetchProgress] = useState<{ current: number; total: number; fetched: number; cached: number; errors: number; artist?: string; title?: string; eta_min?: number } | null>(null)
  const [fetchResult, setFetchResult] = useState<{ fetched: number; cached: number; errors: number; duration_min: number } | null>(null)

  // Analyze progress
  const [analyzeProgress, setAnalyzeProgress] = useState<{ phase?: string; batch?: number; total_batches?: number; rows_processed?: number; total_rows?: number; matches_so_far?: number } | null>(null)

  // Commit progress
  const [commitProgress, setCommitProgress] = useState<{ phase?: string; current?: number; total?: number; last?: string; plan?: { existing: number; linkable: number; new: number } } | null>(null)

  // ── Resume detection ──
  const [resumeCandidate, setResumeCandidate] = useState<SessionStatus | null>(null)

  // SSE readers
  const uploadSSE = useSSEPostReader()
  const fetchSSE = useSSEPostReader()
  const analyzeSSE = useSSEPostReader()
  const commitSSE = useSSEPostReader()

  // Polling active when SSE not running but session is active
  const [pollingEnabled, setPollingEnabled] = useState(false)
  const [pollingInitialEventId, setPollingInitialEventId] = useState(0)
  const activeSessionId = uploadResult?.session_id || null

  useSessionPolling(
    activeSessionId,
    pollingEnabled,
    useCallback((evts: ImportEvent[]) => {
      if (evts.length > 0) setEvents((prev) => [...prev, ...evts].slice(-500))
    }, []),
    useCallback((st: SessionStatus) => {
      setSessionStatus(st)
      // Apply progress from session state (fallback for when SSE is dropped)
      if (st.fetch_progress) setFetchProgress(st.fetch_progress as typeof fetchProgress)
      if (st.analyze_progress) setAnalyzeProgress(st.analyze_progress as typeof analyzeProgress)
      if (st.commit_progress) setCommitProgress(st.commit_progress as typeof commitProgress)

      // ── Phase transitions detected via polling ──
      // When the backend moves from an active state (fetching/analyzing/importing)
      // to a terminal state, we need to update the UI state that would normally
      // be set by the SSE "complete" event (fetchResult, analysis, commitResult).
      if (st.status === "fetched") {
        setFetching(false)
        if (st.fetch_progress && !fetchResult) {
          const fp = st.fetch_progress as { fetched?: number; cached?: number; errors?: number }
          setFetchResult({
            fetched: fp.fetched ?? 0,
            cached: fp.cached ?? 0,
            errors: fp.errors ?? 0,
            duration_min: 0,
          })
        }
        // Polling can stop now — user decides when to proceed to analyze
        setPollingEnabled(false)
      }
      if (st.status === "analyzed") {
        setAnalyzing(false)
        if (st.analysis_result && !analysis) {
          const ar = st.analysis_result as AnalysisResult
          setAnalysis(ar)
          const ids = new Set<number>()
          for (const r of [...ar.new, ...ar.linkable, ...ar.existing]) ids.add(r.discogs_id)
          setSelectedIds(ids)
          setTab("Analysis")
          setCurrentPhase("review")
        }
        // Polling can stop now — user reviews then clicks Import
        setPollingEnabled(false)
      }
      if (st.status === "done") {
        setCommitting(false)
        // Build commitResult from commit_progress counters if not already set
        if (!commitResult && st.commit_progress) {
          const cp = st.commit_progress as {
            run_id?: string
            counters?: { inserted?: number; linked?: number; updated?: number; skipped?: number; errors?: number }
          }
          if (cp.counters) {
            setCommitResult({
              run_id: cp.run_id || "",
              collection: st.collection_name,
              inserted: cp.counters.inserted ?? 0,
              linked: cp.counters.linked ?? 0,
              updated: cp.counters.updated ?? 0,
              skipped: cp.counters.skipped ?? 0,
              errors: cp.counters.errors ?? 0,
            })
          }
        }
        clearActiveSessionId()
        setPollingEnabled(false)
      }
      if (st.status === "error" || st.status === "abandoned") {
        setFetching(false)
        setAnalyzing(false)
        setCommitting(false)
        setPollingEnabled(false)
      }
    }, [fetchResult, analysis, commitResult]),
    2000,
    pollingInitialEventId
  )

  // ── Initial mount: check for resumable sessions ──
  //
  // Two cases:
  //
  // 1. ACTIVE running session (status in fetching/analyzing/importing):
  //    The backend loop is still running (SSEStream catches write errors and
  //    keeps going — see lib/discogs-import.ts SSEStream.emit). We must NOT
  //    start a new POST (would create a second loop running in parallel).
  //    Instead we RE-ATTACH via polling: restore UI state from DB, enable
  //    useSessionPolling, and let the live log + progress bars rebuild from
  //    import_event + session.*_progress columns. No banner.
  //
  // 2. DORMANT session (status in uploaded/fetched/analyzed):
  //    Nothing is running. User needs to explicitly continue — show the
  //    resume banner with context-aware label ("Start Fetch", "Continue to
  //    Review", etc.).
  //
  // localStorage is a "preferred session" hint: if saved id is in the active
  // list, prioritize it; otherwise fall back to the newest non-terminal.
  useEffect(() => {
    const loadResumable = async () => {
      try {
        const historyResp = await fetch("/admin/discogs-import/history", { credentials: "include" })
        if (!historyResp.ok) return
        const data = await historyResp.json() as {
          active_sessions?: Array<{ id: string; collection_name: string; status: string }>
        }
        const active = data.active_sessions || []
        if (active.length === 0) {
          clearActiveSessionId()
          return
        }

        const saved = loadActiveSessionId()
        const preferred = saved && active.find((s) => s.id === saved.id)
        const chosen = preferred || active[0]

        // Fetch full session state WITH recent events so we can rebuild UI
        const statusResp = await fetch(
          `/admin/discogs-import/session/${chosen.id}/status?limit=200`,
          { credentials: "include" }
        )
        if (!statusResp.ok) return
        const statusData = await statusResp.json() as {
          session: SessionStatus
          events?: Array<{ id: number; phase: string; event_type: string; payload: Record<string, unknown>; created_at: string }>
        }
        const st = statusData?.session
        if (!st) return
        if (["done", "error", "abandoned"].includes(st.status)) return

        // Rebuild core UI state (same regardless of active vs dormant)
        setUploadResult({
          session_id: st.id,
          row_count: st.row_count,
          unique_discogs_ids: st.unique_count,
          format_detected: st.format_detected || "",
          sample_rows: [],
        })
        setCollectionName(st.collection_name)

        // Recent events → live log
        const rawEvents = statusData.events || []
        const eventsFromDb: ImportEvent[] = rawEvents.map((e) => ({
          type: e.event_type,
          phase: e.phase as ImportEvent["phase"],
          timestamp: e.created_at,
          ...(e.payload || {}),
        }))
        setEvents(eventsFromDb.slice(-500))

        // Set initial event ID so polling picks up where we left off (no duplicates)
        const maxEventId = rawEvents.length > 0
          ? Math.max(...rawEvents.map((e) => e.id))
          : 0
        setPollingInitialEventId(maxEventId)

        // Restore progress snapshots
        if (st.fetch_progress) setFetchProgress(st.fetch_progress as typeof fetchProgress)
        if (st.analyze_progress) setAnalyzeProgress(st.analyze_progress as typeof analyzeProgress)
        if (st.commit_progress) setCommitProgress(st.commit_progress as typeof commitProgress)
        setSessionStatus(st)

        const ACTIVE_STATES = new Set(["fetching", "analyzing", "importing"])
        if (ACTIVE_STATES.has(st.status)) {
          // ── AUTO-ATTACH: backend loop is running, we just reconnect ──
          saveActiveSessionId(st.id, st.collection_name)
          if (st.status === "fetching") {
            setCurrentPhase("fetch")
            setFetching(true)
          } else if (st.status === "analyzing") {
            setCurrentPhase("analyze")
            setAnalyzing(true)
          } else {
            // importing → review tab with commit progress
            setCurrentPhase("review")
            setCommitting(true)
            // Restore analysis_result so Review tab has data to render
            if (st.analysis_result) {
              const ar = st.analysis_result as AnalysisResult
              setAnalysis(ar)
              const ids = new Set<number>()
              for (const r of [...ar.new, ...ar.linkable, ...ar.existing]) ids.add(r.discogs_id)
              setSelectedIds(ids)
              setTab("Analysis")
            }
          }
          setPollingEnabled(true)  // useSessionPolling takes over
          // NO resumeCandidate — we're already attached

          // Stale-loop detection: if last_event_at > 60s ago the backend
          // loop has likely died (process restart, OOM). Re-trigger the
          // POST for fetch — the route's idempotency check restarts stale
          // loops. Analyze/commit use SSE still and need user action.
          const lastEvent = st.last_event_at
            ? new Date(st.last_event_at).getTime()
            : 0
          const ageSec = (Date.now() - lastEvent) / 1000
          if (st.status === "fetching" && ageSec > 60) {
            console.log(`[discogs-import] Stale fetch loop detected (${Math.round(ageSec)}s), restarting`)
            fetch("/admin/discogs-import/fetch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ session_id: st.id }),
            }).catch((err) => {
              console.error("[discogs-import] Stale restart failed:", err)
            })
          }
        } else {
          // ── DORMANT: user needs to click Resume ──
          setResumeCandidate(st)
        }
      } catch {
        /* ignore — no blocking */
      }
    }
    loadResumable()
  }, [])

  // ── Helper: push event to log ──
  const pushEvent = useCallback((evt: ImportEvent) => {
    setEvents((prev) => [...prev, evt].slice(-500))
  }, [])

  // ── Phase stepper state ──
  const phaseStates = useCallback((): Array<{ key: PhaseKey; label: string; state: PhaseState }> => {
    const s = (k: PhaseKey): PhaseState => {
      if (k === currentPhase) return "active"
      const order: PhaseKey[] = ["upload", "fetch", "analyze", "review", "import"]
      const currentIdx = order.indexOf(currentPhase)
      const thisIdx = order.indexOf(k)
      if (thisIdx < currentIdx) return "completed"
      return "pending"
    }
    const isDone = commitResult != null
    return [
      { key: "upload", label: "Upload", state: uploadResult ? "completed" : s("upload") },
      { key: "fetch", label: "Fetch", state: fetchResult ? "completed" : s("fetch") },
      { key: "analyze", label: "Analyze", state: analysis ? "completed" : s("analyze") },
      { key: "review", label: "Review", state: isDone ? "completed" : (analysis ? "active" : "pending") },
      { key: "import", label: "Import", state: isDone ? "completed" : s("import") },
    ]
  }, [currentPhase, uploadResult, fetchResult, analysis, commitResult])

  // ── Upload handler (SSE-enabled) ──
  const handleUpload = useCallback(async () => {
    if (!file || !collectionName.trim()) return
    setUploading(true)
    setError(null)
    setEvents([])
    setCurrentPhase("upload")
    setParseProgress(null)

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

      let finalResult: UploadResult | null = null
      await uploadSSE.start("/admin/discogs-import/upload", payload, (evt) => {
        pushEvent(evt)
        if (evt.type === "parse_progress") {
          setParseProgress({
            rows: evt.rows_parsed as number,
            total: evt.estimated_total as number,
          })
        } else if (evt.type === "done") {
          finalResult = evt as unknown as UploadResult
        } else if (evt.type === "error") {
          setError(String(evt.error || "Upload failed"))
        }
      })

      if (finalResult) {
        setUploadResult(finalResult)
        saveActiveSessionId((finalResult as UploadResult).session_id, collectionName.trim())
        setCurrentPhase("fetch")
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      setParseProgress(null)
    }
  }, [file, collectionName, uploadSSE, pushEvent])

  // ── Fetch handler (SSE-enabled) ──
  // Fetch handler — DECOUPLED. POSTs to /fetch, which spawns the loop in
  // the background and returns 200 immediately. The loop writes progress
  // to import_event + fetch_progress; we consume them via polling (which
  // also drives the UI state transitions in the polling onStatus callback).
  const handleFetch = useCallback(async () => {
    if (!uploadResult) return
    setFetching(true)
    setFetchProgress(null)
    setFetchResult(null)
    setError(null)
    setCurrentPhase("fetch")
    saveActiveSessionId(uploadResult.session_id, collectionName)

    try {
      const resp = await fetch("/admin/discogs-import/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ session_id: uploadResult.session_id }),
      })
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
        throw new Error(errBody.error || `Failed to start fetch (HTTP ${resp.status})`)
      }
      // Enable polling — useSessionPolling takes over from here. The
      // polling onStatus callback will set fetchResult and move to the
      // analyze phase when status transitions to "fetched".
      setPollingInitialEventId(0)
      setPollingEnabled(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Fetch failed")
      setFetching(false)
    }
  }, [uploadResult, collectionName])

  // ── Analyze handler — DECOUPLED (rc19) ──
  // POSTs to /analyze, receives 200 JSON, enables polling. Backend runs
  // loop as detached task — survives client navigation.
  const handleAnalyze = useCallback(async () => {
    if (!uploadResult) return
    setAnalyzing(true)
    setError(null)
    setAnalyzeProgress(null)
    setCurrentPhase("analyze")
    saveActiveSessionId(uploadResult.session_id, collectionName)

    try {
      const resp = await fetch("/admin/discogs-import/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ session_id: uploadResult.session_id }),
      })
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
        throw new Error(errBody.error || `Failed to start analyze (HTTP ${resp.status})`)
      }
      // Enable polling — transitions handled in the polling onStatus callback
      setPollingInitialEventId(0)
      setPollingEnabled(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Analysis failed")
      setAnalyzing(false)
    }
  }, [uploadResult, collectionName])

  // ── Commit handler — DECOUPLED (rc19) ──
  // POSTs to /commit, receives 200 JSON, enables polling. Backend runs
  // the per-batch commit loop as detached task.
  const handleCommit = useCallback(async () => {
    if (!uploadResult) return
    if (!confirm(`Import ${selectedIds.size} releases? This will write to the database.`)) return
    setCommitting(true)
    setCommitProgress(null)
    setError(null)
    setCurrentPhase("import")
    saveActiveSessionId(uploadResult.session_id, collectionName)

    try {
      const [mc, sc] = condition.split("/")
      const resp = await fetch("/admin/discogs-import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          session_id: uploadResult.session_id,
          selected_discogs_ids: Array.from(selectedIds),
          media_condition: mc.trim(),
          sleeve_condition: sc.trim(),
          inventory: inventoryOn ? 1 : 0,
          price_markup: priceMarkup,
        }),
      })
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
        throw new Error(errBody.error || `Failed to start commit (HTTP ${resp.status})`)
      }
      // Enable polling — transition to commitResult handled in polling callback
      setPollingInitialEventId(0)
      setPollingEnabled(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed")
      setCommitting(false)
    }
  }, [uploadResult, selectedIds, condition, inventoryOn, priceMarkup, collectionName])

  // ── Cancel / Pause handlers ──
  const handleCancel = useCallback(async () => {
    if (!uploadResult) return
    if (!confirm("Cancel the running operation? Any in-progress transaction will be rolled back.")) return
    try {
      await fetch(`/admin/discogs-import/session/${uploadResult.session_id}/cancel`, {
        method: "POST", credentials: "include",
      })
    } catch { /* ignore */ }
  }, [uploadResult])

  const handlePause = useCallback(async () => {
    if (!uploadResult) return
    try {
      await fetch(`/admin/discogs-import/session/${uploadResult.session_id}/pause`, {
        method: "POST", credentials: "include",
      })
    } catch { /* ignore */ }
  }, [uploadResult])

  const handleResume = useCallback(async () => {
    if (!uploadResult) return
    try {
      await fetch(`/admin/discogs-import/session/${uploadResult.session_id}/resume`, {
        method: "POST", credentials: "include",
      })
    } catch { /* ignore */ }
  }, [uploadResult])

  // ── Resume banner actions ──
  // Real Resume: loads session + events, then auto-triggers the appropriate
  // next operation based on session status. Replaces the old "just show state"
  // behavior which didn't actually restart anything.
  const handleResumeBanner = useCallback(async () => {
    if (!resumeCandidate) return

    // 1. Load full session + recent events
    const resp = await fetch(
      `/admin/discogs-import/session/${resumeCandidate.id}/status?limit=200`,
      { credentials: "include" }
    )
    if (!resp.ok) {
      setError("Failed to load session state")
      setResumeCandidate(null)
      clearActiveSessionId()
      return
    }
    const data = await resp.json() as {
      session: SessionStatus
      events: Array<{ id: number; phase: string; event_type: string; payload: Record<string, unknown>; created_at: string }>
    }
    const st = data.session
    const eventsFromDb: ImportEvent[] = (data.events || []).map((e) => ({
      type: e.event_type,
      phase: e.phase,
      timestamp: e.created_at,
      ...(e.payload || {}),
    }))

    // 2. Restore minimal UI state
    setUploadResult({
      session_id: st.id,
      row_count: st.row_count,
      unique_discogs_ids: st.unique_count,
      format_detected: st.format_detected || "",
      export_type: st.export_type || undefined,
      sample_rows: [],
    })
    setCollectionName(st.collection_name)
    setEvents(eventsFromDb)
    setResumeCandidate(null)
    setError(null)

    // 3. Restore fetch_result if fetch has completed (so UI shows post-fetch state)
    const fp = st.fetch_progress as { current?: number; total?: number; fetched?: number; cached?: number; errors?: number } | null
    if (fp && (st.status === "fetched" || st.status === "analyzing" || st.status === "analyzed" || st.status === "importing")) {
      setFetchResult({
        fetched: fp.fetched ?? 0,
        cached: fp.cached ?? 0,
        errors: fp.errors ?? 0,
        duration_min: 0,
      })
    }

    // 4. Restore analysis if present (for analyzed/importing → Review tab navigation)
    const loadAnalysis = (): boolean => {
      if (!st.analysis_result) return false
      const ar = st.analysis_result as unknown as AnalysisResult
      setAnalysis(ar)
      const ids = new Set<number>()
      for (const r of [...(ar.new || []), ...(ar.linkable || []), ...(ar.existing || [])]) {
        ids.add(r.discogs_id)
      }
      setSelectedIds(ids)
      return true
    }

    // 5. Status-dependent auto-resume
    switch (st.status) {
      case "uploaded":
      case "fetching":
        // Restart fetch loop — backend skips cached IDs automatically via discogs_api_cache
        setCurrentPhase("fetch")
        handleFetch()
        break

      case "fetched":
        // Fetch complete, analyze not yet run — auto-trigger analyze
        setCurrentPhase("analyze")
        handleAnalyze()
        break

      case "analyzing":
        // Analyze was interrupted — safe to re-run (no DB side effects)
        setCurrentPhase("analyze")
        handleAnalyze()
        break

      case "analyzed":
        // Analysis complete, navigate to Review tab
        if (loadAnalysis()) {
          setTab("Analysis")
          setCurrentPhase("review")
        } else {
          // Fallback: analysis_result missing, re-analyze
          setCurrentPhase("analyze")
          handleAnalyze()
        }
        break

      case "importing": {
        // Commit was interrupted. With v5.1 per-batch commits, partial success
        // is possible — completed batches persist in DB, failed batches are
        // lost. Session's import_settings holds the user's exact selection and
        // settings, so we can restore them and resume via the same handleCommit.
        if (loadAnalysis()) {
          // Restore user's saved settings
          const saved = st.import_settings
          if (saved) {
            if (saved.media_condition && saved.sleeve_condition) {
              setCondition(`${saved.media_condition}/${saved.sleeve_condition}`)
            }
            if (saved.inventory != null) setInventoryOn(saved.inventory > 0)
            if (saved.price_markup != null) setPriceMarkup(saved.price_markup)
            if (saved.selected_discogs_ids && saved.selected_discogs_ids.length > 0) {
              setSelectedIds(new Set(saved.selected_discogs_ids))
            }
          }
          setTab("Analysis")
          setCurrentPhase("review")

          // Show status from commit_progress so user knows how far the
          // previous run got. Per-batch commits mean completed batches persist.
          const cp = st.commit_progress as {
            phase?: string
            counters?: { inserted?: number; linked?: number; updated?: number; errors?: number }
          } | null
          if (cp?.counters) {
            const c = cp.counters
            setError(
              `Previous import was interrupted. Partially committed: ` +
              `${c.inserted ?? 0} inserted, ${c.linked ?? 0} linked, ${c.updated ?? 0} updated, ${c.errors ?? 0} errors. ` +
              `Your selection and settings are restored. Click "Approve & Import" — ` +
              `already-committed batches will be skipped automatically.`
            )
          } else {
            setError(
              "The previous import was interrupted. Your selection and settings are restored. " +
              "Click 'Approve & Import' to continue — completed batches (if any) will be skipped automatically."
            )
          }
        } else {
          setCurrentPhase("analyze")
          handleAnalyze()
        }
        break
      }

      default:
        // Unknown status — fallback to upload view
        setCurrentPhase("upload")
        break
    }
  }, [resumeCandidate, handleFetch, handleAnalyze])

  const handleAbandon = useCallback(() => {
    clearActiveSessionId()
    setResumeCandidate(null)
  }, [])

  const toggleId = (id: number) => { const n = new Set(selectedIds); if (n.has(id)) n.delete(id); else n.add(id); setSelectedIds(n) }
  const toggleAll = (rows: MatchRow[], on: boolean) => { const n = new Set(selectedIds); for (const r of rows) { if (on) n.add(r.discogs_id); else n.delete(r.discogs_id) }; setSelectedIds(n) }

  /* ─── Render ─────────────────────────────────────────────────────────────── */

  const isAnyRunning = uploading || fetching || analyzing || committing

  return (
    <PageShell>
      <PageHeader
        title="Discogs Collection Import"
        subtitle="Import releases from Discogs collection exports"
        badge={uploadResult ? { label: fmtNum(uploadResult.unique_discogs_ids) + " releases", color: C.gold } : undefined}
        actions={
          <button
            type="button"
            onClick={() => navigate("/discogs-import/history")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, background: C.card, color: C.text, border: "1px solid " + C.border, borderRadius: 4, cursor: "pointer" }}
          >
            View Collections History →
          </button>
        }
      />

      {/* Resume banner */}
      {resumeCandidate && (
        <SessionResumeBanner
          session={resumeCandidate}
          onResume={handleResumeBanner}
          onAbandon={handleAbandon}
        />
      )}

      {/* Phase stepper — visible once workflow started */}
      {(uploadResult || resumeCandidate) && (
        <ImportPhaseStepper phases={phaseStates()} />
      )}

      <Tabs tabs={["Upload", "Analysis"]} active={tab} onChange={setTab} />
      <div style={{ marginTop: 16 }}>
        {error && <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>}

        {/* ── Upload Tab ─────────────────────────────────────────────── */}
        {tab === "Upload" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ border: "2px dashed " + C.border, borderRadius: 8, padding: "32px 24px", textAlign: "center", background: C.card, cursor: "pointer" }}
              onClick={() => document.getElementById("dfi")?.click()}>
              <input id="dfi" type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setUploadResult(null); setAnalysis(null); setCommitResult(null); setError(null); setEvents([]); setCurrentPhase("upload") } }} />
              <div style={{ fontSize: 13, color: C.muted }}>{file ? <><b style={{ color: C.text }}>{file.name}</b> ({(file.size / 1024).toFixed(0)} KB)</> : "Click to select a Discogs export file (.csv or .xlsx)"}</div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Collection Name *</label>
              <input type="text" value={collectionName} onChange={(e) => setCollectionName(e.target.value)} placeholder='e.g. "Sammlung Müller"' style={{ ...inputStyle, maxWidth: 400 }} />
            </div>

            {/* Upload progress */}
            {uploading && parseProgress && (
              <div style={{ background: C.card, borderRadius: 8, border: "1px solid " + C.border, padding: "14px 18px" }}>
                <ImportPhaseProgressBar
                  label="Parsing file"
                  current={parseProgress.rows}
                  total={parseProgress.total}
                />
              </div>
            )}

            {!uploadResult && (
              <Btn label={uploading ? "Uploading..." : "Upload & Parse"} variant="gold" disabled={!file || !collectionName.trim() || uploading} onClick={handleUpload} />
            )}

            {uploadResult && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <StatsGrid stats={[
                  { label: "Rows Parsed", value: fmtNum(uploadResult.row_count) },
                  { label: "Unique Discogs IDs", value: fmtNum(uploadResult.unique_discogs_ids) },
                  { label: "Format", value: uploadResult.format_detected + (uploadResult.export_type ? " (" + uploadResult.export_type + ")" : "") },
                  ...(uploadResult.already_cached != null ? [
                    { label: "Already Cached", value: fmtNum(uploadResult.already_cached), color: C.success },
                    { label: "To Fetch", value: fmtNum(uploadResult.to_fetch ?? 0), color: uploadResult.to_fetch === 0 ? C.success : C.gold },
                  ] : []),
                ]} />

                {/* Step 2: Fetch Discogs Data */}
                <div style={{ background: C.card, borderRadius: 8, border: "1px solid " + C.border, padding: "16px 18px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Step 2: Fetch Discogs Data</div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
                    Fetches images, tracklist, credits, genres, and prices for each release from the Discogs API.
                    {!fetching && !fetchResult && <> Estimated time: ~{Math.ceil(uploadResult.unique_discogs_ids / 20)} minutes.</>}
                  </div>

                  {fetchProgress && (
                    <ImportPhaseProgressBar
                      label="Fetching Discogs API"
                      current={fetchProgress.current}
                      total={fetchProgress.total}
                      etaMin={fetchProgress.eta_min}
                      sublabel={
                        (fetchProgress.artist ? `${fetchProgress.artist} — ${fetchProgress.title}` : "") +
                        `  ·  fetched: ${fetchProgress.fetched} · cached: ${fetchProgress.cached} · errors: ${fetchProgress.errors}`
                      }
                    />
                  )}

                  {fetchResult && (
                    <Alert type="success">
                      Fetch complete! {fetchResult.fetched} fetched, {fetchResult.cached} cached, {fetchResult.errors} errors ({fetchResult.duration_min} min)
                    </Alert>
                  )}

                  {!fetchResult && (
                    <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                      <Btn label={fetching ? "Fetching..." : `Fetch Discogs Data${uploadResult.to_fetch != null ? " (" + fmtNum(uploadResult.to_fetch) + " releases)" : ""}`} variant="gold" onClick={handleFetch} disabled={fetching || analyzing} />
                      <Btn label={analyzing ? "Analyzing..." : "Skip (use cached only)"} variant="ghost" onClick={handleAnalyze} disabled={fetching || analyzing} />
                      {isAnyRunning && (
                        <>
                          <Btn label="Pause" variant="ghost" onClick={handlePause} />
                          <Btn label="Resume" variant="ghost" onClick={handleResume} />
                          <Btn label="Cancel" variant="danger" onClick={handleCancel} />
                        </>
                      )}
                    </div>
                  )}
                  {fetchResult && (
                    <Btn label={analyzing ? "Analyzing..." : "Start Analysis"} onClick={handleAnalyze} disabled={analyzing} />
                  )}

                  {/* Analyze progress under the buttons */}
                  {analyzing && analyzeProgress && (
                    <div style={{ marginTop: 12 }}>
                      <ImportPhaseProgressBar
                        label="Analyzing"
                        phase={String(analyzeProgress.phase || "starting")}
                        current={Number(analyzeProgress.rows_processed || 0)}
                        total={Number(analyzeProgress.total_rows || 0)}
                        sublabel={
                          analyzeProgress.batch != null && analyzeProgress.total_batches != null
                            ? `Batch ${analyzeProgress.batch}/${analyzeProgress.total_batches} · ${analyzeProgress.matches_so_far ?? 0} matches found`
                            : undefined
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Live log visible during any running operation */}
                {(uploading || fetching || analyzing || committing || events.length > 0) && (
                  <ImportLiveLog events={events} filter={logFilter} onFilterChange={setLogFilter} />
                )}
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
                <div style={{
                  background: "linear-gradient(135deg, " + C.success + "14 0%, " + C.success + "05 100%)",
                  border: "1px solid " + C.success + "40",
                  borderRadius: 8,
                  padding: "20px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.success, marginBottom: 4 }}>
                        ✓ Import erfolgreich abgeschlossen
                      </div>
                      <div style={{ fontSize: 13, color: C.muted }}>
                        {commitResult.collection} · Run ID: <code style={{ fontFamily: "monospace", fontSize: 11 }}>{commitResult.run_id.substring(0, 8)}</code>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
                    <div><span style={{ color: C.muted }}>Inserted:</span> <b style={{ color: C.success }}>{fmtNum(commitResult.inserted)}</b></div>
                    <div><span style={{ color: C.muted }}>Linked:</span> <b style={{ color: C.gold }}>{fmtNum(commitResult.linked)}</b></div>
                    <div><span style={{ color: C.muted }}>Updated:</span> <b style={{ color: C.blue }}>{fmtNum(commitResult.updated)}</b></div>
                    {commitResult.skipped > 0 && <div><span style={{ color: C.muted }}>Skipped:</span> <b style={{ color: C.muted }}>{fmtNum(commitResult.skipped)}</b></div>}
                    {commitResult.errors > 0 && <div><span style={{ color: C.muted }}>Errors:</span> <b style={{ color: C.error }}>{fmtNum(commitResult.errors)}</b></div>}
                  </div>

                  {/* Call-to-action buttons */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                    {commitResult.run_id && (
                      <button
                        type="button"
                        onClick={() => navigate(`/discogs-import/history/${encodeURIComponent(commitResult.run_id)}`)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", fontSize: 13, fontWeight: 600, background: C.gold, color: "#1c1915", border: "none", borderRadius: 4, cursor: "pointer" }}
                      >
                        📂 View Imported Collection →
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate("/discogs-import/history")}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", fontSize: 13, fontWeight: 600, background: C.card, color: C.text, border: "1px solid " + C.border, borderRadius: 4, cursor: "pointer" }}
                    >
                      All Collections
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // Reset wizard state for a fresh import
                        setFile(null)
                        setCollectionName("")
                        setUploadResult(null)
                        setAnalysis(null)
                        setCommitResult(null)
                        setFetchResult(null)
                        setFetchProgress(null)
                        setAnalyzeProgress(null)
                        setCommitProgress(null)
                        setSelectedIds(new Set())
                        setEvents([])
                        setCurrentPhase("upload")
                        setTab("Upload")
                        setError(null)
                      }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", fontSize: 13, fontWeight: 600, background: "transparent", color: C.muted, border: "1px solid " + C.border, borderRadius: 4, cursor: "pointer" }}
                    >
                      ↻ Start New Import
                    </button>
                  </div>
                </div>
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
                      <select value={condition} onChange={(e) => setCondition(e.target.value)} style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 13 }}>
                        {CONDITIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ fontWeight: 600 }}>Inventory = 1:</span>
                      <input type="checkbox" checked={inventoryOn} onChange={(e) => setInventoryOn(e.target.checked)} />
                      <span style={{ color: C.muted }}>{inventoryOn ? "Stock 1" : "Stock 0"}</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ fontWeight: 600 }}>Price Markup (VG+ x):</span>
                      <select value={priceMarkup} onChange={(e) => setPriceMarkup(parseFloat(e.target.value))} style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 13 }}>
                        {[1.0, 1.1, 1.2, 1.3, 1.5].map((v) => <option key={v} value={v}>{v} ({v === 1 ? "no markup" : "+" + Math.round((v - 1) * 100) + "%"})</option>)}
                      </select>
                    </label>
                  </div>

                  {/* Commit progress */}
                  {committing && commitProgress && (
                    <div>
                      {commitProgress.plan && (
                        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
                          Plan: {commitProgress.plan.existing} updates · {commitProgress.plan.linkable} links · {commitProgress.plan.new} inserts
                        </div>
                      )}
                      <ImportPhaseProgressBar
                        label="Importing"
                        phase={String(commitProgress.phase || "preparing")}
                        current={Number(commitProgress.current || 0)}
                        total={Number(commitProgress.total || 0)}
                        sublabel={commitProgress.last ? String(commitProgress.last) : undefined}
                      />
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Btn label={committing ? `Importing... (${commitProgress?.current ?? 0}/${commitProgress?.total ?? 0})` : `Approve & Import (${selectedIds.size} selected)`} variant="gold" disabled={selectedIds.size === 0 || committing} onClick={handleCommit} />
                    {committing && (
                      <>
                        <Btn label="Pause" variant="ghost" onClick={handlePause} />
                        <Btn label="Resume" variant="ghost" onClick={handleResume} />
                        <Btn label="Cancel (rollback)" variant="danger" onClick={handleCancel} />
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Live log */}
              {(committing || (events.length > 0 && !commitResult)) && (
                <ImportLiveLog events={events} filter={logFilter} onFilterChange={setLogFilter} />
              )}
            </div>
          )
        })()}

      </div>
    </PageShell>
  )

  /* ─── Helper: Collapsible section with checkboxes ────────────────────────── */

  function renderSection(title: string, rows: MatchRow[], hint: string, key: string, showDetail: boolean) {
    if (rows.length === 0) return null
    const allSelected = rows.every((r) => selectedIds.has(r.discogs_id))
    const isExpanded = expanded[key]
    return (
      <div style={{ background: C.card, borderRadius: 8, border: "1px solid " + C.border }}>
        <div onClick={() => setExpanded({ ...expanded, [key]: !isExpanded })} style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {key !== "skipped" && <input type="checkbox" checked={allSelected} onClick={(e) => e.stopPropagation()} onChange={() => toggleAll(rows, !allSelected)} />}
            <span style={{ fontSize: 13, fontWeight: 600 }}>{title} ({fmtNum(rows.length)})</span>
            <span style={{ fontSize: 12, color: C.muted }}>{hint}</span>
          </div>
          <span style={{ color: C.muted }}>{isExpanded ? "▼" : "▶"}</span>
        </div>
        {isExpanded && (
          <div style={{ padding: "0 16px 16px", maxHeight: 600, overflowY: "auto" }}>
            {rows.slice(0, 200).map((row) => {
              const sel = selectedIds.has(row.discogs_id)
              const isExp = expandedRow === row.discogs_id
              const api = row.api_data as Record<string, unknown> | undefined
              const images = (api?.images || []) as Array<{ uri?: string }>
              return (
                <div key={row.discogs_id} style={{ borderBottom: "1px solid " + C.border }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", cursor: showDetail ? "pointer" : "default", opacity: sel ? 1 : 0.5 }}
                    onClick={() => showDetail && setExpandedRow(isExp ? null : row.discogs_id)}>
                    <input type="checkbox" checked={sel} onClick={(e) => e.stopPropagation()} onChange={() => toggleId(row.discogs_id)} />
                    {images[0]?.uri && <img src={String(images[0].uri)} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.artist} — {row.title}</div>
                      <div style={{ fontSize: 12, color: C.muted, display: "flex", gap: 12, alignItems: "center" }}>
                        {row.year && <span>{row.year}</span>}
                        <span>{row.format}</span>
                        {row.match_score != null && row.match_score < 100 && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: row.match_score >= 80 ? C.success + "22" : row.match_score >= 60 ? C.gold + "22" : C.error + "22", color: row.match_score >= 80 ? C.success : row.match_score >= 60 ? C.gold : C.error }}>{row.match_score}% match</span>
                        )}
                        {row.db_release_id && <a href={"https://vod-auctions.com/catalog/" + row.db_release_id} target="_blank" rel="noopener noreferrer" style={{ color: C.gold, textDecoration: "none", fontFamily: "monospace" }} onClick={(e) => e.stopPropagation()}>{row.db_release_id}</a>}
                        <a href={"https://www.discogs.com/release/" + row.discogs_id} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>discogs:{row.discogs_id}</a>
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
          {api.notes != null && <div><div style={dlabel}>Description</div><div style={{ fontSize: 12, maxHeight: 60, overflow: "hidden" }}>{String(api.notes)}</div></div>}
          {tracks.length > 0 && <div><div style={dlabel}>Tracklist ({tracks.length})</div><div style={{ fontSize: 12 }}>{tracks.slice(0, 8).map((t, i) => <div key={i}>{t.position} {t.title} {t.duration ? "(" + t.duration + ")" : ""}</div>)}{tracks.length > 8 && <div style={{ color: C.muted }}>+{tracks.length - 8} more</div>}</div></div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {genres.length > 0 && <div><div style={dlabel}>Genres</div><div style={{ fontSize: 12 }}>{genres.join(", ")}</div></div>}
          {styles.length > 0 && <div><div style={dlabel}>Styles</div><div style={{ fontSize: 12 }}>{styles.join(", ")}</div></div>}
          {formats.length > 0 && <div><div style={dlabel}>Format</div><div style={{ fontSize: 12 }}>{formats.map((f) => [f.name, ...(f.descriptions || [])].join(", ")).join(" + ")}</div></div>}
          {labels.length > 0 && <div><div style={dlabel}>Labels</div><div style={{ fontSize: 12 }}>{labels.map((l) => l.name + " (" + l.catno + ")").join(", ")}</div></div>}
          {credits.length > 0 && <div><div style={dlabel}>Credits ({credits.length})</div><div style={{ fontSize: 12, maxHeight: 60, overflow: "hidden" }}>{credits.slice(0, 5).map((c, i) => <div key={i}>{c.role}: {c.name}</div>)}</div></div>}
          <div><div style={dlabel}>Market Data</div><div style={{ fontSize: 12 }}>{lp != null && <div>Lowest: {Number(lp).toFixed(2)}</div>}<div>For Sale: {String(api.num_for_sale ?? 0)}</div><div>Have: {community.have ?? 0} / Want: {community.want ?? 0}</div></div></div>
        </div>
      </div>
    )
  }
}

export default DiscogsImportPage
