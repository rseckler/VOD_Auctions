import { useEffect, useState } from "react"

type CRMData = {
  configured: boolean
  overview?: {
    total_contacts: number
    vod_auctions: number
    tape_mag: number
    newsletter_optins: number
    medusa_customers: number
  }
  segments?: Record<string, number>
  top_customers?: {
    email: string
    name: string
    platform: string
    segment: string
    total_spent: number
    total_purchases: number
    total_bids: number
    total_wins: number
  }[]
  recent_contacts?: {
    email: string
    name: string
    platform: string
    segment: string
    newsletter: boolean
  }[]
  recent_medusa_customers?: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    created_at: string
  }[]
  campaigns?: {
    id: number
    name: string
    subject: string
    sentDate: string
    stats: {
      sent: number
      opens: number
      clicks: number
      openRate: string
      clickRate: string
    } | null
  }[]
  total_campaigns?: number
}

const COLORS = {
  bg: "#1c1915",
  card: "#2a2520",
  text: "#f5f0eb",
  muted: "#a09080",
  gold: "#d4a54a",
  border: "#3a3530",
  hover: "#353025",
  success: "#22c55e",
  error: "#ef4444",
  blue: "#60a5fa",
  purple: "#c084fc",
  orange: "#fb923c",
}

const SEGMENT_COLORS: Record<string, string> = {
  registered: COLORS.blue,
  bidder: COLORS.orange,
  buyer: COLORS.success,
  vip: COLORS.gold,
  imported: COLORS.muted,
  unknown: COLORS.muted,
}

const formatDate = (d: string | null) => {
  if (!d) return "\u2014"
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const formatPrice = (p: number | null | undefined) => {
  if (p === null || p === undefined || p === 0) return "\u2014"
  return `\u20AC${p.toFixed(2)}`
}

const CustomersPage = () => {
  const [data, setData] = useState<CRMData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/admin/customers", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch((err) => {
        console.error("CRM data error:", err)
        setLoading(false)
      })
  }, [])

  const cardStyle: React.CSSProperties = {
    background: COLORS.card,
    borderRadius: "8px",
    padding: "20px",
    border: `1px solid ${COLORS.border}`,
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: `1px solid ${COLORS.border}`,
    whiteSpace: "nowrap",
  }

  const tdStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "13px",
    color: COLORS.text,
    borderBottom: `1px solid ${COLORS.border}`,
    verticalAlign: "top",
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "4px",
  }

  const bigValueStyle: React.CSSProperties = {
    fontSize: "28px",
    fontWeight: 700,
    color: COLORS.gold,
  }

  if (loading) {
    return (
      <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
        <div style={{ color: COLORS.muted }}>Loading CRM data...</div>
      </div>
    )
  }

  if (!data?.configured) {
    return (
      <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "16px" }}>CRM Dashboard</h1>
        <div style={cardStyle}>
          <p style={{ color: COLORS.muted }}>
            Brevo is not configured. Set <code style={{ color: COLORS.gold }}>BREVO_API_KEY</code> in your environment to enable CRM features.
          </p>
        </div>
      </div>
    )
  }

  const overview = data.overview!
  const segments = data.segments || {}
  const segmentEntries = Object.entries(segments).sort(([, a], [, b]) => b - a)
  const totalSegmented = segmentEntries.reduce((sum, [, count]) => sum + count, 0)

  return (
    <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "20px" }}>CRM Dashboard</h1>

      {/* Overview Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px", marginBottom: "24px" }}>
        <div style={cardStyle}>
          <div style={labelStyle}>Total Contacts</div>
          <div style={bigValueStyle}>{overview.total_contacts.toLocaleString("en-US")}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>VOD Auctions</div>
          <div style={bigValueStyle}>{overview.vod_auctions.toLocaleString("en-US")}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>TAPE-MAG</div>
          <div style={bigValueStyle}>{overview.tape_mag.toLocaleString("en-US")}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Newsletter Opt-ins</div>
          <div style={{ ...bigValueStyle, color: COLORS.success }}>{overview.newsletter_optins.toLocaleString("en-US")}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Medusa Customers</div>
          <div style={bigValueStyle}>{overview.medusa_customers.toLocaleString("en-US")}</div>
        </div>
      </div>

      {/* Segments + Recent Contacts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "20px", marginBottom: "24px" }}>
        {/* Segment Distribution */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
            Customer Segments
          </h2>
          {segmentEntries.length === 0 ? (
            <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No segment data yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {segmentEntries.map(([segment, count]) => {
                const pct = totalSegmented > 0 ? Math.round((count / totalSegmented) * 100) : 0
                const color = SEGMENT_COLORS[segment] || COLORS.muted
                return (
                  <div key={segment}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "13px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: color,
                            display: "inline-block",
                          }}
                        />
                        <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{segment}</span>
                      </span>
                      <span style={{ color: COLORS.muted }}>
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div style={{ height: "6px", borderRadius: "3px", background: COLORS.border, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: color,
                          borderRadius: "3px",
                          transition: "width 0.3s",
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent Contacts (from Brevo) */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
            Recent CRM Contacts
          </h2>
          {!data.recent_contacts || data.recent_contacts.length === 0 ? (
            <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No contacts yet.</div>
          ) : (
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Platform</th>
                    <th style={thStyle}>Segment</th>
                    <th style={thStyle}>Newsletter</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_contacts.map((c) => (
                    <tr
                      key={c.email}
                      onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{c.name}</td>
                      <td style={{ ...tdStyle, fontSize: "12px", fontFamily: "monospace" }}>{c.email}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 600,
                            background:
                              c.platform === "vod-auctions"
                                ? COLORS.gold + "20"
                                : c.platform === "tape-mag"
                                  ? COLORS.purple + "20"
                                  : COLORS.muted + "20",
                            color:
                              c.platform === "vod-auctions"
                                ? COLORS.gold
                                : c.platform === "tape-mag"
                                  ? COLORS.purple
                                  : COLORS.muted,
                          }}
                        >
                          {c.platform}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 600,
                            background: (SEGMENT_COLORS[c.segment] || COLORS.muted) + "20",
                            color: SEGMENT_COLORS[c.segment] || COLORS.muted,
                            textTransform: "capitalize",
                          }}
                        >
                          {c.segment}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: c.newsletter ? COLORS.success : COLORS.muted }}>
                          {c.newsletter ? "\u2713" : "\u2717"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Top Customers */}
      <div style={{ ...cardStyle, marginBottom: "24px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
          Top Customers by Spend
        </h2>
        {!data.top_customers || data.top_customers.length === 0 ? (
          <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>
            No purchase data yet.
          </div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: "40px" }}>#</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Platform</th>
                  <th style={thStyle}>Segment</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Spent</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Purchases</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Bids</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Wins</th>
                </tr>
              </thead>
              <tbody>
                {data.top_customers.map((c, idx) => (
                  <tr
                    key={c.email}
                    onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ ...tdStyle, color: COLORS.muted, fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{c.name}</td>
                    <td style={{ ...tdStyle, fontSize: "12px", fontFamily: "monospace" }}>{c.email}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 600,
                          background:
                            c.platform === "vod-auctions"
                              ? COLORS.gold + "20"
                              : c.platform === "tape-mag"
                                ? COLORS.purple + "20"
                                : COLORS.muted + "20",
                          color:
                            c.platform === "vod-auctions"
                              ? COLORS.gold
                              : c.platform === "tape-mag"
                                ? COLORS.purple
                                : COLORS.muted,
                        }}
                      >
                        {c.platform}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 600,
                          background: (SEGMENT_COLORS[c.segment] || COLORS.muted) + "20",
                          color: SEGMENT_COLORS[c.segment] || COLORS.muted,
                          textTransform: "capitalize",
                        }}
                      >
                        {c.segment}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: COLORS.gold, fontWeight: 600 }}>
                      {formatPrice(c.total_spent)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.total_purchases}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.total_bids}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.total_wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Campaign Performance */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
          Campaign Performance
          {data.total_campaigns ? (
            <span style={{ fontSize: "13px", fontWeight: 400, color: COLORS.muted, marginLeft: "8px" }}>
              ({data.total_campaigns} total)
            </span>
          ) : null}
        </h2>
        {!data.campaigns || data.campaigns.length === 0 ? (
          <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>
            No campaigns sent yet.
          </div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Campaign</th>
                  <th style={thStyle}>Date</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Sent</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Opens</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Open Rate</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Clicks</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Click Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c) => (
                  <tr
                    key={c.id}
                    onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ ...tdStyle, fontWeight: 500, maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.name}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDate(c.sentDate)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.stats?.sent?.toLocaleString("en-US") || "\u2014"}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.stats?.opens?.toLocaleString("en-US") || "\u2014"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: COLORS.gold }}>{c.stats?.openRate ? `${c.stats.openRate}%` : "\u2014"}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.stats?.clicks?.toLocaleString("en-US") || "\u2014"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: COLORS.gold }}>{c.stats?.clickRate ? `${c.stats.clickRate}%` : "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default CustomersPage
