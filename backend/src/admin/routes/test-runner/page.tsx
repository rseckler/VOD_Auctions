import { ChartBar } from "@medusajs/icons"
import { Container, Heading, Table, Badge, Button, Text } from "@medusajs/ui"
import { useEffect, useState, useRef } from "react"

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

// Extract spec file name from full path
function specLabel(file: string) {
  const parts = file.split("/")
  return parts[parts.length - 1].replace(".spec.ts", "")
}

// Flatten all test cases from a suite
function flattenTests(suites: TestSuite[]) {
  const failed: Array<{ suite: string; title: string; result: TestResult }> = []
  for (const suite of suites) {
    for (const spec of suite.specs) {
      for (const test of spec.tests) {
        if (test.status === "unexpected") {
          const lastResult = test.results[test.results.length - 1]
          if (lastResult) {
            failed.push({
              suite: specLabel(suite.file),
              title: test.title,
              result: lastResult,
            })
          }
        }
      }
    }
  }
  return failed
}

// Build per-spec-file summary
function buildSpecSummary(suites: TestSuite[]) {
  return suites.map((suite) => {
    let passed = 0
    let failed = 0
    let skipped = 0
    for (const spec of suite.specs) {
      for (const test of spec.tests) {
        if (test.status === "expected") passed++
        else if (test.status === "unexpected") failed++
        else skipped++
      }
    }
    return {
      file: specLabel(suite.file),
      passed,
      failed,
      skipped,
      total: passed + failed + skipped,
    }
  })
}

// Mini bar chart for history (last 10 entries)
function HistoryBar({ entry }: { entry: HistoryEntry }) {
  const total = entry.total || 1
  const passedPct = Math.round((entry.passed / total) * 100)
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-6 h-16 bg-ui-bg-subtle rounded overflow-hidden flex flex-col-reverse">
        <div
          className="w-full bg-green-500"
          style={{ height: `${passedPct}%` }}
        />
        {entry.failed > 0 && (
          <div
            className="w-full bg-red-500"
            style={{ height: `${Math.round((entry.failed / total) * 100)}%` }}
          />
        )}
      </div>
      <span className="text-xs text-ui-fg-muted">
        {new Date(entry.date).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        })}
      </span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TestRunnerPage = () => {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [expandedSuite, setExpandedSuite] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = async () => {
    try {
      const res = await fetch("/admin/test-runner", { credentials: "include" })
      const json: ApiResponse = await res.json()
      setData(json)

      // Stop polling once job finishes
      if (json.runningJob === null && pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
        setTriggering(false)
      }
    } catch (err) {
      console.error("Failed to fetch test runner data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Start polling when a job is running
  useEffect(() => {
    if (data?.runningJob && !pollRef.current) {
      setTriggering(true)
      pollRef.current = setInterval(fetchData, 3000)
    }
  }, [data?.runningJob])

  const handleRunTests = async () => {
    setTriggering(true)
    try {
      const res = await fetch("/admin/test-runner", {
        method: "POST",
        credentials: "include",
      })
      if (res.status === 409) {
        alert("A test run is already in progress.")
        setTriggering(false)
        return
      }
      // Start polling immediately
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchData, 3000)
      }
    } catch (err) {
      console.error("Failed to start test run:", err)
      setTriggering(false)
    }
  }

  const report = data?.report ?? null
  const history = data?.history ?? []
  const isRunning = triggering || !!data?.runningJob

  const stats = report?.stats
  const specSummary = report ? buildSpecSummary(report.suites) : []
  const failedTests = report ? flattenTests(report.suites) : []

  const overallStatus =
    !stats
      ? "unknown"
      : stats.unexpected > 0
      ? "failed"
      : "passed"

  return (
    <Container>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level="h1">E2E Test Runner</Heading>
          <Text className="text-ui-fg-subtle mt-1">
            Playwright end-to-end tests — 64 tests across 10 spec files
          </Text>
        </div>
        <Button
          onClick={handleRunTests}
          disabled={isRunning}
          variant={isRunning ? "secondary" : "primary"}
        >
          {isRunning ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
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
          {/* ── Summary Card ── */}
          {stats ? (
            <div className="rounded-lg border border-ui-border-base p-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div>
                <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide">
                  Status
                </Text>
                <Badge
                  color={overallStatus === "passed" ? "green" : overallStatus === "failed" ? "red" : "grey"}
                  className="mt-1"
                >
                  {overallStatus === "passed"
                    ? "All Passed"
                    : overallStatus === "failed"
                    ? "Failures"
                    : "Unknown"}
                </Badge>
              </div>
              <div>
                <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide">
                  Passed
                </Text>
                <Text className="font-semibold text-green-500 mt-1">
                  {stats.expected}
                </Text>
              </div>
              <div>
                <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide">
                  Failed
                </Text>
                <Text
                  className={`font-semibold mt-1 ${
                    stats.unexpected > 0 ? "text-red-500" : "text-ui-fg-subtle"
                  }`}
                >
                  {stats.unexpected}
                </Text>
              </div>
              <div>
                <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide">
                  Skipped
                </Text>
                <Text className="text-ui-fg-subtle font-semibold mt-1">
                  {stats.skipped}
                </Text>
              </div>
              <div>
                <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide">
                  Duration
                </Text>
                <Text className="font-semibold mt-1">
                  {formatDuration(Math.round(stats.duration / 1000))}
                </Text>
              </div>
              <div className="col-span-2 sm:col-span-5 border-t border-ui-border-base pt-2">
                <Text className="text-ui-fg-subtle text-xs">
                  Last run: {formatDate(stats.startTime)}
                </Text>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-ui-border-base p-4">
              <Text className="text-ui-fg-subtle">
                No test results found. Click "Run Tests" to execute the Playwright suite.
              </Text>
            </div>
          )}

          {/* ── Spec File Overview ── */}
          {specSummary.length > 0 && (
            <div>
              <Heading level="h2" className="mb-3">
                Spec Files
              </Heading>
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
                      <Table.Row
                        key={spec.file}
                        className={
                          spec.failed > 0 ? "bg-red-950/10" : ""
                        }
                      >
                        <Table.Cell>
                          <button
                            className="font-mono text-sm text-ui-fg-base hover:text-ui-fg-interactive underline-offset-2 hover:underline text-left"
                            onClick={() =>
                              setExpandedSuite(
                                expandedSuite === spec.file ? null : spec.file
                              )
                            }
                          >
                            {spec.file}
                          </button>
                        </Table.Cell>
                        <Table.Cell>{spec.total}</Table.Cell>
                        <Table.Cell>
                          <span className="text-green-500 font-medium">
                            {spec.passed}
                          </span>
                        </Table.Cell>
                        <Table.Cell>
                          <span
                            className={
                              spec.failed > 0
                                ? "text-red-500 font-semibold"
                                : "text-ui-fg-subtle"
                            }
                          >
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
              <Heading level="h2" className="mb-3 text-red-500">
                Failed Tests ({failedTests.length})
              </Heading>
              <div className="space-y-3">
                {failedTests.map((t, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-red-500/30 bg-red-950/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Text className="font-medium">{t.title}</Text>
                        <Text className="text-ui-fg-subtle text-sm">
                          {t.suite}
                        </Text>
                      </div>
                      <Badge color="red">
                        {formatDuration(Math.round(t.result.duration / 1000))}
                      </Badge>
                    </div>
                    {t.result.error?.message && (
                      <pre className="mt-3 text-xs text-red-400 bg-red-950/30 rounded p-3 overflow-auto max-h-40 whitespace-pre-wrap">
                        {t.result.error.message}
                      </pre>
                    )}
                    {/* Screenshot link if available */}
                    {t.result.attachments?.some(
                      (a) => a.contentType === "image/png"
                    ) && (
                      <div className="mt-2">
                        {t.result.attachments
                          .filter((a) => a.contentType === "image/png" && a.path)
                          .map((a, i) => (
                            <a
                              key={i}
                              href={`/admin/test-runner/screenshot?path=${encodeURIComponent(a.path!)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-ui-fg-interactive underline"
                            >
                              View Screenshot
                            </a>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── History Chart ── */}
          {history.length > 0 && (
            <div>
              <Heading level="h2" className="mb-3">
                Run History (last {Math.min(history.length, 10)})
              </Heading>
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
                          <Table.Cell>
                            <Text className="text-sm">{formatDate(entry.date)}</Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Badge color={entry.status === "passed" ? "green" : "red"}>
                              {entry.status}
                            </Badge>
                          </Table.Cell>
                          <Table.Cell>
                            <span className="text-green-500">{entry.passed}</span>
                          </Table.Cell>
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

          {/* ── No data state ── */}
          {!report && history.length === 0 && (
            <Container className="text-center py-12">
              <Text className="text-ui-fg-subtle mb-4">
                No test results yet. Click "Run Tests" to execute the full Playwright suite.
              </Text>
              <Button onClick={handleRunTests} disabled={isRunning}>
                {isRunning ? "Running…" : "Run Tests"}
              </Button>
            </Container>
          )}
        </div>
      )}
    </Container>
  )
}

export default TestRunnerPage
