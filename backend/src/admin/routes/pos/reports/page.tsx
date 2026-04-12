import { useState, useEffect } from "react"
import { useAdminNav } from "../../../components/admin-nav"
import { C, S, fmtMoney } from "../../../components/admin-tokens"
import { PageHeader } from "../../../components/admin-layout"
import { Btn, Toast } from "../../../components/admin-ui"

// ─── Types ──────────────────────────────────────────────────────────────────

interface PosTransaction {
  id: string
  order_number: string
  total: number
  subtotal: number
  discount: number
  payment_provider: string
  items_count: number
  customer_name: string | null
  customer_email: string | null
  created_at: string
  tse_signature: string | null
}

interface PosStats {
  today: { count: number; total: number; items: number; avg: number }
  yesterday: { count: number; total: number; items: number; avg: number }
  week: { count: number; total: number; items: number; avg: number }
  all_time: { count: number; total: number; items: number; avg: number }
  deltas: { today_vs_yesterday: number | null; week_vs_last_week: number | null }
  payment_breakdown: Array<{ method: string; label: string; count: number; total: number }>
}

type Period = "today" | "yesterday" | "week" | "all"

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This Week",
  all: "All Time",
}

const PAYMENT_ICONS: Record<string, string> = {
  sumup: "💳",
  cash: "💵",
  paypal: "🅿️",
  bank_transfer: "🏦",
}

// ─── API Helper ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ─── Main Reports Page ──────────────────────────────────────────────────────

function POSReportsPage() {
  useAdminNav()

  // Read period from URL
  const urlParams = new URLSearchParams(window.location.search)
  const initialPeriod = (urlParams.get("period") || "today") as Period

  const [period, setPeriod] = useState<Period>(initialPeriod)
  const [stats, setStats] = useState<PosStats | null>(null)
  const [transactions, setTransactions] = useState<PosTransaction[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const limit = 50

  // Load stats
  useEffect(() => {
    apiFetch<PosStats>("/admin/pos/stats").then(setStats).catch(() => {})
  }, [])

  // Load transactions when period or offset changes
  useEffect(() => {
    setLoading(true)
    apiFetch<{ transactions: PosTransaction[]; total: number }>(
      `/admin/pos/transactions?period=${period}&limit=${limit}&offset=${offset}`
    ).then((data) => {
      setTransactions(data.transactions)
      setTotalCount(data.total)
    }).catch(() => {
      setTransactions([])
    }).finally(() => setLoading(false))
  }, [period, offset])

  // Update URL when period changes
  const changePeriod = (p: Period) => {
    setPeriod(p)
    setOffset(0)
    window.history.replaceState({}, "", `/app/pos/reports?period=${p}`)
  }

  const currentStats = stats ? stats[period === "all" ? "all_time" : period] : null

  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
  }

  return (
    <div style={{ padding: S.pagePadding, maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader
        title="POS Reports"
        subtitle="Sales history and analytics"
        actions={
          <Btn label="← Back to POS" variant="ghost" onClick={() => { window.location.href = "/app/pos" }} />
        }
      />

      {/* Period Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {(["today", "yesterday", "week", "all"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => changePeriod(p)}
            style={{
              padding: "8px 20px", fontSize: 13, fontWeight: 600,
              border: `2px solid ${period === p ? C.gold : C.border}`,
              borderRadius: S.radius.md, cursor: "pointer",
              background: period === p ? `${C.gold}12` : "#fff",
              color: period === p ? C.gold : C.muted,
            }}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      {currentStats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {([
            { label: "Revenue", value: fmtMoney(currentStats.total), sub: null },
            { label: "Sales", value: String(currentStats.count), sub: null },
            { label: "Avg. Sale", value: fmtMoney(currentStats.avg), sub: null },
            { label: "Items Sold", value: String(currentStats.items), sub: currentStats.count > 0 ? `${(currentStats.items / currentStats.count).toFixed(1)} per sale` : null },
          ]).map((card) => (
            <div key={card.label} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: S.radius.md,
              padding: "14px 16px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.muted, letterSpacing: "0.06em", marginBottom: 6 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>
                {card.value}
              </div>
              {card.sub && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{card.sub}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Payment Breakdown */}
      {stats && stats.payment_breakdown.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.muted, letterSpacing: "0.06em", marginBottom: 10 }}>
            Payment Methods (All Time)
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {stats.payment_breakdown.map((p) => {
              const pct = stats.all_time.total > 0 ? (p.total / stats.all_time.total * 100).toFixed(0) : "0"
              return (
                <div key={p.method} style={{
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: S.radius.md,
                  padding: "10px 16px", flex: 1,
                }}>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>
                    {PAYMENT_ICONS[p.method] || ""} {p.label}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                    {fmtMoney(p.total)}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {p.count} sales · {pct}%
                  </div>
                  {/* Simple bar */}
                  <div style={{ marginTop: 6, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: 4, background: C.gold, borderRadius: 2, width: `${pct}%`, transition: "width 0.3s" }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Transaction List */}
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.muted, letterSpacing: "0.06em", marginBottom: 10 }}>
        Transactions — {PERIOD_LABELS[period]} ({totalCount})
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading...</div>
      ) : transactions.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: C.muted }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>&#128722;</div>
          <div>No POS transactions for this period.</div>
        </div>
      ) : (
        <>
          <div style={{
            border: `1px solid ${C.border}`, borderRadius: S.radius.lg, overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.card }}>
                  <th style={thStyle}>Time</th>
                  <th style={thStyle}>Order #</th>
                  <th style={thStyle}>Customer</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Items</th>
                  <th style={thStyle}>Payment</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}
                    onClick={() => window.location.href = `/app/transactions/${tx.id}`}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: C.muted }}>{fmtTime(tx.created_at)}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 12 }}>
                        {tx.order_number}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {tx.customer_name || <span style={{ color: C.muted }}>Walk-in</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {tx.items_count}
                    </td>
                    <td style={tdStyle}>
                      <span>{PAYMENT_ICONS[tx.payment_provider] || ""} {tx.payment_provider}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                      {fmtMoney(tx.total)}
                      {tx.discount > 0 && (
                        <div style={{ fontSize: 10, color: C.muted }}>-{fmtMoney(tx.discount)} disc.</div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                      <a
                        href={`/admin/pos/transactions/${tx.id}/receipt`}
                        target="_blank"
                        rel="noopener"
                        style={{ color: C.gold, textDecoration: "none", fontSize: 12, fontWeight: 600 }}
                      >
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalCount > limit && (
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
              <Btn
                label="← Previous"
                variant="ghost"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              />
              <span style={{ fontSize: 12, color: C.muted, padding: "8px 0" }}>
                {offset + 1}–{Math.min(offset + limit, totalCount)} of {totalCount}
              </span>
              <Btn
                label="Next →"
                variant="ghost"
                disabled={offset + limit >= totalCount}
                onClick={() => setOffset(offset + limit)}
              />
            </div>
          )}
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.04em", color: C.muted,
}

const tdStyle: React.CSSProperties = {
  padding: "10px 14px", color: C.text,
}

export default POSReportsPage
