import { useState, useEffect, useCallback } from "react"
import { useAdminNav } from "../../../components/admin-nav"
import { C, T, S } from "../../../components/admin-tokens"
import { PageHeader, SectionHeader, PageShell, StatsGrid } from "../../../components/admin-layout"
import { Btn, Toast, Modal, Alert, Badge, inputStyle } from "../../../components/admin-ui"
import { displayFormat, type FormatValue } from "../../../../lib/format-mapping"

// ─── Types ──────────────────────────────────────────────────────────────────

interface Stats {
  total_releases: number
  eligible: number
  distinct_releases: number
  verified: number
  missing: number
  remaining: number
  additional_copies: number
  avg_verified_price: number
  verified_value: number
  projected_remaining_value: number
  today: { verified: number; copies_added: number; price_changed: number }
  format_breakdown: Array<{ format_group: string; total: number; verified: number }>
  bulk_status: {
    executed: boolean
    executed_at?: string
    executed_by?: string
    percentage?: number
    affected_rows?: number
  }
}

interface BrowseItem {
  release_id: string
  title: string
  cover_image: string | null
  format: string
  format_v2: string | null
  catalog_number: string | null
  legacy_price: number | null
  artist_name: string | null
  label_name: string | null
  exemplar_count: number
  verified_count: number
  last_verified_at: string | null
}

interface BulkPreview {
  eligible_count: number
  percentage: number
  already_executed: { executed_at: string; executed_by: string; affected_rows: number } | null
  sample: Array<{ release_id: string; artist: string | null; title: string; old_price: number; new_price: number }>
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

  // Browse state
  const [browseTab, setBrowseTab] = useState("all")
  const [browseItems, setBrowseItems] = useState<BrowseItem[]>([])
  const [browseTotal, setBrowseTotal] = useState(0)
  const [browseOffset, setBrowseOffset] = useState(0)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseSearch, setBrowseSearch] = useState("")
  const BROWSE_LIMIT = 50

  // Bulk preview state
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkConfirmation, setBulkConfirmation] = useState("")
  const [bulkExecuting, setBulkExecuting] = useState(false)

  // Missing bulk state
  const [showMissingModal, setShowMissingModal] = useState(false)
  const [missingConfirmation, setMissingConfirmation] = useState("")
  const [missingExecuting, setMissingExecuting] = useState(false)

  // ── Load stats ──

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

  // ── Load browse ──

  const loadBrowse = useCallback(async (tab: string, offset: number, search: string) => {
    setBrowseLoading(true)
    try {
      const params = new URLSearchParams({
        tab,
        offset: String(offset),
        limit: String(BROWSE_LIMIT),
      })
      if (search) params.set("q", search)
      const data = await apiFetch<{ items: BrowseItem[]; total: number }>(
        `/admin/erp/inventory/browse?${params}`
      )
      setBrowseItems(data.items)
      setBrowseTotal(data.total)
    } catch (e: any) {
      setToast({ message: e.message, type: "error" })
    } finally {
      setBrowseLoading(false)
    }
  }, [])

  // Browse fires parallel zu Stats (kein Warten auf `loading`) — sonst 2
  // sequentielle Round-Trips, die gemeinsam gefuehlt ~1s kosten.
  useEffect(() => {
    loadBrowse(browseTab, browseOffset, browseSearch)
  }, [browseTab, browseOffset, browseSearch, loadBrowse])

  // ── Handlers ──

  const handleTabChange = (tab: string) => {
    setBrowseTab(tab)
    setBrowseOffset(0)
  }

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

  const handleMarkMissingBulk = async () => {
    setMissingExecuting(true)
    try {
      const result = await apiFetch<{ affected: number }>("/admin/erp/inventory/mark-missing-bulk", {
        method: "POST",
        body: JSON.stringify({ confirmation: "MARK ALL MISSING" }),
      })
      setToast({ message: `${result.affected} items marked as missing`, type: "success" })
      setShowMissingModal(false)
      setMissingConfirmation("")
      loadStats()
      loadBrowse(browseTab, browseOffset, browseSearch)
    } catch (e: any) {
      setToast({ message: e.message, type: "error" })
    } finally {
      setMissingExecuting(false)
    }
  }

  // ── Render ──
  //
  // Kein Full-Page-Loading-Block mehr (Frank hat "5-10s Ladezeit bevor
  // überhaupt etwas erscheint" gemeldet). Page rendert Struktur sofort,
  // Stats-Zellen zeigen "—" als Placeholder bis stats gefetcht sind.
  // Backend-Endpoint /stats ist zwar seit rc34 optimiert (150ms) aber
  // die gefühlte Performance wird durch Skeleton-Rendering besser weil
  // der User sofort den Kontext der Seite sieht.

  if (error && !stats) {
    return <PageShell><Alert type="error">{error}</Alert></PageShell>
  }

  const progressPercent = stats
    ? Math.round(((stats.verified + stats.missing) / Math.max(stats.eligible, 1)) * 100)
    : 0
  const statPlaceholder = "—"

  const formatEur = (n: number) => {
    if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(2)}M`
    if (n >= 10_000) return `€${Math.round(n / 1_000)}k`
    if (n >= 1_000) return `€${(n / 1_000).toFixed(1)}k`
    return `€${Math.round(n).toLocaleString("de-DE")}`
  }

  const totalPages = Math.ceil(browseTotal / BROWSE_LIMIT)
  const currentPage = Math.floor(browseOffset / BROWSE_LIMIT) + 1

  const cardStyle: React.CSSProperties = {
    background: C.card,
    borderRadius: S.radius.lg,
    border: `1px solid ${C.border}`,
    padding: "16px 20px",
    marginBottom: 24,
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 10px",
    textAlign: "left",
    fontSize: 10,
    fontWeight: 700,
    color: C.muted,
    textTransform: "uppercase",
    borderBottom: `1px solid ${C.border}`,
  }
  const tdStyle: React.CSSProperties = {
    padding: "8px 10px",
    fontSize: 13,
    borderBottom: `1px solid ${C.border}08`,
  }

  return (
    <PageShell maxWidth={1000}>
      <PageHeader
        title="Inventory Stocktake"
        subtitle={`${(stats as any)?.total_releases?.toLocaleString() || "..."} releases im Katalog · ${stats?.eligible.toLocaleString() || "..."} exemplars im Inventar`}
        badge={
          progressPercent === 100
            ? { label: "COMPLETE", color: C.success }
            : progressPercent > 0
            ? { label: `${progressPercent}%`, color: C.gold }
            : undefined
        }
      />

      {/* ── Stats Grid ── Skeleton-Rendering: Zellen immer da, Werte
          ersetzen sich sobald der /stats-Fetch zurückkommt. Kein Full-Page-
          Loading-Block mehr. */}
      <>
        <StatsGrid
          stats={[
            { label: "Katalog gesamt", value: stats?.total_releases?.toLocaleString() ?? statPlaceholder },
            { label: "Im Inventar", value: stats?.eligible?.toLocaleString() ?? statPlaceholder, color: C.gold },
            {
              label: "Verifiziert",
              value: stats?.verified?.toLocaleString() ?? statPlaceholder,
              subtitle: stats ? `${formatEur(stats.verified_value)} Wert` : undefined,
              color: C.success,
            },
            {
              label: "Ausstehend",
              value: stats?.remaining?.toLocaleString() ?? statPlaceholder,
              subtitle: stats && stats.remaining > 0 ? `≈ ${formatEur(stats.projected_remaining_value)} Hochrechnung` : undefined,
              color: stats && stats.remaining > 0 ? C.warning : C.success,
            },
          ]}
        />
      </>
      {stats && (
        <>

          {/* Progress bar */}
          <div style={{ marginTop: 16, marginBottom: 8 }}>
            <div style={{ height: 8, borderRadius: 4, background: C.border, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${progressPercent}%`,
                background: `linear-gradient(90deg, ${C.gold}, ${C.success})`,
                borderRadius: 4,
                transition: "width 0.5s ease",
              }} />
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4, textAlign: "right" }}>
              {stats.verified + stats.missing} / {stats.eligible} processed ({progressPercent}%)
            </div>
          </div>

          {/* Today + Format Breakdown */}
          <div style={{ display: "flex", gap: S.gap.lg, marginBottom: S.sectionGap }}>
            {/* Today's stats */}
            <div style={{ ...cardStyle, flex: 1, marginBottom: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Heute</div>
              <div style={{ display: "flex", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.fg }}>{stats.today.verified}</div>
                  <div style={{ ...T.small, color: C.muted }}>verifiziert</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.fg }}>{stats.today.copies_added}</div>
                  <div style={{ ...T.small, color: C.muted }}>neue Kopien</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.fg }}>{stats.today.price_changed}</div>
                  <div style={{ ...T.small, color: C.muted }}>Preise geändert</div>
                </div>
              </div>
            </div>

            {/* Format breakdown */}
            <div style={{ ...cardStyle, flex: 1, marginBottom: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Format-Fortschritt</div>
              {stats.format_breakdown.map((f) => {
                const pct = f.total > 0 ? Math.round((f.verified / f.total) * 100) : 0
                return (
                  <div key={f.format_group} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 50, ...T.small, color: C.muted }}>{f.format_group}</div>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: C.gold, borderRadius: 3 }} />
                    </div>
                    <div style={{ width: 80, ...T.small, color: C.muted, textAlign: "right" }}>
                      {f.verified}/{f.total}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Action Cards ── */}
      <div style={{ display: "flex", gap: S.gap.md, marginBottom: S.sectionGap }}>
        <div style={{ ...cardStyle, flex: 1, marginBottom: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.fg }}>Stocktake Session</div>
            <div style={{ ...T.small, color: C.muted }}>Suche + Bewertung + Label-Druck</div>
          </div>
          <Btn label="Session starten" variant="primary" onClick={() => { window.location.href = "/app/erp/inventory/session" }} />
        </div>
        <div style={{ ...cardStyle, flex: 1, marginBottom: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.fg }}>Fehlbestands-Check</div>
            <div style={{ ...T.small, color: C.muted }}>{stats?.remaining || 0} Items nicht verifiziert</div>
          </div>
          <Btn
            label="Prüfen"
            variant={stats?.remaining === 0 ? "ghost" : "gold"}
            onClick={() => setShowMissingModal(true)}
            disabled={stats?.remaining === 0}
          />
        </div>
      </div>

      {/* ── Browse Table ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S.gap.md }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { key: "all", label: "Alle" },
            { key: "verified", label: "Verifiziert" },
            { key: "pending", label: "Ausstehend" },
            { key: "multi_copy", label: "Mehrere Ex." },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              style={{
                padding: "6px 14px",
                border: `1px solid ${browseTab === tab.key ? C.gold : C.border}`,
                borderRadius: 4,
                background: browseTab === tab.key ? `${C.gold}15` : "transparent",
                color: browseTab === tab.key ? C.gold : C.muted,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: browseTab === tab.key ? 600 : 400,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: S.gap.sm }}>
          <input
            type="text"
            value={browseSearch}
            onChange={(e) => { setBrowseSearch(e.target.value); setBrowseOffset(0) }}
            placeholder="Suche..."
            style={{ ...inputStyle, width: 200, fontSize: 12 }}
          />
          <Btn label="CSV" variant="ghost" onClick={() => { window.location.href = `/admin/erp/inventory/export?status=${browseTab === "verified" ? "verified" : browseTab === "pending" ? "pending" : "all"}` }} style={{ fontSize: 12 }} />
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        {!browseLoading && browseItems.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Keine Einträge</div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Cover</th>
                  <th style={thStyle}>Artist</th>
                  <th style={thStyle}>Title</th>
                  <th style={thStyle}>Format</th>
                  <th style={thStyle}>Preis</th>
                  <th style={thStyle}>Ex.</th>
                  <th style={thStyle}>Verifiziert</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {browseLoading && browseItems.length === 0 ? (
                  // Skeleton rows damit die Tabelle sofort sichtbar ist und
                  // sich das Layout nicht umbaut, sobald Daten kommen.
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={`skeleton-${i}`}>
                      <td style={tdStyle}>
                        <div style={{ width: 36, height: 36, background: C.subtle, borderRadius: 3 }} />
                      </td>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} style={tdStyle}>
                          <div style={{ height: 12, background: C.subtle, borderRadius: 2, width: `${50 + ((i * 7 + j) % 4) * 10}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : browseItems.map((item) => (
                  <tr
                    key={item.release_id}
                    style={{ cursor: "pointer", transition: "background 0.1s" }}
                    onClick={() => { window.location.href = `/app/media/${item.release_id}` }}
                    onMouseOver={(e) => (e.currentTarget.style.background = C.hover)}
                    onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={tdStyle}>
                      {item.cover_image
                        ? <img src={item.cover_image} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 3 }} />
                        : <div style={{ width: 36, height: 36, background: C.border, borderRadius: 3 }} />}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.artist_name || "—"}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </td>
                    <td style={{ ...tdStyle, ...T.small }}>{item.format_v2 ? displayFormat(item.format_v2 as FormatValue) : item.format}</td>
                    <td style={{ ...tdStyle, color: C.gold, fontWeight: 600 }}>
                      {item.legacy_price != null ? `€${item.legacy_price}` : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>{item.exemplar_count}</td>
                    <td style={{ ...tdStyle, ...T.small, color: C.muted, whiteSpace: "nowrap" }}>
                      {item.last_verified_at
                        ? new Date(item.last_verified_at).toLocaleString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td style={tdStyle}>
                      {item.verified_count >= item.exemplar_count
                        ? <Badge label="Done" variant="success" />
                        : item.verified_count > 0
                        ? <Badge label={`${item.verified_count}/${item.exemplar_count}`} variant="warning" />
                        : <Badge label="Pending" variant="neutral" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: `1px solid ${C.border}` }}>
                <div style={{ ...T.small, color: C.muted }}>
                  {browseTotal.toLocaleString()} Einträge · Seite {currentPage} von {totalPages}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn label="← Prev" variant="ghost" disabled={browseOffset === 0} onClick={() => setBrowseOffset(Math.max(0, browseOffset - BROWSE_LIMIT))} style={{ fontSize: 12 }} />
                  <Btn label="Next →" variant="ghost" disabled={currentPage >= totalPages} onClick={() => setBrowseOffset(browseOffset + BROWSE_LIMIT)} style={{ fontSize: 12 }} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Bulk Price Adjustment ── */}
      <SectionHeader title="Bulk Price Adjustment (+15%)" />
      <div style={cardStyle}>
        {stats?.bulk_status.executed ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.success }}>EXECUTED</span>
            <span style={{ fontSize: 13, color: C.fg }}>
              +{stats.bulk_status.percentage}% on {stats.bulk_status.affected_rows?.toLocaleString()} items
              {" "}on {stats.bulk_status.executed_at ? new Date(stats.bulk_status.executed_at).toLocaleDateString("de-DE") : ""}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Raise all Cohort A prices by +15%, rounded to whole euros</div>
              <div style={{ ...T.small, color: C.muted }}>Example: €10 → €12 · €50 → €58</div>
            </div>
            <Btn label="Preview +15%" variant="gold" onClick={handleBulkPreview} />
          </div>
        )}
      </div>

      {/* ── Bulk Preview Modal ── */}
      {showBulkModal && bulkPreview && (
        <Modal title="Bulk Price Adjustment Preview" subtitle={`${bulkPreview.eligible_count.toLocaleString()} items`} onClose={() => setShowBulkModal(false)}
          footer={<>
            <Btn label="Cancel" variant="ghost" onClick={() => setShowBulkModal(false)} />
            <Btn label={bulkExecuting ? "Executing..." : "Execute +15%"} variant="danger" disabled={bulkConfirmation !== "RAISE PRICES 15 PERCENT" || bulkExecuting} onClick={handleBulkExecute} />
          </>}
        >
          {bulkPreview.already_executed ? (
            <Alert type="warning">Already executed on {new Date(bulkPreview.already_executed.executed_at).toLocaleDateString("de-DE")}</Alert>
          ) : (
            <>
              <div style={{ maxHeight: 300, overflow: "auto", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr>{["Artist", "Title", "Old", "New"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                  <tbody>{bulkPreview.sample.map((item) => (
                    <tr key={item.release_id}>
                      <td style={tdStyle}>{item.artist || "—"}</td>
                      <td style={tdStyle}>{item.title}</td>
                      <td style={{ ...tdStyle, color: C.muted }}>€{item.old_price}</td>
                      <td style={{ ...tdStyle, color: C.gold, fontWeight: 600 }}>€{item.new_price}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div style={{ ...T.small, color: C.muted, marginBottom: 8 }}>Type <strong style={{ color: C.fg }}>RAISE PRICES 15 PERCENT</strong> to confirm</div>
              <input style={{ ...inputStyle, maxWidth: "100%", fontFamily: "monospace" }} value={bulkConfirmation} onChange={(e) => setBulkConfirmation(e.target.value)} placeholder="RAISE PRICES 15 PERCENT" autoFocus />
            </>
          )}
        </Modal>
      )}

      {/* ── Missing Bulk Modal ── */}
      {showMissingModal && (
        <Modal title="Fehlbestands-Check" subtitle={`${stats?.remaining || 0} Items nicht verifiziert`} onClose={() => { setShowMissingModal(false); setMissingConfirmation("") }}
          footer={<>
            <Btn label="Abbrechen" variant="ghost" onClick={() => { setShowMissingModal(false); setMissingConfirmation("") }} />
            <Btn label="CSV Export" variant="ghost" onClick={() => { window.location.href = "/admin/erp/inventory/export?status=pending" }} />
            <Btn label={missingExecuting ? "Markiere..." : "Alle als fehlend markieren"} variant="danger" disabled={missingConfirmation !== "MARK ALL MISSING" || missingExecuting} onClick={handleMarkMissingBulk} />
          </>}
        >
          <p style={{ color: C.muted, marginBottom: 16 }}>
            {stats?.remaining || 0} Exemplare wurden nach der Inventur nicht verifiziert.
            Diese Items werden als fehlend markiert (Preis → €0, Sync-geschützt).
          </p>
          <Alert type="warning">
            Diese Aktion setzt den Preis aller nicht-verifizierten Items auf €0.
            Die Items bleiben im Katalog, sind aber nicht kaufbar.
            Rückgängig: Manuell pro Item über Reset in der Session.
          </Alert>
          <div style={{ marginTop: 16 }}>
            <div style={{ ...T.small, color: C.muted, marginBottom: 8 }}>Type <strong style={{ color: C.fg }}>MARK ALL MISSING</strong> to confirm</div>
            <input style={{ ...inputStyle, maxWidth: "100%", fontFamily: "monospace" }} value={missingConfirmation} onChange={(e) => setMissingConfirmation(e.target.value)} placeholder="MARK ALL MISSING" autoFocus />
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </PageShell>
  )
}

export default InventoryHubPage
