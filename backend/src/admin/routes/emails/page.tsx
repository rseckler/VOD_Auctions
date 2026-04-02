import { useState, useEffect, useCallback, useRef } from "react"
import { useAdminNav } from "../../components/admin-nav"
import { EnvelopeSolid } from "@medusajs/icons"

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

type PreviewData = {
  id: string
  subject: string
  subject_default: string
  html: string
  config: {
    subject_override?: string
    preheader_override?: string
    notes?: string
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const C = {
  bg: "#ffffff",
  card: "transparent",
  border: "rgba(0,0,0,0.08)",
  text: "#1f2937",
  muted: "#6b7280",
  gold: "#b8860b",
  success: "#16a34a",
  hover: "#f3f4f6",
  danger: "#dc2626",
  chip: {
    resend: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
    brevo: { bg: "#ecfdf5", text: "#065f46", border: "#6ee7b7" },
    transactional: { bg: "transparent", text: "#1f2937", border: "rgba(0,0,0,0.08)" },
    newsletter: { bg: "#fdf4ff", text: "#6b21a8", border: "#e9d5ff" },
  },
}

// ─── Badge ───────────────────────────────────────────────────────────────────

function Badge({ label, style }: { label: string; style: { bg: string; text: string; border: string } }) {
  return (
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, backgroundColor: style.bg, color: style.text, border: `1px solid ${style.border}`, letterSpacing: "0.03em", textTransform: "uppercase" as const }}>
      {label}
    </span>
  )
}

// ─── Preview Drawer ───────────────────────────────────────────────────────────

function PreviewDrawer({
  template,
  onClose,
}: {
  template: EmailTemplate
  onClose: () => void
}) {
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"preview" | "edit" | "send">("preview")

  // Edit state
  const [subjectOverride, setSubjectOverride] = useState("")
  const [preheaderOverride, setPreheaderOverride] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState("")

  // Send test state
  const [to, setTo] = useState("")
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [sendError, setSendError] = useState("")

  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Load preview
  useEffect(() => {
    setLoading(true)
    fetch(`/admin/email-templates/${template.id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: PreviewData) => {
        setPreview(data)
        setSubjectOverride(data.config?.subject_override || "")
        setPreheaderOverride(data.config?.preheader_override || "")
        setNotes(data.config?.notes || "")
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [template.id])

  // Inject HTML into iframe
  useEffect(() => {
    if (!preview || !iframeRef.current) return
    const doc = iframeRef.current.contentDocument
    if (!doc) return
    doc.open()
    doc.write(preview.html)
    doc.close()
  }, [preview, tab])

  async function handleSave() {
    setSaving(true)
    setSaveMsg("")
    try {
      const res = await fetch(`/admin/email-templates/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject_override: subjectOverride,
          preheader_override: preheaderOverride,
          notes,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSaveMsg("Saved ✓")
      setTimeout(() => setSaveMsg(""), 3000)
    } catch (e: any) {
      setSaveMsg(`Error: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleSendTest() {
    if (!to.includes("@")) return
    setSendStatus("sending")
    setSendError("")
    try {
      const res = await fetch("/admin/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templateId: template.id, to }),
      })
      const data = await res.json()
      if (res.ok && data.success) setSendStatus("sent")
      else { setSendStatus("error"); setSendError(data.message || "Unknown error") }
    } catch (err: any) {
      setSendStatus("error")
      setSendError(err.message)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 900 }}
      />

      {/* Drawer */}
      <div style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(780px, 90vw)",
        backgroundColor: C.bg,
        boxShadow: "-4px 0 30px rgba(0,0,0,0.15)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>{template.name}</p>
                <Badge label={template.channel === "resend" ? "Resend" : "Brevo"} style={template.channel === "resend" ? C.chip.resend : C.chip.brevo} />
                <Badge label={template.category} style={template.category === "transactional" ? C.chip.transactional : C.chip.newsletter} />
              </div>
              <p style={{ margin: 0, fontSize: 13, color: C.muted }}>{template.description}</p>
              {preview && (
                <p style={{ margin: "4px 0 0", fontSize: 12, color: C.text }}>
                  <span style={{ color: C.muted }}>Subject: </span>
                  <strong>{subjectOverride || preview.subject_default}</strong>
                </p>
              )}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: C.muted, padding: "0 4px", lineHeight: 1 }}>
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginTop: 14 }}>
            {(["preview", "edit", "send"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 6,
                  cursor: "pointer",
                  border: `1px solid ${tab === t ? C.gold : C.border}`,
                  backgroundColor: tab === t ? C.gold : C.bg,
                  color: tab === t ? "#ffffff" : C.text,
                  textTransform: "capitalize" as const,
                }}
              >
                {t === "preview" ? "📧 Preview" : t === "edit" ? "✏️ Edit" : "🚀 Send Test"}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto" }}>

          {/* PREVIEW TAB */}
          {tab === "preview" && (
            loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.muted, fontSize: 14 }}>
                Loading preview…
              </div>
            ) : preview ? (
              <iframe
                ref={iframeRef}
                style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#ffffff" }}
                title={`Preview: ${template.name}`}
                sandbox="allow-same-origin"
              />
            ) : (
              <div style={{ padding: 24, color: C.danger, fontSize: 14 }}>Failed to load preview.</div>
            )
          )}

          {/* EDIT TAB */}
          {tab === "edit" && (
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ padding: "12px 16px", backgroundColor: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8 }}>
                <p style={{ margin: 0, fontSize: 13, color: "#92400e" }}>
                  <strong>Note:</strong> Changes here save text overrides (subject, preheader, notes). The email HTML design is defined in code and requires a redeploy to change.
                </p>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Default Subject (from code)
                </label>
                <p style={{ margin: 0, padding: "9px 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14, color: C.muted, fontStyle: "italic" }}>
                  {preview?.subject_default || "—"}
                </p>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Subject Override
                </label>
                <input
                  type="text"
                  value={subjectOverride}
                  onChange={(e) => setSubjectOverride(e.target.value)}
                  placeholder="Leave empty to use default"
                  style={{ width: "100%", padding: "9px 12px", fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 6, outline: "none", boxSizing: "border-box" as const, color: C.text }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Default Preheader (from code)
                </label>
                <p style={{ margin: 0, padding: "9px 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14, color: C.muted, fontStyle: "italic" }}>
                  {template.preheader}
                </p>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Preheader Override
                </label>
                <input
                  type="text"
                  value={preheaderOverride}
                  onChange={(e) => setPreheaderOverride(e.target.value)}
                  placeholder="Leave empty to use default"
                  style={{ width: "100%", padding: "9px 12px", fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 6, outline: "none", boxSizing: "border-box" as const, color: C.text }}
                />
                <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted }}>Shown in email inbox preview before opening.</p>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Internal Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes, desired changes, copy feedback…"
                  rows={4}
                  style={{ width: "100%", padding: "9px 12px", fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 6, outline: "none", boxSizing: "border-box" as const, resize: "vertical" as const, color: C.text, fontFamily: "inherit" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: "9px 20px",
                    fontSize: 13,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: 6,
                    cursor: saving ? "not-allowed" : "pointer",
                    backgroundColor: saving ? C.border : C.gold,
                    color: "#ffffff",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                {saveMsg && (
                  <p style={{ margin: 0, fontSize: 13, color: saveMsg.startsWith("Error") ? C.danger : C.success, fontWeight: 500 }}>
                    {saveMsg}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* SEND TEST TAB */}
          {tab === "send" && (
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, maxWidth: 480 }}>
              <p style={{ margin: 0, fontSize: 14, color: C.muted }}>
                Send a test version of <strong style={{ color: C.text }}>{template.name}</strong> with sample data.
                The subject will be prefixed with <code style={{ background: C.card, padding: "1px 5px", borderRadius: 3, fontSize: 12 }}>[TEST]</code>.
              </p>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Send to
                </label>
                <input
                  type="email"
                  value={to}
                  onChange={(e) => { setTo(e.target.value); setSendStatus("idle") }}
                  placeholder="you@example.com"
                  disabled={sendStatus === "sending" || sendStatus === "sent"}
                  style={{ width: "100%", padding: "9px 12px", fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 6, outline: "none", boxSizing: "border-box" as const, color: C.text }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSendTest() }}
                />
              </div>

              {sendStatus === "sent" && (
                <div style={{ padding: "10px 14px", backgroundColor: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6 }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#166534" }}>✓ Test email sent! Check your inbox.</p>
                </div>
              )}
              {sendStatus === "error" && (
                <div style={{ padding: "10px 14px", backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6 }}>
                  <p style={{ margin: 0, fontSize: 13, color: C.danger }}>{sendError}</p>
                </div>
              )}
              {template.channel === "brevo" && (
                <div style={{ padding: "10px 14px", backgroundColor: "#f0fdf4", border: "1px solid #6ee7b7", borderRadius: 6 }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#065f46" }}>
                    This is a Brevo newsletter template. Test emails are sent via Resend with sample data.
                  </p>
                </div>
              )}

              <button
                onClick={handleSendTest}
                disabled={!to.includes("@") || sendStatus === "sending" || sendStatus === "sent"}
                style={{
                  padding: "9px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 6,
                  cursor: (to.includes("@") && sendStatus === "idle") ? "pointer" : "not-allowed",
                  backgroundColor: (to.includes("@") && sendStatus === "idle") ? C.gold : C.border,
                  color: (to.includes("@") && sendStatus === "idle") ? "#ffffff" : C.muted,
                  alignSelf: "flex-start",
                }}
              >
                {sendStatus === "sending" ? "Sending…" : "Send Test Email"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onClick,
}: {
  template: EmailTemplate
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: hovered ? C.hover : C.bg,
        border: `1px solid ${hovered ? C.gold : C.border}`,
        borderRadius: 8,
        padding: "14px 18px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        cursor: "pointer",
        transition: "border-color 0.15s, background-color 0.15s",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text }}>{template.name}</p>
          <Badge label={template.channel === "resend" ? "Resend" : "Brevo"} style={template.channel === "resend" ? C.chip.resend : C.chip.brevo} />
          <Badge label={template.category} style={template.category === "transactional" ? C.chip.transactional : C.chip.newsletter} />
        </div>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: C.muted }}>{template.description}</p>
        <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
          <span style={{ color: "#1f2937", fontWeight: 500 }}>Trigger:</span> {template.trigger}
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 12, color: C.muted, fontStyle: "italic" }}>
          &ldquo;{template.preheader}&rdquo;
        </p>
      </div>
      <span style={{ fontSize: 18, color: C.muted, flexShrink: 0, alignSelf: "center", opacity: hovered ? 1 : 0.4, transition: "opacity 0.15s" }}>→</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmailsPage() {
  useAdminNav()
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "resend" | "brevo">("all")
  const [selected, setSelected] = useState<EmailTemplate | null>(null)

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

  const filtered = templates.filter((t) => filter === "all" || t.channel === filter)
  const resendCount = templates.filter((t) => t.channel === "resend").length
  const brevoCount = templates.filter((t) => t.channel === "brevo").length

  return (
    <div style={{ padding: "24px 32px", maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text }}>Email Templates</h1>
        <p style={{ margin: 0, fontSize: 14, color: C.muted }}>
          {templates.length} templates — {resendCount} via Resend (transactional), {brevoCount} via Brevo (newsletter)
          <span style={{ marginLeft: 12, color: C.gold }}>Click a template to preview or edit</span>
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["all", "resend", "brevo"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 16px", fontSize: 13, fontWeight: 500, borderRadius: 6, cursor: "pointer",
              border: `1px solid ${filter === f ? C.gold : C.border}`,
              backgroundColor: filter === f ? C.gold : C.bg,
              color: filter === f ? "#ffffff" : C.text,
            }}
          >
            {f === "all" ? `All (${templates.length})` : f === "resend" ? `Resend (${resendCount})` : `Brevo (${brevoCount})`}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: C.muted, fontSize: 14 }}>Loading templates…</p>}
      {error && (
        <div style={{ padding: "12px 16px", backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: C.danger }}>Error: {error}</p>
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((t) => (
            <TemplateCard key={t.id} template={t} onClick={() => setSelected(t)} />
          ))}
          {filtered.length === 0 && <p style={{ color: C.muted, fontSize: 14 }}>No templates match the current filter.</p>}
        </div>
      )}

      {selected && (
        <PreviewDrawer template={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
