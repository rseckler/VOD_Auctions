import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useState, useEffect, useCallback } from "react"
import { EnvelopeSolid } from "@medusajs/icons"

export const config = defineRouteConfig({
  label: "Emails",
  icon: EnvelopeSolid,
})

// ─── Types ──────────────────────────────────────────────────────────────────

type EmailTemplate = {
  id: string
  name: string
  description: string
  channel: "resend" | "brevo"
  category: "transactional" | "newsletter"
  trigger: string
  preheader: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const C = {
  bg: "#ffffff",
  card: "#f9fafb",
  border: "#e5e7eb",
  text: "#111827",
  muted: "#6b7280",
  gold: "#b8860b",
  success: "#16a34a",
  hover: "#f3f4f6",
  danger: "#dc2626",
  chip: {
    resend: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
    brevo: { bg: "#ecfdf5", text: "#065f46", border: "#6ee7b7" },
    transactional: { bg: "#fafafa", text: "#374151", border: "#e5e7eb" },
    newsletter: { bg: "#fdf4ff", text: "#6b21a8", border: "#e9d5ff" },
  },
}

// ─── Badge component ────────────────────────────────────────────────────────

function Badge({ label, style }: { label: string; style: { bg: string; text: string; border: string } }) {
  return (
    <span style={{
      display: "inline-block",
      fontSize: 11,
      fontWeight: 600,
      padding: "2px 8px",
      borderRadius: 4,
      backgroundColor: style.bg,
      color: style.text,
      border: `1px solid ${style.border}`,
      letterSpacing: "0.03em",
      textTransform: "uppercase" as const,
    }}>
      {label}
    </span>
  )
}

// ─── Send Test Modal ─────────────────────────────────────────────────────────

function SendTestModal({
  template,
  onClose,
}: {
  template: EmailTemplate
  onClose: () => void
}) {
  const [to, setTo] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  async function handleSend() {
    if (!to.includes("@")) return
    setStatus("sending")
    setErrorMsg("")
    try {
      const res = await fetch("/admin/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templateId: template.id, to }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setStatus("sent")
      } else {
        setStatus("error")
        setErrorMsg(data.message || "Unknown error")
      }
    } catch (err: any) {
      setStatus("error")
      setErrorMsg(err.message || "Network error")
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        backgroundColor: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 24,
        width: 440,
        maxWidth: "90vw",
        boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Send Test Email</p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted }}>{template.name}</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.muted, padding: "0 4px" }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Send to
          </label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="you@example.com"
            disabled={status === "sending" || status === "sent"}
            style={{
              width: "100%",
              padding: "9px 12px",
              fontSize: 14,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              outline: "none",
              boxSizing: "border-box" as const,
              backgroundColor: status === "sent" ? C.card : C.bg,
              color: C.text,
            }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend() }}
          />
        </div>

        <p style={{ margin: "6px 0 16px", fontSize: 12, color: C.muted }}>
          Subject will be prefixed with <strong>[TEST]</strong>
        </p>

        {status === "sent" && (
          <div style={{ padding: "10px 14px", backgroundColor: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#166534" }}>✓ Test email sent successfully!</p>
          </div>
        )}
        {status === "error" && (
          <div style={{ padding: "10px 14px", backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: C.danger }}>{errorMsg}</p>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              cursor: "pointer",
              backgroundColor: C.bg,
              color: C.text,
            }}
          >
            {status === "sent" ? "Close" : "Cancel"}
          </button>
          {status !== "sent" && (
            <button
              onClick={handleSend}
              disabled={!to.includes("@") || status === "sending"}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                borderRadius: 6,
                cursor: to.includes("@") && status !== "sending" ? "pointer" : "not-allowed",
                backgroundColor: to.includes("@") && status !== "sending" ? C.gold : C.border,
                color: to.includes("@") && status !== "sending" ? "#ffffff" : C.muted,
              }}
            >
              {status === "sending" ? "Sending…" : "Send Test"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Template Card ───────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onSendTest,
}: {
  template: EmailTemplate
  onSendTest: (t: EmailTemplate) => void
}) {
  return (
    <div style={{
      backgroundColor: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: "16px 18px",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text }}>{template.name}</p>
          <Badge
            label={template.channel === "resend" ? "Resend" : "Brevo"}
            style={template.channel === "resend" ? C.chip.resend : C.chip.brevo}
          />
          <Badge
            label={template.category}
            style={template.category === "transactional" ? C.chip.transactional : C.chip.newsletter}
          />
        </div>
        <p style={{ margin: "0 0 6px", fontSize: 13, color: C.muted }}>{template.description}</p>
        <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
          <span style={{ color: "#374151", fontWeight: 500 }}>Trigger:</span> {template.trigger}
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 12, color: C.muted, fontStyle: "italic" }}>
          &ldquo;{template.preheader}&rdquo;
        </p>
      </div>
      {template.channel === "resend" && (
        <button
          onClick={() => onSendTest(template)}
          style={{
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 600,
            border: `1px solid ${C.gold}`,
            borderRadius: 6,
            cursor: "pointer",
            backgroundColor: C.bg,
            color: C.gold,
            whiteSpace: "nowrap" as const,
            flexShrink: 0,
          }}
        >
          Send Test
        </button>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmailsPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "resend" | "brevo">("all")
  const [testTarget, setTestTarget] = useState<EmailTemplate | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/admin/email-templates", { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = templates.filter((t) => {
    if (filter === "all") return true
    return t.channel === filter
  })

  const resendCount = templates.filter((t) => t.channel === "resend").length
  const brevoCount = templates.filter((t) => t.channel === "brevo").length

  return (
    <div style={{ padding: "24px 32px", maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text }}>
          Email Templates
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: C.muted }}>
          {templates.length} templates — {resendCount} via Resend (transactional), {brevoCount} via Brevo (newsletter)
        </p>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["all", "resend", "brevo"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 16px",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 6,
              cursor: "pointer",
              border: `1px solid ${filter === f ? C.gold : C.border}`,
              backgroundColor: filter === f ? C.gold : C.bg,
              color: filter === f ? "#ffffff" : C.text,
            }}
          >
            {f === "all" ? `All (${templates.length})` : f === "resend" ? `Resend (${resendCount})` : `Brevo (${brevoCount})`}
          </button>
        ))}
      </div>

      {/* Status */}
      {loading && (
        <p style={{ color: C.muted, fontSize: 14 }}>Loading templates…</p>
      )}
      {error && (
        <div style={{ padding: "12px 16px", backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: C.danger }}>Error: {error}</p>
        </div>
      )}

      {/* Template List */}
      {!loading && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((t) => (
            <TemplateCard key={t.id} template={t} onSendTest={setTestTarget} />
          ))}
          {filtered.length === 0 && (
            <p style={{ color: C.muted, fontSize: 14 }}>No templates match the current filter.</p>
          )}
        </div>
      )}

      {/* Send Test Modal */}
      {testTarget && (
        <SendTestModal
          template={testTarget}
          onClose={() => setTestTarget(null)}
        />
      )}
    </div>
  )
}
