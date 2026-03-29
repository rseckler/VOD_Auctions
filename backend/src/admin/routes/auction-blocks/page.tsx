import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { Container, Heading, Table, Badge, Button, Text } from "@medusajs/ui"
import { useEffect, useState, useRef } from "react"
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

const DELETABLE_STATUSES = ["draft", "ended", "archived"]

function BlocksTable({
  rows,
  isLive = false,
  onDelete,
}: {
  rows: AuctionBlock[]
  isLive?: boolean
  onDelete: (block: AuctionBlock) => void
}) {
  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Title</Table.HeaderCell>
          <Table.HeaderCell>Type</Table.HeaderCell>
          <Table.HeaderCell>Status</Table.HeaderCell>
          <Table.HeaderCell>Start</Table.HeaderCell>
          <Table.HeaderCell>End / Remaining</Table.HeaderCell>
          <Table.HeaderCell>Items</Table.HeaderCell>
          <Table.HeaderCell></Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((block) => (
          <Table.Row
            key={block.id}
            className={`cursor-pointer hover:bg-ui-bg-subtle-hover ${isLive ? "bg-green-50 dark:bg-green-950/20" : ""}`}
            onClick={() => { window.location.href = `/app/auction-blocks/${block.id}` }}
          >
            <Table.Cell>
              <div>
                <Text className="font-medium">{block.title}</Text>
                {block.subtitle && (
                  <Text className="text-ui-fg-subtle text-sm">{block.subtitle}</Text>
                )}
              </div>
            </Table.Cell>
            <Table.Cell>
              <Badge>{block.block_type}</Badge>
            </Table.Cell>
            <Table.Cell>
              <div className="flex items-center gap-2">
                <Badge color={STATUS_COLORS[block.status] || "grey"}>
                  {block.status}
                </Badge>
                {block.status === "active" && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-green-400 text-xs font-medium">LIVE</span>
                  </span>
                )}
              </div>
            </Table.Cell>
            <Table.Cell>
              {new Date(block.start_time).toLocaleString("en-GB", {
                day: "numeric", month: "short",
                hour: "2-digit", minute: "2-digit",
              })}
            </Table.Cell>
            <Table.Cell>
              {block.status === "active" ? (
                <ActiveCountdown endTime={block.end_time} />
              ) : (
                new Date(block.end_time).toLocaleString("en-GB", {
                  day: "numeric", month: "short",
                  hour: "2-digit", minute: "2-digit",
                })
              )}
            </Table.Cell>
            <Table.Cell>{block.items?.length || 0}</Table.Cell>
            <Table.Cell onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                {block.status === "ended" ? (
                  <a href={`/app/auction-blocks/${block.id}/post-auction`}>
                    <Button variant="primary" size="small">
                      Post-Auction →
                    </Button>
                  </a>
                ) : (
                  <a href={`/app/auction-blocks/${block.id}`}>
                    <Button variant="secondary" size="small">
                      {block.status === "active" ? "Manage" : "Edit"}
                    </Button>
                  </a>
                )}
                {DELETABLE_STATUSES.includes(block.status) && (
                  <Button
                    variant="danger"
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onDelete(block) }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  )
}

const AuctionBlocksPage = () => {
  useAdminNav()
  const [blocks, setBlocks] = useState<AuctionBlock[]>([])
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchBlocks = async () => {
    try {
      const res = await fetch("/admin/auction-blocks", { credentials: "include" })
      const data = await res.json()
      setBlocks(data.auction_blocks || [])
    } catch (err) {
      console.error("Failed to fetch blocks:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBlocks()
  }, [])

  // Auto-refresh every 30s if any active blocks
  useEffect(() => {
    const hasActive = blocks.some((b) => b.status === "active")
    if (hasActive && !intervalRef.current) {
      intervalRef.current = setInterval(fetchBlocks, 30000)
    } else if (!hasActive && intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [blocks])

  const handleDelete = async (block: AuctionBlock) => {
    const confirmed = window.confirm(
      `Delete auction "${block.title}"? This cannot be undone.`
    )
    if (!confirmed) return

    try {
      const res = await fetch(`/admin/auction-blocks/${block.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert("Cannot delete this auction: " + (data.message || res.statusText))
        return
      }
      setBlocks((prev) => prev.filter((b) => b.id !== block.id))
    } catch (err) {
      alert("Cannot delete this auction: Network error")
    }
  }

  const live = blocks.filter((b) => b.status === "active")
  const upcoming = blocks.filter((b) => ["scheduled", "preview"].includes(b.status))
  const other = blocks.filter((b) => ["ended", "draft", "archived"].includes(b.status))

  return (
    <Container>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level="h1">Auction Blocks</Heading>
          <Text className="text-ui-fg-subtle mt-1">
            Manage themed auction blocks
          </Text>
        </div>
        <a href="/app/auction-blocks/create">
          <Button>Create New Auction</Button>
        </a>
      </div>

      {loading && <Text>Loading...</Text>}

      {!loading && blocks.length === 0 && (
        <Container className="text-center py-12">
          <Text className="text-ui-fg-subtle">No auction blocks created yet.</Text>
          <a href="/app/auction-blocks/create">
            <Button className="mt-4">Create New Auction</Button>
          </a>
        </Container>
      )}

      {!loading && blocks.length > 0 && (
        <div className="space-y-6">
          {live.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <Text className="text-sm font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
                  Live Now — {live.length} running
                </Text>
              </div>
              <div className="rounded-lg border-2 border-green-500/30 overflow-hidden">
                <BlocksTable rows={live} isLive={true} onDelete={handleDelete} />
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                <Text className="text-sm font-semibold text-ui-fg-subtle uppercase tracking-wide">
                  Upcoming — {upcoming.length} scheduled
                </Text>
              </div>
              <div className="rounded-lg border border-ui-border-base overflow-hidden">
                <BlocksTable rows={upcoming} onDelete={handleDelete} />
              </div>
            </div>
          )}

          {other.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
                <Text className="text-sm font-semibold text-ui-fg-muted uppercase tracking-wide">
                  Past & Drafts — {other.length}
                </Text>
              </div>
              <div className="rounded-lg border border-ui-border-base overflow-hidden opacity-70">
                <BlocksTable rows={other} onDelete={handleDelete} />
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
