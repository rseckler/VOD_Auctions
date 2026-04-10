// Shared components + hooks for the Discogs Import admin route.
// Phase progress bar, phase stepper, live log, resume banner, SSE reader hook.

import { useCallback, useEffect, useRef, useState } from "react"
import { C, fmtNum } from "./admin-tokens"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ImportEvent {
  type: string
  phase: string
  timestamp: string
  [key: string]: unknown
}

export interface SessionStatus {
  id: string
  collection_name: string
  filename: string
  format_detected?: string | null
  export_type?: string | null
  status: string
  row_count: number
  unique_count: number
  parse_progress: Record<string, unknown> | null
  fetch_progress: Record<string, unknown> | null
  analyze_progress: Record<string, unknown> | null
  commit_progress: Record<string, unknown> | null
  analysis_result: Record<string, unknown> | null
  cancel_requested: boolean
  pause_requested: boolean
  last_error: Array<Record<string, unknown>> | null
  run_id: string | null
  created_at: string
  updated_at: string
}

// ─── SSE Reader hook ────────────────────────────────────────────────────────
// Reads an SSE stream from a POST endpoint and emits events via onEvent callback.
// Returns { running, start, stop }.

export function useSSEPostReader() {
  const abortRef = useRef<AbortController | null>(null)
  const [running, setRunning] = useState(false)

  const start = useCallback(
    async (
      url: string,
      body: Record<string, unknown>,
      onEvent: (evt: ImportEvent) => void,
      extraHeaders: Record<string, string> = {}
    ) => {
      setRunning(true)
      abortRef.current = new AbortController()
      try {
        const resp = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...extraHeaders,
          },
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
        })
        if (!resp.ok || !resp.body) {
          const text = await resp.text().catch(() => "")
          throw new Error(
            `HTTP ${resp.status} ${resp.statusText}${text ? ": " + text.slice(0, 200) : ""}`
          )
        }
        const reader = resp.body.getReader()
        const dec = new TextDecoder()
        let buf = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split("\n")
          buf = lines.pop() || ""
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            try {
              const evt = JSON.parse(line.slice(6)) as ImportEvent
              onEvent(evt)
            } catch {
              /* skip */
            }
          }
        }
      } finally {
        setRunning(false)
        abortRef.current = null
      }
    },
    []
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { running, start, stop }
}

// ─── ImportPhaseStepper ────────────────────────────────────────────────────
// Horizontal stepper showing the 5-phase workflow.

export type PhaseKey = "upload" | "fetch" | "analyze" | "review" | "import"
export type PhaseState = "pending" | "active" | "completed" | "error"

interface StepperProps {
  phases: Array<{ key: PhaseKey; label: string; state: PhaseState }>
  onPhaseClick?: (key: PhaseKey) => void
}

export function ImportPhaseStepper({ phases, onPhaseClick }: StepperProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 0",
        marginBottom: 12,
        flexWrap: "wrap",
      }}
    >
      {phases.map((p, i) => {
        const color =
          p.state === "completed"
            ? C.success
            : p.state === "active"
              ? C.gold
              : p.state === "error"
                ? C.error
                : C.muted
        const bg =
          p.state === "completed"
            ? C.success + "22"
            : p.state === "active"
              ? C.gold + "22"
              : "transparent"
        const clickable = p.state === "completed" && !!onPhaseClick
        return (
          <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={clickable ? () => onPhaseClick!(p.key) : undefined}
              disabled={!clickable}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${color}`,
                background: bg,
                color,
                fontSize: 12,
                fontWeight: 600,
                cursor: clickable ? "pointer" : "default",
              }}
            >
              <span style={{ fontFamily: "monospace", opacity: 0.7 }}>{i + 1}</span>
              {p.state === "completed" && <span>✓</span>}
              {p.state === "active" && (
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: color,
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
              )}
              {p.state === "error" && <span>✗</span>}
              <span>{p.label}</span>
            </button>
            {i < phases.length - 1 && (
              <span style={{ color: C.border, fontSize: 14 }}>→</span>
            )}
          </div>
        )
      })}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </div>
  )
}

// ─── ImportPhaseProgressBar ────────────────────────────────────────────────

interface ProgressBarProps {
  label: string
  current: number
  total: number
  sublabel?: string
  etaMin?: number
  phase?: string
}

export function ImportPhaseProgressBar({
  label,
  current,
  total,
  sublabel,
  etaMin,
  phase,
}: ProgressBarProps) {
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          marginBottom: 4,
          alignItems: "baseline",
        }}
      >
        <span style={{ fontWeight: 600 }}>
          {label}
          {phase && <span style={{ color: C.muted, fontWeight: 400 }}> · {phase}</span>}
        </span>
        <span style={{ fontFamily: "monospace", color: C.muted }}>
          {fmtNum(current)} / {fmtNum(total)} ({pct.toFixed(1)}%)
          {etaMin != null && etaMin > 0 && <span> · ~{etaMin} min left</span>}
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: C.border,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: pct + "%",
            background: C.gold,
            borderRadius: 3,
            transition: "width 0.3s",
          }}
        />
      </div>
      {sublabel && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sublabel}</div>
      )}
    </div>
  )
}

// ─── ImportLiveLog ──────────────────────────────────────────────────────────
// Scrollable log panel with last N events (default 50). Auto-scrolls to bottom
// unless user manually scrolls up (pauses auto-scroll).

interface LiveLogProps {
  events: ImportEvent[]
  maxHeight?: number
  filter?: "all" | "progress" | "errors"
  onFilterChange?: (f: "all" | "progress" | "errors") => void
}

export function ImportLiveLog({ events, maxHeight = 260, filter = "all", onFilterChange }: LiveLogProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const autoScrollRef = useRef(true)

  const filtered = events.filter((e) => {
    if (filter === "all") return true
    if (filter === "errors") return e.type.includes("error") || e.type === "rollback" || e.type === "cancelled"
    if (filter === "progress") return e.type === "progress" || e.type.startsWith("phase_")
    return true
  })

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filtered.length])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
    autoScrollRef.current = atBottom
  }

  return (
    <div
      style={{
        background: C.card,
        borderRadius: 8,
        border: "1px solid " + C.border,
        marginTop: 12,
      }}
    >
      <div
        style={{
          padding: "8px 14px",
          borderBottom: "1px solid " + C.border,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: C.muted }}>
          Live Log ({filtered.length} events)
        </span>
        {onFilterChange && (
          <div style={{ display: "flex", gap: 4 }}>
            {(["all", "progress", "errors"] as const).map((f) => (
              <button
                type="button"
                key={f}
                onClick={() => onFilterChange(f)}
                style={{
                  padding: "2px 10px",
                  borderRadius: 4,
                  border: "1px solid " + C.border,
                  background: filter === f ? C.gold + "22" : "transparent",
                  color: filter === f ? C.gold : C.muted,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          maxHeight,
          overflowY: "auto",
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          padding: "6px 14px",
          lineHeight: 1.6,
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ color: C.muted, fontStyle: "italic", fontFamily: "system-ui" }}>
            Waiting for events…
          </div>
        ) : (
          filtered.slice(-200).map((e, i) => {
            const ts = e.timestamp ? new Date(e.timestamp).toISOString().substring(11, 23) : ""
            const isError = e.type.includes("error") || e.type === "rollback" || e.type === "cancelled"
            const color = isError ? C.error : e.type.startsWith("phase_") ? C.gold : C.text
            return (
              <div key={i} style={{ color, whiteSpace: "pre-wrap" }}>
                <span style={{ color: C.muted }}>{ts}</span>{" "}
                <span style={{ color: C.muted }}>{e.phase}</span>{" "}
                <span style={{ fontWeight: 600 }}>{e.type}</span>{" "}
                {formatEventPayload(e)}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function formatEventPayload(e: ImportEvent): string {
  const { type: _t, phase: _p, timestamp: _ts, ...rest } = e
  const parts: string[] = []
  for (const [k, v] of Object.entries(rest)) {
    if (v == null) continue
    if (typeof v === "object") continue
    parts.push(`${k}=${String(v)}`)
  }
  return parts.join(" ")
}

// ─── SessionResumeBanner ───────────────────────────────────────────────────
// Shows when an active session is found on page load.

interface ResumeBannerProps {
  session: SessionStatus
  onResume: () => void
  onAbandon: () => void
}

export function SessionResumeBanner({ session, onResume, onAbandon }: ResumeBannerProps) {
  const startedAt = new Date(session.created_at)
  const ageMin = Math.round((Date.now() - startedAt.getTime()) / 60000)
  const ageStr = ageMin < 1 ? "just now" : ageMin < 60 ? `${ageMin} min ago` : `${Math.round(ageMin / 60)} h ago`

  // Contextual button label based on session status.
  // Maps the session state to the next action the user would take.
  const resumeLabel = (() => {
    switch (session.status) {
      case "uploaded":  return "Start Fetch"
      case "fetching":  return "Resume Fetch"
      case "fetched":   return "Start Analysis"
      case "analyzing": return "Resume Analysis"
      case "analyzed":  return "Continue to Review"
      case "importing": return "Review & Re-Import"
      default:          return "Resume"
    }
  })()

  const progressStr = (() => {
    if (session.status === "fetching" && session.fetch_progress) {
      const p = session.fetch_progress as { current?: number; total?: number }
      return `fetching ${p.current ?? 0}/${p.total ?? 0}`
    }
    if (session.status === "analyzing" && session.analyze_progress) {
      const p = session.analyze_progress as { phase?: string; rows_processed?: number; total_rows?: number }
      return `analyzing ${p.phase || ""} ${p.rows_processed ?? 0}/${p.total_rows ?? 0}`
    }
    if (session.status === "importing" && session.commit_progress) {
      const p = session.commit_progress as { phase?: string; current?: number; total?: number }
      return `importing ${p.phase || ""} ${p.current ?? 0}/${p.total ?? 0}`
    }
    return session.status
  })()

  return (
    <div
      style={{
        background: C.gold + "18",
        border: "1px solid " + C.gold,
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 16,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          Active import session: {session.collection_name}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
          {progressStr} · started {ageStr} · {fmtNum(session.unique_count)} releases
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onResume}
          style={{
            padding: "6px 14px",
            borderRadius: 4,
            border: "1px solid " + C.gold,
            background: C.gold,
            color: "#1c1915",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {resumeLabel}
        </button>
        <button
          type="button"
          onClick={onAbandon}
          style={{
            padding: "6px 14px",
            borderRadius: 4,
            border: "1px solid " + C.border,
            background: "transparent",
            color: C.muted,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Abandon
        </button>
      </div>
    </div>
  )
}

// ─── Session polling hook ───────────────────────────────────────────────────
// Used for: (1) initial resume detection, (2) reconnect-fallback when SSE drops.

export function useSessionPolling(
  sessionId: string | null,
  enabled: boolean,
  onEvents: (evts: ImportEvent[]) => void,
  onStatus: (status: SessionStatus) => void,
  intervalMs = 2000
) {
  const lastEventIdRef = useRef<number>(0)

  useEffect(() => {
    if (!sessionId || !enabled) return
    let cancelled = false

    const poll = async () => {
      try {
        const url =
          `/admin/discogs-import/session/${sessionId}/status?limit=100` +
          (lastEventIdRef.current ? `&since_id=${lastEventIdRef.current}` : "")
        const resp = await fetch(url, { credentials: "include" })
        if (!resp.ok || cancelled) return
        const data = (await resp.json()) as {
          session: SessionStatus
          events: Array<{ id: number; phase: string; event_type: string; payload: Record<string, unknown>; created_at: string }>
        }
        onStatus(data.session)
        if (data.events && data.events.length > 0) {
          const lastId = data.events[data.events.length - 1].id
          if (lastId > lastEventIdRef.current) lastEventIdRef.current = lastId
          onEvents(
            data.events.map((e) => ({
              type: e.event_type,
              phase: e.phase,
              timestamp: e.created_at,
              ...(e.payload || {}),
            }))
          )
        }
      } catch {
        /* ignore poll errors */
      }
    }

    poll()
    const timer = setInterval(poll, intervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [sessionId, enabled, intervalMs, onEvents, onStatus])
}

// ─── localStorage helpers ───────────────────────────────────────────────────

const LS_KEY = "discogs_import_active_session"

export function saveActiveSessionId(id: string, collection: string) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ id, collection, started_at: new Date().toISOString() }))
  } catch {
    /* ignore */
  }
}

export function loadActiveSessionId(): { id: string; collection: string; started_at: string } | null {
  try {
    const s = localStorage.getItem(LS_KEY)
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}

export function clearActiveSessionId() {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}
