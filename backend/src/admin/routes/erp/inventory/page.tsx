import { useState, useEffect, useCallback } from "react"
import { useAdminNav } from "../../../components/admin-nav"
import { C, S } from "../../../components/admin-tokens"
import { PageHeader, SectionHeader, PageShell, StatsGrid } from "../../../components/admin-layout"
import { Btn, Toast, Modal, Alert, inputStyle } from "../../../components/admin-ui"

// ─── Types ──────────────────────────────────────────────────────────────────

interface Stats {
  eligible: number
  verified: number
  missing: number
  remaining: number
  bulk_status: {
    executed: boolean
    executed_at?: string
    executed_by?: string
    percentage?: number
    affected_rows?: number
  }
}

interface BulkPreview {
  eligible_count: number
  percentage: number
  already_executed: {
    executed_at: string
    executed_by: string
    affected_rows: number
  } | null
  sample: Array<{
    release_id: string
    artist: string | null
    title: string
    old_price: number
    new_price: number
  }>
}

// ─── API Helper ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json()
}

// ─── Main Page ──────────────────────────────────────────────────────────────

function InventoryHubPage() {
  useAdminNav()

  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  // Bulk preview state
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkConfirmation, setBulkConfirmation] = useState("")
  const [bulkExecuting, setBulkExecuting] = useState(false)

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch<Stats>("/admin/erp/inventory/stats")
      setStats(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  const handleBulkPreview = async () => {
    try {
      const data = await apiFetch<BulkPreview>("/admin/erp/inventory/bulk-price-adjust")
      setBulkPreview(data)
      setShowBulkModal(true)
    } catch (e: any) {
      setToast({ message: e.message, type: "error" })
    }
  }

  const handleBulkExecute = async () => {
    setBulkExecuting(true)
    try {
      await apiFetch("/admin/erp/inventory/bulk-price-adjust", {
        method: "POST",
        body: JSON.stringify({ percentage: 15, confirmation: "RAISE PRICES 15 PERCENT" }),
      })
      setToast({ message: "Prices adjusted +15% successfully", type: "success" })
      setShowBulkModal(false)
      loadStats()
    } catch (e: any) {
      setToast({ message: e.message, type: "error" })
    } finally {
      setBulkExecuting(false)
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div style={{ color: C.muted, fontSize: 13 }}>Loading inventory stats...</div>
      </PageShell>
    )
  }

  if (error && !stats) {
    return (
      <PageShell>
        <Alert type="error">{error}</Alert>
      </PageShell>
    )
  }

  const progressPercent = stats
    ? Math.round(((stats.verified + stats.missing) / Math.max(stats.eligible, 1)) * 100)
    : 0

  return (
    <PageShell maxWidth={880}>
      <PageHeader
        title="Inventory Stocktake"
        subtitle={`Cohort A — ${stats?.eligible.toLocaleString("en-US") || "..."} items with image and price`}
        badge={
          progressPercent === 100
            ? { label: "COMPLETE", color: C.success }
            : progressPercent > 0
            ? { label: `${progressPercent}%`, color: C.gold }
            : undefined
        }
      />

      {/* Stats Grid */}
      {stats && (
        <>
          <StatsGrid
            stats={[
              { label: "Total eligible", value: stats.eligible.toLocaleString("en-US") },
              { label: "Verified", value: stats.verified.toLocaleString("en-US"), color: C.success },
              { label: "Missing", value: stats.missing.toLocaleString("en-US"), color: stats.missing > 0 ? C.warning : C.muted },
              { label: "Remaining", value: stats.remaining.toLocaleString("en-US"), color: stats.remaining > 0 ? C.gold : C.success },
            ]}
          />

          {/* Progress bar */}
          <div style={{ marginTop: 16, marginBottom: 24 }}>
            <div style={{ height: 8, borderRadius: 4, background: C.border, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${progressPercent}%`,
                  background: `linear-gradient(90deg, ${C.gold}, ${C.success})`,
                  borderRadius: 4,
                  transition: "width 0.5s ease",
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4, textAlign: "right" }}>
              {stats.verified + stats.missing} / {stats.eligible} processed ({progressPercent}%)
            </div>
          </div>
        </>
      )}

      {/* Bulk Price Adjustment Section */}
      <SectionHeader title="Bulk Price Adjustment (+15%)" />
      <div
        style={{
          background: C.card,
          borderRadius: S.radius.lg,
          border: `1px solid ${C.border}`,
          padding: "16px 20px",
          marginBottom: 24,
        }}
      >
        {stats?.bulk_status.executed ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.success }}>EXECUTED</span>
            <span style={{ fontSize: 13, color: C.text }}>
              +{stats.bulk_status.percentage}% on {stats.bulk_status.affected_rows?.toLocaleString("en-US")} items
              {" "}on {stats.bulk_status.executed_at ? new Date(stats.bulk_status.executed_at).toLocaleDateString("de-DE") : ""}
              {" "}by {stats.bulk_status.executed_by}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>
                Raise all Cohort A prices by +15%, rounded to whole euros
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                Example: €10 → €12 · €50 → €58 · €179 → €206
              </div>
            </div>
            <Btn label="Preview +15%" variant="gold" onClick={handleBulkPreview} />
          </div>
        )}
      </div>

      {/* Stocktake Session Section */}
      <SectionHeader title="Stocktake Session" />
      <div
        style={{
          background: C.card,
          borderRadius: S.radius.lg,
          border: `1px solid ${C.border}`,
          padding: "16px 20px",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>
            Review items one by one — verify, adjust price, or mark missing
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            Keyboard-driven: V=Verify · P=Price · M=Missing · S=Skip · U=Undo
          </div>
        </div>
        <Btn
          label={stats?.remaining === 0 ? "Complete" : "Start Session →"}
          variant={stats?.remaining === 0 ? "ghost" : "primary"}
          disabled={stats?.remaining === 0}
          onClick={() => { window.location.href = "/app/erp/inventory/session" }}
        />
      </div>

      {/* Export Section */}
      <SectionHeader title="Export" />
      <div
        style={{
          background: C.card,
          borderRadius: S.radius.lg,
          border: `1px solid ${C.border}`,
          padding: "16px 20px",
          display: "flex",
          gap: 10,
        }}
      >
        <Btn label="Export All (CSV)" variant="ghost" onClick={() => { window.location.href = "/admin/erp/inventory/export?status=all" }} />
        <Btn label="Verified Only" variant="ghost" onClick={() => { window.location.href = "/admin/erp/inventory/export?status=verified" }} />
        <Btn label="Missing Only" variant="ghost" onClick={() => { window.location.href = "/admin/erp/inventory/export?status=missing" }} />
        <Btn label="Pending Only" variant="ghost" onClick={() => { window.location.href = "/admin/erp/inventory/export?status=pending" }} />
      </div>

      {/* Bulk Preview Modal */}
      {showBulkModal && bulkPreview && (
        <Modal
          title="Bulk Price Adjustment Preview"
          subtitle={`${bulkPreview.eligible_count.toLocaleString("en-US")} items will be affected`}
          onClose={() => setShowBulkModal(false)}
          footer={
            <>
              <Btn label="Cancel" variant="ghost" onClick={() => setShowBulkModal(false)} />
              <Btn
                label={bulkExecuting ? "Executing..." : "Execute +15%"}
                variant="danger"
                disabled={bulkConfirmation !== "RAISE PRICES 15 PERCENT" || bulkExecuting}
                onClick={handleBulkExecute}
              />
            </>
          }
        >
          {bulkPreview.already_executed ? (
            <Alert type="warning">
              Already executed on {new Date(bulkPreview.already_executed.executed_at).toLocaleDateString("de-DE")}
              {" "}({bulkPreview.already_executed.affected_rows} items).
            </Alert>
          ) : (
            <>
              {/* Sample table */}
              <div style={{ maxHeight: 300, overflow: "auto", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["Artist", "Title", "Old Price", "New Price"].map((h) => (
                        <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPreview.sample.map((item) => (
                      <tr key={item.release_id}>
                        <td style={{ padding: "6px 10px", color: C.muted }}>{item.artist || "—"}</td>
                        <td style={{ padding: "6px 10px" }}>{item.title}</td>
                        <td style={{ padding: "6px 10px", color: C.muted }}>€{item.old_price}</td>
                        <td style={{ padding: "6px 10px", color: C.gold, fontWeight: 600 }}>€{item.new_price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
                Type <strong style={{ color: C.text }}>RAISE PRICES 15 PERCENT</strong> to confirm
              </div>
              <input
                style={{ ...inputStyle, maxWidth: "100%", fontFamily: "monospace", letterSpacing: "0.04em" }}
                value={bulkConfirmation}
                onChange={(e) => setBulkConfirmation(e.target.value)}
                placeholder="RAISE PRICES 15 PERCENT"
                autoFocus
              />
            </>
          )}
        </Modal>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </PageShell>
  )
}

export default InventoryHubPage
