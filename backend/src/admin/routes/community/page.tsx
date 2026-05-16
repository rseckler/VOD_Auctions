import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { Component, useCallback, useEffect, useState } from "react"
import { C } from "../../components/admin-tokens"
import { PageHeader, PageShell, Tabs, StatsGrid } from "../../components/admin-layout"
import { Btn, ColorBadge, Toast, EmptyState, selectStyle } from "../../components/admin-ui"

// ─── Error boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: Error) {
    return { error: e.message || String(e) }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: C.error, fontFamily: "monospace", fontSize: 13 }}>
          <b>Render Error:</b> {this.state.error}
        </div>
      )
    }
    return this.props.children
  }
}

const TIERS = ["platinum", "gold", "silver", "bronze", "standard", "curator"]
const TIER_COLOR: Record<string, string> = {
  platinum: C.purple, gold: C.gold, silver: C.blue,
  bronze: C.muted, standard: C.muted, curator: C.gold,
}
const STATUS_COLOR: Record<string, string> = {
  published: C.success, draft: C.muted, hidden: C.warning, removed: C.error,
}

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`/admin/community${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

// ─── Dashboard tab ────────────────────────────────────────────────────────────
function DashboardTab() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api("/dashboard")
      .then(setData)
      .catch((e) =>
        setError(
          e.message === "404"
            ? "Community is disabled — enable the COMMUNITY flag in Config."
            : "Could not load the dashboard."
        )
      )
  }, [])

  if (error) return <EmptyState icon="🚫" title="Unavailable" description={error} />
  if (!data) return <div style={{ padding: 24, color: C.muted }}>Loading…</div>

  return (
    <div>
      <StatsGrid
        stats={[
          { label: "Posts", value: data.counts.posts },
          { label: "Comments", value: data.counts.comments },
          { label: "Members", value: data.counts.members },
          { label: "Reviews", value: data.counts.reviews },
          {
            label: "Hidden / Removed",
            value: data.counts.hidden_posts,
            color: data.counts.hidden_posts > 0 ? C.warning : C.text,
          },
        ]}
      />
      {data.trust_distribution && (
        <Panel title="Trust levels">
          <div style={{ display: "flex", gap: 20, paddingTop: 2 }}>
            {[
              { k: "0", label: "TL0 Newcomer" },
              { k: "1", label: "TL1 Member" },
              { k: "2", label: "TL2 Trusted" },
              { k: "3", label: "TL3 Veteran" },
            ].map((t) => (
              <div key={t.k}>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>
                  {data.trust_distribution[t.k] ?? 0}
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>{t.label}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <div style={{ height: 16 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel title="Recent posts">
          {data.recent_posts.length === 0 ? (
            <Muted>No posts yet.</Muted>
          ) : (
            data.recent_posts.map((p: any) => (
              <Row key={p.id}>
                <span style={{ flex: 1, color: C.text }}>
                  {p.title || "(untitled)"}{" "}
                  <span style={{ color: C.muted, fontSize: 11 }}>· @{p.author_handle}</span>
                </span>
                <ColorBadge label={p.status} color={STATUS_COLOR[p.status] || C.muted} />
              </Row>
            ))
          )}
        </Panel>
        <Panel title="Recent members">
          {data.recent_members.length === 0 ? (
            <Muted>No members yet.</Muted>
          ) : (
            data.recent_members.map((m: any) => (
              <Row key={m.id}>
                <span style={{ flex: 1, color: C.text }}>
                  {m.display_name}{" "}
                  <span style={{ color: C.muted, fontSize: 11 }}>@{m.handle}</span>
                </span>
                <ColorBadge label={m.tier} color={TIER_COLOR[m.tier] || C.muted} />
              </Row>
            ))
          )}
        </Panel>
      </div>
    </div>
  )
}

// ─── Posts tab ────────────────────────────────────────────────────────────────
function PostsTab({ onToast }: { onToast: (m: string) => void }) {
  const [posts, setPosts] = useState<any[]>([])
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    setLoading(true)
    setSel(new Set())
    api(`/posts?limit=100${status ? `&status=${status}` : ""}`)
      .then((d) => setPosts(d.posts || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }, [status])

  useEffect(() => { load() }, [load])

  async function patch(id: string, body: Record<string, unknown>, msg: string) {
    await api(`/posts/${id}`, { method: "PATCH", body: JSON.stringify(body) })
    onToast(msg)
    load()
  }

  async function bulk(body: Record<string, unknown>, msg: string) {
    const ids = [...sel]
    await Promise.all(
      ids.map((id) =>
        api(`/posts/${id}`, { method: "PATCH", body: JSON.stringify(body) })
      )
    )
    onToast(`${msg} (${ids.length})`)
    load()
  }

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <select style={selectStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="hidden">Hidden</option>
          <option value="removed">Removed</option>
        </select>
        {sel.size > 0 && (
          <>
            <span style={{ fontSize: 12, color: C.muted }}>{sel.size} selected</span>
            <Btn label="Hide selected" variant="ghost"
              onClick={() => bulk({ status: "hidden" }, "Posts hidden")} />
            <Btn label="Remove selected" variant="danger"
              onClick={() => bulk({ status: "removed" }, "Posts removed")} />
          </>
        )}
      </div>
      {loading ? (
        <Muted>Loading…</Muted>
      ) : posts.length === 0 ? (
        <EmptyState icon="📝" title="No posts" description="No posts match this filter." />
      ) : (
        posts.map((p) => (
          <Row key={p.id}>
            <input
              type="checkbox"
              checked={sel.has(p.id)}
              onChange={() => toggle(p.id)}
            />
            <span style={{ flex: 1, color: C.text }}>
              {p.title || "(untitled)"}{" "}
              <span style={{ color: C.muted, fontSize: 11 }}>
                · @{p.author_handle} · {p.kind}
              </span>
            </span>
            <ColorBadge label={p.status} color={STATUS_COLOR[p.status] || C.muted} />
            {p.is_pinned && <ColorBadge label="pinned" color={C.gold} />}
            <Btn
              label={p.is_pinned ? "Unpin" : "Pin"}
              variant="ghost"
              onClick={() => patch(p.id, { is_pinned: !p.is_pinned }, "Updated")}
            />
            {p.status !== "hidden" && (
              <Btn label="Hide" variant="ghost"
                onClick={() => patch(p.id, { status: "hidden" }, "Post hidden")} />
            )}
            {p.status !== "published" && (
              <Btn label="Publish" variant="ghost"
                onClick={() => patch(p.id, { status: "published" }, "Post published")} />
            )}
            <Btn label="Remove" variant="danger"
              onClick={() => patch(p.id, { status: "removed" }, "Post removed")} />
          </Row>
        ))
      )}
    </div>
  )
}

// ─── Members tab ──────────────────────────────────────────────────────────────
function MembersTab({ onToast }: { onToast: (m: string) => void }) {
  const [members, setMembers] = useState<any[]>([])
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api(`/profiles?limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}`)
      .then((d) => setMembers(d.profiles || []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false))
  }, [q])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  async function patch(id: string, body: Record<string, unknown>, msg: string) {
    await api(`/profiles/${id}`, { method: "PATCH", body: JSON.stringify(body) })
    onToast(msg)
    load()
  }

  return (
    <div>
      <input
        placeholder="Search handle or name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ ...selectStyle, width: 260, marginBottom: 14 }}
      />
      {loading ? (
        <Muted>Loading…</Muted>
      ) : members.length === 0 ? (
        <EmptyState icon="👤" title="No members" description="No members match this search." />
      ) : (
        members.map((m) => (
          <Row key={m.id}>
            <span style={{ flex: 1, color: C.text }}>
              {m.display_name}{" "}
              <span style={{ color: C.muted, fontSize: 11 }}>@{m.handle}</span>
            </span>
            <ColorBadge label={`TL${m.trust_level ?? 0}`} color={C.blue} />
            {m.is_banned && <ColorBadge label="banned" color={C.error} />}
            {m.is_curator && <ColorBadge label="curator" color={C.gold} />}
            <select
              style={{ ...selectStyle, width: 110 }}
              value={m.tier}
              onChange={(e) => patch(m.id, { tier: e.target.value }, "Tier updated")}
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <Btn
              label={m.is_curator ? "Unset curator" : "Make curator"}
              variant="ghost"
              onClick={() => patch(m.id, { is_curator: !m.is_curator }, "Updated")}
            />
            <Btn
              label={m.is_banned ? "Unban" : "Ban"}
              variant={m.is_banned ? "ghost" : "danger"}
              onClick={() => patch(m.id, { is_banned: !m.is_banned }, "Updated")}
            />
          </Row>
        ))
      )}
    </div>
  )
}

// ─── Reports tab ──────────────────────────────────────────────────────────────
function ReportsTab({ onToast }: { onToast: (m: string) => void }) {
  const [reports, setReports] = useState<any[]>([])
  const [status, setStatus] = useState("open")
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api(`/reports?status=${status}`)
      .then((d) => setReports(d.reports || []))
      .catch(() => setReports([]))
      .finally(() => setLoading(false))
  }, [status])

  useEffect(() => { load() }, [load])

  async function resolve(id: string, s: string) {
    await api(`/reports/${id}`, { method: "PATCH", body: JSON.stringify({ status: s }) })
    onToast("Report updated")
    load()
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <select style={selectStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Open</option>
          <option value="reviewed">Reviewed</option>
          <option value="actioned">Actioned</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>
      {loading ? (
        <Muted>Loading…</Muted>
      ) : reports.length === 0 ? (
        <EmptyState icon="✓" title="No reports" description="The moderation queue is clear." />
      ) : (
        reports.map((r) => (
          <Row key={r.id}>
            <span style={{ flex: 1, color: C.text }}>
              <ColorBadge label={r.reason} color={C.warning} />{" "}
              <span style={{ color: C.muted, fontSize: 11 }}>
                {r.target_kind} · reported by @{r.reporter_handle}
              </span>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                {r.target_excerpt}
              </div>
            </span>
            {r.target_slug && (
              <a
                href={`https://vod-auctions.com/community/post/${r.target_slug}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: C.gold, textDecoration: "none" }}
              >
                View ↗
              </a>
            )}
            {r.status === "open" ? (
              <>
                <Btn label="Reviewed" variant="ghost" onClick={() => resolve(r.id, "reviewed")} />
                <Btn label="Actioned" variant="ghost" onClick={() => resolve(r.id, "actioned")} />
                <Btn label="Dismiss" variant="ghost" onClick={() => resolve(r.id, "dismissed")} />
              </>
            ) : (
              <ColorBadge label={r.status} color={C.muted} />
            )}
          </Row>
        ))
      )}
    </div>
  )
}

// ─── Small layout helpers ─────────────────────────────────────────────────────
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}
function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13,
    }}>
      {children}
    </div>
  )
}
function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ color: C.muted, fontSize: 13, padding: "8px 0" }}>{children}</div>
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function CommunityPage() {
  const [tab, setTab] = useState("Dashboard")
  const [toast, setToast] = useState<string | null>(null)

  return (
    <PageShell>
      <PageHeader
        title="Community"
        subtitle="Posts, members and moderation for the VOD Community."
      />
      <Tabs
        tabs={["Dashboard", "Posts", "Members", "Reports"]}
        active={tab}
        onChange={setTab}
      />
      {tab === "Dashboard" && <DashboardTab />}
      {tab === "Posts" && <PostsTab onToast={setToast} />}
      {tab === "Members" && <MembersTab onToast={setToast} />}
      {tab === "Reports" && <ReportsTab onToast={setToast} />}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </PageShell>
  )
}

export default function CommunityPageWithBoundary() {
  return (
    <ErrorBoundary>
      <CommunityPage />
    </ErrorBoundary>
  )
}

export const config = defineRouteConfig({
  label: "Community",
  icon: ChatBubbleLeftRight,
  rank: 9,
})
