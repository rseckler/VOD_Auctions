import { Container, Heading, Text, Button, Textarea } from "@medusajs/ui"
import { useState, useRef } from "react"

type LogEntry =
  | { type: "text"; text: string }
  | { type: "tool_call"; tool: string; input: unknown }
  | { type: "tool_result"; tool: string; result: unknown }
  | { type: "tool_error"; tool: string; error: string }
  | { type: "error"; message: string }
  | { type: "done" }

const TOOL_LABELS: Record<string, string> = {
  search_catalog: "🔍 Searching catalog",
  create_auction_draft: "📋 Creating draft block",
  add_items_to_block: "➕ Adding items",
}

function LogLine({ entry }: { entry: LogEntry }) {
  if (entry.type === "text") {
    return (
      <p style={{ margin: "6px 0", whiteSpace: "pre-wrap", lineHeight: 1.5, color: "#111827" }}>
        {entry.text}
      </p>
    )
  }
  if (entry.type === "tool_call") {
    const label = TOOL_LABELS[entry.tool] || entry.tool
    const inputStr = JSON.stringify(entry.input, null, 2)
    return (
      <div style={{
        margin: "8px 0",
        padding: "8px 12px",
        background: "#f0f9ff",
        border: "1px solid #bae6fd",
        borderRadius: 6,
        fontSize: 12,
      }}>
        <div style={{ fontWeight: 700, color: "#0369a1", marginBottom: 4 }}>{label}</div>
        <pre style={{ margin: 0, color: "#374151", fontSize: 11, overflow: "auto", maxHeight: 120 }}>{inputStr}</pre>
      </div>
    )
  }
  if (entry.type === "tool_result") {
    const resultStr = JSON.stringify(entry.result, null, 2)
    // Extract block admin URL if available
    const result = entry.result as any
    const adminUrl = result?.admin_url
    return (
      <div style={{
        margin: "4px 0",
        padding: "6px 12px",
        background: "#f0fdf4",
        border: "1px solid #bbf7d0",
        borderRadius: 6,
        fontSize: 11,
      }}>
        <div style={{ fontWeight: 600, color: "#15803d", marginBottom: 3 }}>
          ✓ {entry.tool} result
          {adminUrl && (
            <a
              href={adminUrl}
              style={{ marginLeft: 12, color: "#2563eb", textDecoration: "underline" }}
            >
              Open block →
            </a>
          )}
        </div>
        <pre style={{ margin: 0, color: "#374151", overflow: "auto", maxHeight: 200 }}>{resultStr}</pre>
      </div>
    )
  }
  if (entry.type === "tool_error") {
    return (
      <div style={{
        margin: "4px 0",
        padding: "6px 12px",
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: 6,
        fontSize: 11,
        color: "#dc2626",
      }}>
        ✗ {entry.tool}: {entry.error}
      </div>
    )
  }
  if (entry.type === "error") {
    return (
      <div style={{ color: "#dc2626", margin: "8px 0", fontWeight: 600 }}>
        Error: {entry.message}
      </div>
    )
  }
  return null
}

export default function AICreateAuctionPage() {
  const [brief, setBrief] = useState("")
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [blockId, setBlockId] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  const appendLog = (entry: LogEntry) => {
    setLog((prev) => [...prev, entry])
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
  }

  const handleCreate = async () => {
    if (!brief.trim()) return
    setRunning(true)
    setLog([])
    setBlockId(null)

    try {
      const res = await fetch("/admin/ai-create-auction", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        appendLog({ type: "error", message: data.error || `HTTP ${res.status}` })
        setRunning(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const entry = JSON.parse(line.slice(6)) as LogEntry
            appendLog(entry)

            // Extract block id from create_auction_draft result
            if (
              entry.type === "tool_result" &&
              entry.tool === "create_auction_draft"
            ) {
              const result = entry.result as any
              if (result?.block_id) setBlockId(result.block_id)
            }

            if (entry.type === "done") {
              setRunning(false)
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err: any) {
      appendLog({ type: "error", message: err?.message || "Network error" })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <a href="/app/auction-blocks" style={{ color: "#6b7280", fontSize: 13 }}>← Auction Blocks</a>
        <div>
          <Heading level="h1">✨ AI Auction Creator</Heading>
          <Text className="text-ui-fg-subtle" style={{ marginTop: 2 }}>
            Describe the auction theme and Claude will search the catalog and build a draft block.
          </Text>
        </div>
      </div>

      <Container style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontWeight: 600, fontSize: 13, marginBottom: 6, color: "#374151" }}>
            Auction Brief
          </label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            disabled={running}
            placeholder={`Examples:\n• 10 German industrial EBM releases from the 80s/90s, mid-value €20-80\n• A Throbbing Gristle / TG adjacent block — 15 items\n• Clearance lot: 20 cheap industrial tapes under €10`}
            style={{
              width: "100%",
              minHeight: 100,
              padding: "10px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 13,
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
              background: running ? "#f9fafb" : "#fff",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button onClick={handleCreate} isLoading={running} disabled={!brief.trim() || running}>
            {running ? "Creating…" : "✨ Create Auction"}
          </Button>
          {blockId && !running && (
            <a href={`/app/auction-blocks/${blockId}`}>
              <Button variant="secondary">Open Draft Block →</Button>
            </a>
          )}
        </div>
      </Container>

      {log.length > 0 && (
        <Container>
          <div style={{ fontWeight: 700, fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
            Activity Log
          </div>
          <div style={{ maxHeight: 600, overflowY: "auto" }}>
            {log.map((entry, i) => (
              <LogLine key={i} entry={entry} />
            ))}
            {running && (
              <div style={{ color: "#9ca3af", fontSize: 12, margin: "8px 0", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", animation: "pulse 1s infinite" }} />
                Claude is thinking…
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        </Container>
      )}
    </div>
  )
}
