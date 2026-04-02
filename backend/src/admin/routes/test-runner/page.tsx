import { useAdminNav } from "../../components/admin-nav"
import { Container, Heading, Table, Badge, Button, Text } from "@medusajs/ui"
import { useEffect, useState, useRef, useCallback } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

type TestSuite = {
  title: string
  file: string
  specs: TestSpec[]
}

type TestSpec = {
  title: string
  ok: boolean
  tests: TestCase[]
}

type TestCase = {
  title: string
  status: "expected" | "unexpected" | "skipped" | "flaky"
  results: TestResult[]
}

type TestResult = {
  status: string
  duration: number
  error?: { message?: string; stack?: string }
  attachments?: { name: string; path?: string; contentType: string }[]
}

type PlaywrightReport = {
  stats: {
    startTime: string
    duration: number
    expected: number
    unexpected: number
    skipped: number
    flaky: number
  }
  suites: TestSuite[]
}

type HistoryEntry = {
  jobId: string
  date: string
  passed: number
  failed: number
  skipped: number
  total: number
  duration: number
  status: "passed" | "failed"
}

type ApiResponse = {
  report: PlaywrightReport | null
  history: HistoryEntry[]
  reportExists: boolean
  runningJob: { jobId: string; status: string; startTime: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function specLabel(file: string) {
  const parts = file.split("/")
  return parts[parts.length - 1].replace(".spec.ts", "")
}

function flattenTests(suites: TestSuite[]) {
  const failed: Array<{ suite: string; title: string; result: TestResult }> = []
  for (const suite of suites) {
    for (const spec of suite.specs) {
      for (const test of spec.tests) {
        if (test.status === "unexpected") {
          const lastResult = test.results[test.results.length - 1]
          if (lastResult) {
            failed.push({ suite: specLabel(suite.file), title: test.title, result: lastResult })
          }
        }
      }
    }
  }
  return failed
}

function buildSpecSummary(suites: TestSuite[]) {
  return suites.map((suite) => {
    let passed = 0; let failed = 0; let skipped = 0
    for (const spec of suite.specs) {
      for (const test of spec.tests) {
        if (test.status === "expected") passed++
        else if (test.status === "unexpected") failed++
        else skipped++
      }
    }
    return { file: specLabel(suite.file), passed, failed, skipped, total: passed + failed + skipped }
  })
}

function HistoryBar({ entry }: { entry: HistoryEntry }) {
  const total = entry.total || 1
  const passedPct = Math.round((entry.passed / total) * 100)
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-6 h-16 bg-ui-bg-subtle rounded overflow-hidden flex flex-col-reverse">
        <div className="w-full bg-green-500" style={{ height: `${passedPct}%` }} />
        {entry.failed > 0 && (
          <div className="w-full bg-red-500" style={{ height: `${Math.round((entry.failed / total) * 100)}%` }} />
        )}
      </div>
      <span className="text-xs text-ui-fg-muted">
        {new Date(entry.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
      </span>
    </div>
  )
}

// ─── Live Output Terminal ─────────────────────────────────────────────────────

function colorLine(line: string): { text: string; color: string } {
  // Playwright list reporter output patterns
  if (line.includes("passed") && (line.includes("failed") || line.startsWith(" "))) {
    return { text: line, color: "#4ade80" }
  }
  if (/^\s+\d+\s+failed/.test(line) || /✘|FAILED|Error:/.test(line)) {
    return { text: line, color: "#f87171" }
  }
  if (/✓|passed|ok/.test(line)) {
    return { text: line, color: "#4ade80" }
  }
  if (/skipped|pending/.test(line)) {
    return { text: line, color: "#fbbf24" }
  }
  if (/›/.test(line)) {
    return { text: line, color: "#a78bfa" }
  }
  return { text: line, color: "#1f2937" }
}

function LiveTerminal({ lines, status }: { lines: string[]; status: "running" | "completed" | "failed" | null }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [lines.length])

  return (
    <div
      style={{
        background: "#0d1117",
        borderRadius: 8,
        border: "1px solid #30363d",
        padding: "12px 16px",
        fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', monospace",
        fontSize: 12,
        lineHeight: "1.6",
        maxHeight: 420,
        overflowY: "auto",
        color: "#1f2937",
      }}
    >
      {lines.length === 0 && status === "running" && (
        <div style={{ color: "#6b7280" }}>Starting Playwright… (this takes ~2-5 min)</div>
      )}
      {lines.map((line, i) => {
        const { text, color } = colorLine(line)
        return (
          <div key={i} style={{ color, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {text}
          </div>
        )
      })}
      {status === "running" && (
        <div style={{ color: "#6b7280", display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#fbbf24", animation: "pulse 1s infinite" }} />
          Running…
        </div>
      )}
      {status === "completed" && (
        <div style={{ color: "#4ade80", marginTop: 4, fontWeight: 600 }}>✓ Run completed</div>
      )}
      {status === "failed" && (
        <div style={{ color: "#f87171", marginTop: 4, fontWeight: 600 }}>✗ Run finished with failures</div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TestRunnerPage = () => {
  useAdminNav()
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<"running" | "completed" | "failed" | null>(null)
  const [liveLines, setLiveLines] = useState<string[]>([])
  const [expandedSuite, setExpandedSuite] = useState<string | null>(null)
  const sseRef = useRef<EventSource | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/admin/test-runner", { credentials: "include" })
      const json: ApiResponse = await res.json()
      setData(json)
      return json
    } catch (err) {
      console.error("Failed to fetch test runner data:", err)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    return () => sseRef.current?.close()
  }, [])

  const startStream = (id: string) => {
    sseRef.current?.close()
    setLiveLines([])
    setJobStatus("running")
    setJobId(id)

    const es = new EventSource(`/admin/test-runner/stream?jobId=${id}`)
    sseRef.current = es

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === "line") {
        setLiveLines((prev) => [...prev, msg.text])
      } else if (msg.type === "done") {
        setJobStatus(msg.status)
        es.close()
        // Refresh report data after a short delay
        setTimeout(fetchData, 500)
      }
    }

    es.onerror = () => {
      setJobStatus((prev) => prev === "running" ? "failed" : prev)
      es.close()
    }
  }

  const handleRunTests = async () => {
    try {
      const res = await fetch("/admin/test-runner", {
        method: "POST",
        credentials: "include",
      })
      if (res.status === 409) {
        const json = await res.json()
        if (json.jobId) startStream(json.jobId)
        else alert("A test run is already in progress.")
        return
      }
      const json = await res.json()
      startStream(json.jobId)
    } catch (err) {
      console.error("Failed to start test run:", err)
    }
  }

  const isRunning = jobStatus === "running"
  const report = data?.report ?? null
  const history = data?.history ?? []
  const stats = report?.stats
  const specSummary = report ? buildSpecSummary(report.suites) : []
  const failedTests = report ? flattenTests(report.suites) : []
  const overallStatus = !stats ? "unknown" : stats.unexpected > 0 ? "failed" : "passed"

  return (
    <Container>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level="h1">E2E Test Runner</Heading>
          <Text className="text-ui-fg-subtle mt-1">
            Playwright end-to-end tests — live output streamed in real time
          </Text>
        </div>
        <Button
          onClick={handleRunTests}
          disabled={isRunning}
          variant={isRunning ? "secondary" : "primary"}
        >
          {isRunning ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#fbbf24" }} />
              Running…
            </span>
          ) : (
            "Run Tests"
          )}
        </Button>
      </div>

      {loading && <Text className="text-ui-fg-subtle">Loading…</Text>}

      {!loading && (
        <div className="space-y-6">

          {/* ── Live Terminal — shown when a job is active ── */}
          {(isRunning || jobStatus === "completed" || jobStatus === "failed") && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Heading level="h2">
                  {isRunning ? "Live Output" : jobStatus === "completed" ? "Last Run Output" : "Last Run Output (failed)"}
                </Heading>
                {!isRunning && (
                  <button
                    onClick={() => { setJobId(null); setJobStatus(null); setLiveLines([]) }}
                    style={{ fontSize: 12, color: "#6b7280", cursor: "pointer", background: "none", border: "none" }}
                  >
                    Hide
                  </button>
                )}
              </div>
              <LiveTerminal lines={liveLines} status={jobStatus} />
            </div>
          )}

          {/* ── Summary Card ── */}
          {stats ? (
            <div className="rounded-lg border border-ui-border-base p-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div>
                <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide">Status</Text>
                <Badge color={overallStatus === "passed" ? "green" : overallStatus === "failed" ? "red" : "grey"} className="mt-1">
                  {overallStatus === "passed" ? "All Passed" : overallStatus === "failed" ? "Failures" : "Unknown"}
                </Badge>
              </div>
              <div>
                <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide">Passed</Text>
                <Text className="font-semibold text-green-500 mt-1">{stats.expected}</Text>
              </div>
              <div>
                <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide">Failed</Text>
                <Text className={`font-semibold mt-1 ${stats.unexpected > 0 ? "text-red-500" : "text-ui-fg-subtle"}`}>
                  {stats.unexpected}
                </Text>
              </div>
              <div>
                <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide">Skipped</Text>
                <Text className="text-ui-fg-subtle font-semibold mt-1">{stats.skipped}</Text>
              </div>
              <div>
                <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide">Duration</Text>
                <Text className="font-semibold mt-1">{formatDuration(Math.round(stats.duration / 1000))}</Text>
              </div>
              <div className="col-span-2 sm:col-span-5 border-t border-ui-border-base pt-2">
                <Text className="text-ui-fg-subtle text-xs">Last run: {formatDate(stats.startTime)}</Text>
              </div>
            </div>
          ) : (
            !isRunning && (
              <div className="rounded-lg border border-ui-border-base p-4">
                <Text className="text-ui-fg-subtle">No test results yet. Click "Run Tests" to execute the Playwright suite.</Text>
              </div>
            )
          )}

          {/* ── Spec File Overview ── */}
          {specSummary.length > 0 && (
            <div>
              <Heading level="h2" className="mb-3">Spec Files</Heading>
              <div className="rounded-lg border border-ui-border-base overflow-hidden">
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Spec File</Table.HeaderCell>
                      <Table.HeaderCell>Tests</Table.HeaderCell>
                      <Table.HeaderCell>Passed</Table.HeaderCell>
                      <Table.HeaderCell>Failed</Table.HeaderCell>
                      <Table.HeaderCell>Status</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {specSummary.map((spec) => (
                      <Table.Row key={spec.file} className={spec.failed > 0 ? "bg-red-950/10" : ""}>
                        <Table.Cell>
                          <button
                            className="font-mono text-sm text-ui-fg-base hover:text-ui-fg-interactive underline-offset-2 hover:underline text-left"
                            onClick={() => setExpandedSuite(expandedSuite === spec.file ? null : spec.file)}
                          >
                            {spec.file}
                          </button>
                        </Table.Cell>
                        <Table.Cell>{spec.total}</Table.Cell>
                        <Table.Cell><span className="text-green-500 font-medium">{spec.passed}</span></Table.Cell>
                        <Table.Cell>
                          <span className={spec.failed > 0 ? "text-red-500 font-semibold" : "text-ui-fg-subtle"}>
                            {spec.failed}
                          </span>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge color={spec.failed > 0 ? "red" : "green"}>
                            {spec.failed > 0 ? "Failures" : "Pass"}
                          </Badge>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>
            </div>
          )}

          {/* ── Failed Tests Detail ── */}
          {failedTests.length > 0 && (
            <div>
              <Heading level="h2" className="mb-3 text-red-500">Failed Tests ({failedTests.length})</Heading>
              <div className="space-y-3">
                {failedTests.map((t, idx) => (
                  <div key={idx} className="rounded-lg border border-red-500/30 bg-red-950/10 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Text className="font-medium">{t.title}</Text>
                        <Text className="text-ui-fg-subtle text-sm">{t.suite}</Text>
                      </div>
                      <Badge color="red">{formatDuration(Math.round(t.result.duration / 1000))}</Badge>
                    </div>
                    {t.result.error?.message && (
                      <pre className="mt-3 text-xs text-red-400 bg-red-950/30 rounded p-3 overflow-auto max-h-40 whitespace-pre-wrap">
                        {t.result.error.message}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── History Chart ── */}
          {history.length > 0 && (
            <div>
              <Heading level="h2" className="mb-3">Run History (last {Math.min(history.length, 10)})</Heading>
              <div className="rounded-lg border border-ui-border-base p-4">
                <div className="flex items-end gap-3 mb-4">
                  {history.slice(0, 10).map((entry) => (
                    <HistoryBar key={entry.jobId} entry={entry} />
                  ))}
                </div>
                <div className="border-t border-ui-border-base pt-3 overflow-auto">
                  <Table>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Date</Table.HeaderCell>
                        <Table.HeaderCell>Status</Table.HeaderCell>
                        <Table.HeaderCell>Passed</Table.HeaderCell>
                        <Table.HeaderCell>Failed</Table.HeaderCell>
                        <Table.HeaderCell>Total</Table.HeaderCell>
                        <Table.HeaderCell>Duration</Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {history.slice(0, 10).map((entry) => (
                        <Table.Row key={entry.jobId}>
                          <Table.Cell><Text className="text-sm">{formatDate(entry.date)}</Text></Table.Cell>
                          <Table.Cell>
                            <Badge color={entry.status === "passed" ? "green" : "red"}>{entry.status}</Badge>
                          </Table.Cell>
                          <Table.Cell><span className="text-green-500">{entry.passed}</span></Table.Cell>
                          <Table.Cell>
                            <span className={entry.failed > 0 ? "text-red-500 font-semibold" : "text-ui-fg-subtle"}>
                              {entry.failed}
                            </span>
                          </Table.Cell>
                          <Table.Cell>{entry.total}</Table.Cell>
                          <Table.Cell>{formatDuration(entry.duration)}</Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </div>
              </div>
            </div>
          )}

          {/* ── Empty state ── */}
          {!report && history.length === 0 && !isRunning && (
            <Container className="text-center py-12">
              <Text className="text-ui-fg-subtle mb-4">
                No test results yet. Click "Run Tests" to execute the full Playwright suite.
              </Text>
              <Button onClick={handleRunTests}>Run Tests</Button>
            </Container>
          )}
        </div>
      )}
    </Container>
  )
}

export default TestRunnerPage
