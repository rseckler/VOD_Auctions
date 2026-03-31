import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { Container, Heading, Badge, Button, Text } from "@medusajs/ui"
import { useEffect, useState, useRef, useCallback } from "react"
import { useAdminNav } from "../../components/admin-nav"

type AuctionBlock = {
  id: string
  title: string
  subtitle: string | null
  slug: string
  status: string
  block_type: string
  start_time: string
  end_time: string
  items?: { id: string }[]
  created_at: string
}

type BlockSummary = {
  total: number
  paid: number
  unpaid: number
  refunded: number
  no_bid: number
  shipped: number
}

const STATUS_COLORS: Record<string, "green" | "orange" | "blue" | "grey" | "red" | "purple"> = {
  draft: "grey",
  scheduled: "blue",
  preview: "orange",
  active: "green",
  ended: "red",
  archived: "purple",
}

function useCountdown(endTime: string | null) {
  const [remaining, setRemaining] = useState("")
  useEffect(() => {
    if (!endTime) return
    const tick = () => {
      const diff = new Date(endTime).getTime() - Date.now()
      if (diff <= 0) { setRemaining("Ended"); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      if (h > 0) setRemaining(`${h}h ${m}m`)
      else setRemaining(`${m}m ${s}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endTime])
  return remaining
}

function ActiveCountdown({ endTime }: { endTime: string }) {
  const remaining = useCountdown(endTime)
  return <span className="font-mono text-green-400 text-sm font-semibold">{remaining}</span>
}

// ─── Standard table for live/upcoming/draft/archived blocks ──────────────────

function BlocksTable({
  rows,
  isLive = false,
  onDelete,
}: {
  rows: AuctionBlock[]
  isLive?: boolean
  onDelete: (block: AuctionBlock) => void
}) {
  const DELETABLE = ["draft", "ended", "archived"]
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
          {["Title", "Type", "Status", "Start", "End / Remaining", "Items", ""].map(h => (
            <th key={h} style={{
              textAlign: "left", padding: "8px 14px",
              fontSize: 10, fontWeight: 700, color: "#9ca3af",
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((block) => (
          <tr
            key={block.id}
            style={{
              borderBottom: "1px solid #f3f4f6",
              cursor: "pointer",
              background: isLive ? "rgba(22,163,74,0.04)" : "transparent",
              transition: "background 0.1s",
            }}
            onClick={() => { window.location.href = `/app/auction-blocks/${block.id}` }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
            onMouseLeave={e => (e.currentTarget.style.background = isLive ? "rgba(22,163,74,0.04)" : "transparent")}
          >
            <td style={{ padding: "12px 14px", maxWidth: 280 }}>
              <div style={{ fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {block.title}
              </div>
              {block.subtitle && (
                <div style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {block.subtitle}
                </div>
              )}
            </td>
            <td style={{ padding: "12px 14px" }}>
              <Badge>{block.block_type}</Badge>
            </td>
            <td style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Badge color={STATUS_COLORS[block.status] || "grey"}>{block.status}</Badge>
                {block.status === "active" && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 1.5s infinite" }} />
                    <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 700 }}>LIVE</span>
                  </span>
                )}
              </div>
            </td>
            <td style={{ padding: "12px 14px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>
              {new Date(block.start_time).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </td>
            <td style={{ padding: "12px 14px", fontSize: 12, whiteSpace: "nowrap" }}>
              {block.status === "active"
                ? <ActiveCountdown endTime={block.end_time} />
                : <span style={{ color: "#6b7280" }}>{new Date(block.end_time).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              }
            </td>
            <td style={{ padding: "12px 14px", color: "#6b7280" }}>{block.items?.length || 0}</td>
            <td style={{ padding: "12px 14px" }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", gap: 6 }}>
                <a href={`/app/auction-blocks/${block.id}`}>
                  <Button variant="secondary" size="small">
                    {block.status === "active" ? "Manage" : "Edit"}
                  </Button>
                </a>
                {DELETABLE.includes(block.status) && (
                  <Button variant="danger" size="small" onClick={() => onDelete(block)}>Delete</Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Ended block card — action-oriented ──────────────────────────────────────

function EndedBlockCard({
  block,
  summary,
  onDelete,
}: {
  block: AuctionBlock
  summary: BlockSummary | null
  onDelete: (block: AuctionBlock) => void
}) {
  const wonLots = summary ? summary.total - summary.no_bid : null
  const allDone = summary ? summary.shipped === wonLots && (wonLots ?? 0) > 0 : false
  const hasUrgent = summary ? summary.unpaid > 0 : false
  const hasPacking = summary ? (summary.paid - summary.shipped) > 0 : false

  const endedAgo = (() => {
    const diff = Date.now() - new Date(block.end_time).getTime()
    const h = Math.floor(diff / 3600000)
    const d = Math.floor(diff / 86400000)
    if (d >= 1) return `${d}d ago`
    if (h >= 1) return `${h}h ago`
    return "just now"
  })()

  return (
    <div
      style={{
        background: "#fff",
        border: allDone ? "1px solid #d1fae5" : hasUrgent ? "1.5px solid #fca5a5" : "1.5px solid #fed7aa",
        borderLeft: allDone ? "4px solid #22c55e" : hasUrgent ? "4px solid #ef4444" : "4px solid #f97316",
        borderRadius: 8,
        padding: "14px 16px",
        cursor: "pointer",
        transition: "box-shadow 0.15s",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "center",
      }}
      onClick={() => { window.location.href = `/app/auction-blocks/${block.id}` }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)")}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
    >
      {/* Left: info */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{block.title}</span>
          <span style={{ fontSize: 10, color: "#9ca3af" }}>{endedAgo}</span>
          <Badge>{block.block_type}</Badge>
        </div>
        {block.subtitle && (
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>{block.subtitle}</div>
        )}

        {/* To-Do badges */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {summary === null && (
            <span style={{ fontSize: 11, color: "#9ca3af" }}>Loading…</span>
          )}
          {summary && allDone && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "#dcfce7", color: "#15803d",
              borderRadius: 12, padding: "3px 10px", fontSize: 11, fontWeight: 700,
            }}>✓ All processed</span>
          )}
          {summary && !allDone && (
            <>
              {summary.unpaid > 0 && (
                <span style={{
                  background: "#fee2e2", color: "#b91c1c",
                  borderRadius: 12, padding: "3px 10px", fontSize: 11, fontWeight: 700,
                }}>⚠ {summary.unpaid} unpaid</span>
              )}
              {summary.refunded > 0 && (
                <span style={{
                  background: "#ede9fe", color: "#6d28d9",
                  borderRadius: 12, padding: "3px 10px", fontSize: 11, fontWeight: 600,
                }}>{summary.refunded} refunded</span>
              )}
              {summary.paid - summary.shipped > 0 && (
                <span style={{
                  background: "#fef3c7", color: "#b45309",
                  borderRadius: 12, padding: "3px 10px", fontSize: 11, fontWeight: 700,
                }}>📦 {summary.paid - summary.shipped} to pack/ship</span>
              )}
              {summary.no_bid > 0 && (
                <span style={{
                  background: "#f3f4f6", color: "#6b7280",
                  borderRadius: 12, padding: "3px 10px", fontSize: 11, fontWeight: 600,
                }}>{summary.no_bid} no bid</span>
              )}
              {summary.shipped > 0 && (
                <span style={{
                  background: "#eff6ff", color: "#1d4ed8",
                  borderRadius: 12, padding: "3px 10px", fontSize: 11, fontWeight: 600,
                }}>✓ {summary.shipped} shipped</span>
              )}
            </>
          )}
          <span style={{ fontSize: 11, color: "#d1d5db" }}>·</span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>
            {block.items?.length || 0} lots · ended {new Date(block.end_time).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>

      {/* Right: action button */}
      <div style={{ display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
        <a href={`/app/auction-blocks/${block.id}`}>
          <Button
            variant={allDone ? "secondary" : "primary"}
            size="small"
          >
            {allDone ? "View" : "Process →"}
          </Button>
        </a>
        <Button variant="danger" size="small" onClick={() => onDelete(block)}>Delete</Button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const AuctionBlocksPage = () => {
  useAdminNav()
  const [blocks, setBlocks] = useState<AuctionBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [summaries, setSummaries] = useState<Record<string, BlockSummary | null>>({})
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchBlocks = useCallback(async () => {
    try {
      const res = await fetch("/admin/auction-blocks", { credentials: "include" })
      const data = await res.json()
      const fetched: AuctionBlock[] = data.auction_blocks || []
      setBlocks(fetched)

      // Fetch summaries for ended blocks
      const endedBlocks = fetched.filter(b => b.status === "ended")
      if (endedBlocks.length > 0) {
        setSummaries(prev => {
          const init: Record<string, BlockSummary | null> = { ...prev }
          endedBlocks.forEach(b => { if (!(b.id in init)) init[b.id] = null })
          return init
        })
        await Promise.allSettled(
          endedBlocks.map(b =>
            fetch(`/admin/auction-blocks/${b.id}/post-auction`, { credentials: "include" })
              .then(r => r.json())
              .then(d => {
                if (d.summary) setSummaries(prev => ({ ...prev, [b.id]: d.summary }))
              })
              .catch(() => {})
          )
        )
      }
    } catch (err) {
      console.error("Failed to fetch blocks:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBlocks() }, [fetchBlocks])

  // Auto-refresh every 30s if any active blocks
  useEffect(() => {
    const hasActive = blocks.some((b) => b.status === "active")
    if (hasActive && !intervalRef.current) {
      intervalRef.current = setInterval(fetchBlocks, 30000)
    } else if (!hasActive && intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [blocks, fetchBlocks])

  const handleDelete = async (block: AuctionBlock) => {
    if (!window.confirm(`Delete auction "${block.title}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/admin/auction-blocks/${block.id}`, { method: "DELETE", credentials: "include" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert("Cannot delete: " + (data.message || res.statusText))
        return
      }
      setBlocks(prev => prev.filter(b => b.id !== block.id))
    } catch {
      alert("Cannot delete: Network error")
    }
  }

  const live     = blocks.filter(b => b.status === "active")
  const upcoming = blocks.filter(b => ["scheduled", "preview"].includes(b.status))
  const ended    = blocks.filter(b => b.status === "ended")
  const drafts   = blocks.filter(b => b.status === "draft")
  const archived = blocks.filter(b => b.status === "archived")

  // How many ended blocks still have open tasks
  const urgentCount = ended.filter(b => {
    const s = summaries[b.id]
    return s ? (s.unpaid > 0 || (s.paid - s.shipped) > 0) : true
  }).length

  return (
    <Container>
      <div className="flex flex-wrap items-center justify-between mb-6 gap-3">
        <div>
          <Heading level="h1">Auction Blocks</Heading>
          <Text className="text-ui-fg-subtle mt-1">Manage themed auction blocks</Text>
        </div>
        <a href="/app/auction-blocks/create">
          <Button>Create New Auction</Button>
        </a>
      </div>

      {loading && <Text>Loading…</Text>}

      {!loading && blocks.length === 0 && (
        <Container className="text-center py-12">
          <Text className="text-ui-fg-subtle">No auction blocks created yet.</Text>
          <a href="/app/auction-blocks/create"><Button className="mt-4">Create New Auction</Button></a>
        </Container>
      )}

      {!loading && blocks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

          {/* ── NEEDS PROCESSING (ended) ───────────────────────── */}
          {ended.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                {urgentCount > 0
                  ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block", boxShadow: "0 0 0 3px rgba(239,68,68,0.2)" }} />
                  : <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                }
                <span style={{ fontSize: 11, fontWeight: 700, color: urgentCount > 0 ? "#b91c1c" : "#15803d", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  {urgentCount > 0
                    ? `Needs Processing — ${urgentCount} auction${urgentCount > 1 ? "s" : ""} with open tasks`
                    : `All Processed — ${ended.length} ended`
                  }
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ended.map(block => (
                  <EndedBlockCard
                    key={block.id}
                    block={block}
                    summary={summaries[block.id] ?? null}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── LIVE NOW (active) ──────────────────────────────── */}
          {live.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 1.5s infinite" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  Live Now — {live.length} running
                </span>
              </div>
              <div style={{ border: "2px solid rgba(34,197,94,0.3)", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <BlocksTable rows={live} isLive onDelete={handleDelete} />
                </div>
              </div>
            </div>
          )}

          {/* ── UPCOMING (scheduled / preview) ────────────────── */}
          {upcoming.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", display: "inline-block" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  Upcoming — {upcoming.length} scheduled
                </span>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <BlocksTable rows={upcoming} onDelete={handleDelete} />
                </div>
              </div>
            </div>
          )}

          {/* ── DRAFTS ────────────────────────────────────────── */}
          {drafts.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d1d5db", display: "inline-block" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  Drafts — {drafts.length}
                </span>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", opacity: 0.8 }}>
                <div style={{ overflowX: "auto" }}>
                  <BlocksTable rows={drafts} onDelete={handleDelete} />
                </div>
              </div>
            </div>
          )}

          {/* ── ARCHIVED ──────────────────────────────────────── */}
          {archived.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#c4b5fd", display: "inline-block" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  Archived — {archived.length}
                </span>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", opacity: 0.5 }}>
                <div style={{ overflowX: "auto" }}>
                  <BlocksTable rows={archived} onDelete={handleDelete} />
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Auction Blocks",
  icon: ChatBubbleLeftRight,
  rank: 1,
})

export default AuctionBlocksPage
