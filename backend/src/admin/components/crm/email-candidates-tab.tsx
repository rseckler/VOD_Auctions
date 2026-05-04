// CRM Email Candidates — Manual Review (rc53.x)
//
// Reviews IMAP-body-match candidates produced by Stage-4. Each candidate
// proposes a `crm_master_email` row for an existing master_contact. Backend
// endpoints are GET /admin/crm/email-candidates and PATCH /admin/crm/email-candidates/:id.
//
// Bands: `high` (Subject + multiple body hits), `mid` (≥2 body hits),
// `shared` (email landed in multiple masters → ambiguous).
//
// Workflow:
//   • List pending candidates, filterable by band, sorted by band priority + age
//   • Click contact name → open ContactDetailDrawer (read-only context)
//   • Accept → optional set-as-primary, optional notes
//   • Reject → optional notes (e.g. "spam mailing list")
//   • After action: optimistic removal from list, stat-grid recompute

import { useCallback, useEffect, useMemo, useState } from "react"
import { C, S, T, fmtNum, fmtMoney, relativeTime } from "../admin-tokens"
import { Badge, Btn, EmptyState, Modal, Toast, inputStyle } from "../admin-ui"
import { ContactDetailDrawer } from "./contact-detail-drawer"

// ── Types ──────────────────────────────────────────────────────────────────

type Band = "high" | "mid" | "shared"

type Candidate = {
  id: string
  master_id: string
  email: string
  matched_by: string
  confidence: string | number
  match_evidence: { band?: Band; hits?: number; method?: string } | null
  created_at: string
  // Joined master fields:
  master_display_name: string | null
  master_first_name: string | null
  master_last_name: string | null
  master_company: string | null
  master_revenue: string | number | null
  master_tier: string | null
  master_primary_email: string | null
}

type FilterBand = "all" | Band

// ── Helpers ────────────────────────────────────────────────────────────────

function getBand(c: Candidate): Band {
  return (c.match_evidence?.band as Band) || "mid"
}

const BAND_ORDER: Record<Band, number> = { high: 0, mid: 1, shared: 2 }

function bandBadge(b: Band) {
  switch (b) {
    case "high":
      return <Badge label="High" variant="success" />
    case "mid":
      return <Badge label="Mid" variant="info" />
    case "shared":
      return <Badge label="Shared" variant="warning" />
  }
}

function tierBadge(tier: string | null) {
  if (!tier) return null
  const map: Record<string, { label: string; color: string }> = {
    platinum: { label: "Platinum", color: "#7c3aed" },
    gold: { label: "Gold", color: "#b8860b" },
    silver: { label: "Silver", color: "#78716c" },
    bronze: { label: "Bronze", color: "#a16207" },
    standard: { label: "Standard", color: "#9ca3af" },
  }
  const v = map[tier.toLowerCase()] || { label: tier, color: C.muted }
  return (
    <span style={{
      display: "inline-block",
      fontSize: 10, fontWeight: 700, padding: "2px 6px",
      borderRadius: S.radius.sm,
      background: v.color + "12", color: v.color, border: `1px solid ${v.color}30`,
      textTransform: "uppercase", letterSpacing: "0.04em",
    }}>{v.label}</span>
  )
}

function displayName(c: Candidate): string {
  if (c.master_display_name) return c.master_display_name
  const fn = [c.master_first_name, c.master_last_name].filter(Boolean).join(" ").trim()
  if (fn) return fn
  if (c.master_company) return c.master_company
  return "(no name)"
}

// ── Modal: Accept ──────────────────────────────────────────────────────────

function AcceptModal({
  candidate, hasPrimary, onClose, onConfirm,
}: {
  candidate: Candidate
  hasPrimary: boolean
  onClose: () => void
  onConfirm: (setPrimary: boolean, notes: string) => Promise<void>
}) {
  const [setPrimary, setSetPrimary] = useState(!hasPrimary) // default: if no primary, this becomes primary
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      title="Accept email candidate"
      subtitle={`${candidate.email} → ${displayName(candidate)}`}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Btn label="Cancel" variant="ghost" onClick={onClose} disabled={busy} />
          <Btn
            label={busy ? "Accepting…" : "Accept"}
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try { await onConfirm(setPrimary, notes.trim()) } finally { setBusy(false) }
            }}
          />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...T.small, color: C.text }}>
          Adding <code style={{ background: C.subtle, padding: "1px 5px", borderRadius: 3 }}>{candidate.email}</code> as a verified email for this contact.
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={setPrimary}
            onChange={(e) => setSetPrimary(e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          <span style={T.body}>
            Set as primary email
            {hasPrimary && (
              <span style={{ ...T.small, color: C.muted, marginLeft: 6 }}>
                (replaces current primary <code>{candidate.master_primary_email}</code>)
              </span>
            )}
          </span>
        </label>

        <div>
          <div style={{ ...T.micro, marginBottom: 6 }}>Review notes (optional)</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why this match is correct…"
            rows={3}
            style={{ ...inputStyle, maxWidth: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
      </div>
    </Modal>
  )
}

// ── Modal: Reject ──────────────────────────────────────────────────────────

function RejectModal({
  candidate, onClose, onConfirm,
}: {
  candidate: Candidate
  onClose: () => void
  onConfirm: (notes: string) => Promise<void>
}) {
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      title="Reject email candidate"
      subtitle={`${candidate.email} → ${displayName(candidate)}`}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Btn label="Cancel" variant="ghost" onClick={onClose} disabled={busy} />
          <Btn
            label={busy ? "Rejecting…" : "Reject"}
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try { await onConfirm(notes.trim()) } finally { setBusy(false) }
            }}
          />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...T.small, color: C.text }}>
          The candidate will be marked rejected and won't be re-proposed by future Stage-4 runs.
        </div>
        <div>
          <div style={{ ...T.micro, marginBottom: 6 }}>Reason (optional)</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. shared mailing-list, name collision, wrong company…"
            rows={3}
            style={{ ...inputStyle, maxWidth: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
      </div>
    </Modal>
  )
}

// ── Row ────────────────────────────────────────────────────────────────────

function CandidateRow({
  c, onOpenContact, onAccept, onReject,
}: {
  c: Candidate
  onOpenContact: (id: string) => void
  onAccept: (c: Candidate) => void
  onReject: (c: Candidate) => void
}) {
  const band = getBand(c)
  const hits = c.match_evidence?.hits ?? null
  const rev = c.master_revenue ? Number(c.master_revenue) : 0

  return (
    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
      <td style={{ ...cellStyle, width: "32%" }}>
        <button
          onClick={() => onOpenContact(c.master_id)}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            color: C.text, textAlign: "left", display: "flex", flexDirection: "column", gap: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 600, color: C.gold, textDecoration: "underline" }}>
              {displayName(c)}
            </span>
            {tierBadge(c.master_tier)}
          </div>
          <div style={{ ...T.small, display: "flex", gap: 10, alignItems: "center" }}>
            {c.master_primary_email && (
              <span style={{ color: C.muted, fontFamily: "monospace", fontSize: 11 }}>
                {c.master_primary_email}
              </span>
            )}
            {rev > 0 && (
              <span style={{ color: C.muted }}>
                · {fmtMoney(rev)}
              </span>
            )}
          </div>
        </button>
      </td>
      <td style={{ ...cellStyle, fontFamily: "monospace", fontSize: 12, color: C.text, wordBreak: "break-all" }}>
        {c.email}
      </td>
      <td style={cellStyle}>{bandBadge(band)}</td>
      <td style={{ ...cellStyle, ...T.small, color: C.muted, textAlign: "center" as const }}>
        {hits !== null ? hits : "—"}
      </td>
      <td style={{ ...cellStyle, ...T.small, color: C.muted, whiteSpace: "nowrap" as const }}>
        {relativeTime(c.created_at)}
      </td>
      <td style={{ ...cellStyle, textAlign: "right" as const, whiteSpace: "nowrap" as const }}>
        <div style={{ display: "inline-flex", gap: 6 }}>
          <Btn label="Accept" variant="gold" onClick={() => onAccept(c)} />
          <Btn label="Reject" variant="ghost" onClick={() => onReject(c)} />
        </div>
      </td>
    </tr>
  )
}

const cellStyle = { padding: S.cellPadding, verticalAlign: "top" as const }

// ── Main Tab ───────────────────────────────────────────────────────────────

export function EmailCandidatesTab() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterBand>("all")
  const [acceptTarget, setAcceptTarget] = useState<Candidate | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Candidate | null>(null)
  const [openContactId, setOpenContactId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  const load = useCallback(() => {
    setLoading(true)
    fetch("/admin/crm/email-candidates?status=pending", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        setCandidates(Array.isArray(d.candidates) ? d.candidates : [])
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // Stats by band
  const stats = useMemo(() => {
    const s = { total: candidates.length, high: 0, mid: 0, shared: 0 }
    for (const c of candidates) {
      const b = getBand(c)
      s[b] += 1
    }
    return s
  }, [candidates])

  // Filter + sort: band priority, then created_at ASC (oldest first — review queue)
  const filtered = useMemo(() => {
    const arr = filter === "all" ? candidates : candidates.filter((c) => getBand(c) === filter)
    return [...arr].sort((a, b) => {
      const ba = BAND_ORDER[getBand(a)]
      const bb = BAND_ORDER[getBand(b)]
      if (ba !== bb) return ba - bb
      return a.created_at.localeCompare(b.created_at)
    })
  }, [candidates, filter])

  const visible = filtered.slice(0, page * PAGE_SIZE)
  const hasMore = filtered.length > visible.length

  // Reset pagination when filter changes
  useEffect(() => { setPage(1) }, [filter])

  // Actions
  const handleAccept = useCallback(async (cand: Candidate, setPrimary: boolean, notes: string) => {
    try {
      const r = await fetch(`/admin/crm/email-candidates/${cand.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept", set_primary: setPrimary, notes: notes || undefined }),
      })
      const data = await r.json()
      if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`)
      setCandidates((prev) => prev.filter((c) => c.id !== cand.id))
      setAcceptTarget(null)
      setToast({ msg: `Accepted ${cand.email}`, type: "success" })
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : String(e), type: "error" })
    }
  }, [])

  const handleReject = useCallback(async (cand: Candidate, notes: string) => {
    try {
      const r = await fetch(`/admin/crm/email-candidates/${cand.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", notes: notes || undefined }),
      })
      const data = await r.json()
      if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`)
      setCandidates((prev) => prev.filter((c) => c.id !== cand.id))
      setRejectTarget(null)
      setToast({ msg: `Rejected ${cand.email}`, type: "success" })
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : String(e), type: "error" })
    }
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading && candidates.length === 0) {
    return <div style={{ padding: 32, color: C.muted }}>Loading email candidates…</div>
  }
  if (error) {
    return (
      <div style={{ padding: 32, color: C.error }}>
        <b>Error:</b> {error}
      </div>
    )
  }

  return (
    <div>
      {/* Stats grid (4 stat cards) */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: 1, background: C.border, borderRadius: S.radius.lg, overflow: "hidden", marginBottom: 16,
      }}>
        <StatCard label="Pending" value={fmtNum(stats.total)} />
        <StatCard label="High" value={fmtNum(stats.high)} color={C.success} />
        <StatCard label="Mid" value={fmtNum(stats.mid)} color={C.blue} />
        <StatCard label="Shared" value={fmtNum(stats.shared)} color={C.warning} />
      </div>

      {/* Filter row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "high", "mid", "shared"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setFilter(b)}
              style={{
                fontSize: 12, fontWeight: 600, padding: "6px 12px",
                borderRadius: S.radius.md, cursor: "pointer",
                background: filter === b ? C.text : "transparent",
                color: filter === b ? "#fff" : C.muted,
                border: `1px solid ${filter === b ? C.text : C.border}`,
                textTransform: "capitalize",
              }}
            >
              {b}{b !== "all" && ` (${stats[b]})`}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          style={{
            background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: S.radius.md, padding: "6px 12px", fontSize: 12,
            color: C.text, cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="✉️"
          title={candidates.length === 0 ? "No pending candidates" : "Nothing matches this filter"}
          description={candidates.length === 0
            ? "Run Stage-4 IMAP body matching to populate this queue."
            : "Switch back to All to see the full queue."}
        />
      ) : (
        <>
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: S.radius.lg, overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: C.subtle }}>
                <tr>
                  <th style={headerStyle}>Contact</th>
                  <th style={headerStyle}>Candidate Email</th>
                  <th style={headerStyle}>Band</th>
                  <th style={{ ...headerStyle, textAlign: "center" }}>Hits</th>
                  <th style={headerStyle}>Created</th>
                  <th style={{ ...headerStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <CandidateRow
                    key={c.id}
                    c={c}
                    onOpenContact={setOpenContactId}
                    onAccept={setAcceptTarget}
                    onReject={setRejectTarget}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, ...T.small }}>
            <div>
              Showing <b>{visible.length}</b> of <b>{filtered.length}</b>
              {filter !== "all" && <> (filtered from {candidates.length})</>}
            </div>
            {hasMore && (
              <button
                onClick={() => setPage((p) => p + 1)}
                style={{
                  background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: S.radius.md, padding: "6px 14px", fontSize: 12,
                  color: C.text, cursor: "pointer",
                }}
              >
                Show {Math.min(PAGE_SIZE, filtered.length - visible.length)} more
              </button>
            )}
          </div>
        </>
      )}

      {/* Modals */}
      {acceptTarget && (
        <AcceptModal
          candidate={acceptTarget}
          hasPrimary={!!acceptTarget.master_primary_email}
          onClose={() => setAcceptTarget(null)}
          onConfirm={(setPrimary, notes) => handleAccept(acceptTarget, setPrimary, notes)}
        />
      )}
      {rejectTarget && (
        <RejectModal
          candidate={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={(notes) => handleReject(rejectTarget, notes)}
        />
      )}

      {/* Contact drawer */}
      <ContactDetailDrawer
        contactId={openContactId}
        onClose={() => setOpenContactId(null)}
      />

      {/* Toast */}
      {toast && (
        <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />
      )}
    </div>
  )
}

// ── Local primitives ───────────────────────────────────────────────────────

const headerStyle = {
  ...T.micro,
  textAlign: "left" as const,
  padding: S.cellPadding,
  borderBottom: `1px solid ${C.border}`,
  background: C.subtle,
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: C.card, padding: "14px 16px" }}>
      <div style={T.micro}>{label}</div>
      <div style={{ ...T.stat, color: color || C.text, marginTop: 2 }}>{value}</div>
    </div>
  )
}
