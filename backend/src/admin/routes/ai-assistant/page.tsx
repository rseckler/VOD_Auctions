import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Sparkles } from "@medusajs/icons"
import { useEffect, useRef, useState } from "react"
import { useAdminNav } from "../../components/admin-nav"

// ─── Types ─────────────────────────────────────────────────────────────────────

type MessageRole = "user" | "assistant"

interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  toolCalls?: { tool: string; result?: unknown }[]
  isStreaming?: boolean
}

// ─── Markdown renderer (minimal, no deps) ─────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    // Code blocks
    .replace(/```[\s\S]*?```/g, (m) => {
      const code = m.slice(3, -3).replace(/^[a-z]*\n/, "")
      return `<pre style="background:#1e1e2e;color:#cdd6f4;padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;margin:8px 0;">${escapeHtml(code)}</pre>`
    })
    // Inline code
    .replace(/`([^`]+)`/g, (_, c) => `<code style="background:rgba(0,0,0,0.05);color:#1a1714;padding:2px 6px;border-radius:4px;font-size:13px;">${escapeHtml(c)}</code>`)
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // Tables (simple)
    .replace(/(\|.+\|\n)+/g, (table) => {
      const rows = table.trim().split("\n").filter((r) => !r.match(/^\|[-| ]+\|$/))
      const html = rows.map((row, i) => {
        const cells = row.split("|").filter((_, ci) => ci > 0 && ci < row.split("|").length - 1)
        const tag = i === 0 ? "th" : "td"
        const cellHtml = cells.map((c) => `<${tag} style="padding:6px 10px;border:1px solid rgba(0,0,0,0.08);text-align:left;font-size:13px;">${c.trim()}</${tag}>`).join("")
        return `<tr>${cellHtml}</tr>`
      }).join("")
      return `<table style="border-collapse:collapse;width:100%;margin:8px 0;">${html}</table>`
    })
    // Bullet lists
    .replace(/^- (.+)$/gm, "<li style='margin:2px 0;'>$1</li>")
    .replace(/(<li.*<\/li>\n?)+/g, (m) => `<ul style="margin:6px 0;padding-left:20px;">${m}</ul>`)
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, "<li style='margin:2px 0;'>$1</li>")
    // Line breaks
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>")
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// ─── Tool call chip ────────────────────────────────────────────────────────────

function ToolChip({ tool, result }: { tool: string; result?: unknown }) {
  const [open, setOpen] = useState(false)
  const icons: Record<string, string> = {
    get_dashboard_stats: "📊",
    list_auction_blocks: "🔨",
    search_transactions: "🧾",
    search_media: "🎵",
    get_system_health: "💚",
  }
  return (
    <div style={{ margin: "4px 0" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11,
          padding: "3px 8px",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.08)",
          background: "transparent",
          color: "#6b7280",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {icons[tool] || "🔧"} {tool} {open ? "▲" : "▼"}
      </button>
      {open && result !== undefined && (
        <pre
          style={{
            marginTop: 4,
            fontSize: 11,
            background: "transparent",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 6,
            padding: "8px",
            overflow: "auto",
            maxHeight: 200,
            color: "#1f2937",
          }}
        >
          {JSON.stringify(result as object, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ─── Suggestion chips ──────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Platform-Übersicht: aktive Auktionen und offene Bestellungen",
  "Zeige alle aktiven Auction Blocks",
  "Offene Bestellungen die noch nicht versandt wurden",
  "Suche nach Einstürzende Neubauten im Katalog",
  "System Health Status",
]

// ─── Main component ────────────────────────────────────────────────────────────

export default function AIAssistantPage() {
  useAdminNav()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
    }

    const assistantMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      toolCalls: [],
      isStreaming: true,
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput("")
    setIsLoading(true)

    // Build message history for API
    const history = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: text.trim() },
    ]

    try {
      const res = await fetch("/admin/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: history }),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let accumulatedText = ""
      const toolCallsCollected: { tool: string; result?: unknown }[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))

            if (event.type === "text") {
              accumulatedText += event.text
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: accumulatedText, isStreaming: true }
                }
                return updated
              })
            } else if (event.type === "tool_call") {
              toolCallsCollected.push({ tool: event.tool })
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = { ...last, toolCalls: [...toolCallsCollected], isStreaming: true }
                }
                return updated
              })
            } else if (event.type === "tool_result") {
              const idx = toolCallsCollected.findIndex((tc) => tc.tool === event.tool && !tc.result)
              if (idx !== -1) toolCallsCollected[idx].result = event.result
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = { ...last, toolCalls: [...toolCallsCollected], isStreaming: true }
                }
                return updated
              })
            } else if (event.type === "done") {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = { ...last, isStreaming: false }
                }
                return updated
              })
            } else if (event.type === "error") {
              throw new Error(event.message)
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last && last.role === "assistant") {
          updated[updated.length - 1] = {
            ...last,
            content: `Error: ${err.message || "Unknown error"}`,
            isStreaming: false,
          }
        }
        return updated
      })
    } finally {
      setIsLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)", fontFamily: "var(--font-sans, system-ui)" }}>

      {/* Header */}
      <div style={{ padding: "20px 32px 16px", borderBottom: "1px solid rgba(0,0,0,0.08)", background: "var(--bg-component, #f8f7f6)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>✦</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16, color: "#1f2937" }}>VOD AI Assistant</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Powered by Claude · Read-only</div>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>

        {/* Empty state with suggestions */}
        {isEmpty && (
          <div style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✦</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#1f2937", marginBottom: 8 }}>
              Was kann ich für dich tun?
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 28 }}>
              Ich habe Zugriff auf Auktionen, Bestellungen, Katalog und System-Status.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 20,
                    border: "1px solid rgba(0,0,0,0.08)",
                    background: "transparent",
                    color: "#1f2937",
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    fontFamily: "inherit",
                  }}
                  onMouseOver={(e) => {
                    ;(e.currentTarget as HTMLElement).style.background = "#ede9fe"
                    ;(e.currentTarget as HTMLElement).style.borderColor = "#a78bfa"
                    ;(e.currentTarget as HTMLElement).style.color = "#5b21b6"
                  }}
                  onMouseOut={(e) => {
                    ;(e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.02)"
                    ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.08)"
                    ;(e.currentTarget as HTMLElement).style.color = "#374151"
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 16,
              maxWidth: 800,
              margin: "0 auto 16px",
            }}
          >
            {msg.role === "assistant" && (
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, color: "#fff", flexShrink: 0, marginRight: 10, marginTop: 2,
              }}>✦</div>
            )}

            <div style={{ maxWidth: "85%" }}>
              {/* Tool calls */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  {msg.toolCalls.map((tc, i) => (
                    <ToolChip key={i} tool={tc.tool} result={tc.result} />
                  ))}
                </div>
              )}

              {/* Message bubble */}
              {(msg.content || msg.isStreaming) && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
                    background: msg.role === "user" ? "#6366f1" : "#f9fafb",
                    color: msg.role === "user" ? "#fff" : "#1f2937",
                    border: msg.role === "assistant" ? "1px solid rgba(0,0,0,0.08)" : "none",
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}
                >
                  {msg.role === "user" ? (
                    <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                  ) : (
                    <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) || (msg.isStreaming ? "" : "") }} />
                  )}
                  {msg.isStreaming && (
                    <span style={{
                      display: "inline-block",
                      width: 6, height: 14,
                      background: "#6366f1",
                      marginLeft: 2,
                      borderRadius: 2,
                      animation: "blink 1s step-end infinite",
                    }} />
                  )}
                </div>
              )}
            </div>

            {msg.role === "user" && (
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: "#e5e7eb",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, color: "#6b7280", flexShrink: 0, marginLeft: 10, marginTop: 2,
              }}>R</div>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{ padding: "16px 32px 20px", borderTop: "1px solid rgba(0,0,0,0.08)", background: "var(--bg-component, #f8f7f6)", flexShrink: 0 }}>
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
          border: "1px solid #d1d5db",
          borderRadius: 12,
          padding: "10px 12px",
          background: isLoading ? "#f9fafb" : "#fff",
          transition: "border-color 0.15s",
        }}
          onFocusCapture={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
          onBlurCapture={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Frag mich etwas... (Enter zum Senden, Shift+Enter für neue Zeile)"
            disabled={isLoading}
            rows={1}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              resize: "none",
              fontSize: 14,
              color: "#1f2937",
              background: "transparent",
              fontFamily: "inherit",
              lineHeight: 1.5,
              maxHeight: 120,
              overflowY: "auto",
            }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = "auto"
              el.style.height = Math.min(el.scrollHeight, 120) + "px"
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            style={{
              width: 34, height: 34,
              borderRadius: 8,
              background: input.trim() && !isLoading ? "#6366f1" : "rgba(0,0,0,0.08)",
              border: "none",
              cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
              color: input.trim() && !isLoading ? "#fff" : "#9ca3af",
              fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s",
              flexShrink: 0,
            }}
          >
            {isLoading ? "⋯" : "↑"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6, textAlign: "center" }}>
          Claude Haiku · Nur lesender Zugriff · Session wird nicht gespeichert
        </div>
      </div>

      {/* Cursor blink animation */}
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "AI Assistant",
  rank: 6,
  icon: Sparkles,
})
