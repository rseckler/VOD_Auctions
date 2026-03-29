import { EnvelopeSolid } from "@medusajs/icons"
import { useAdminNav } from "../../components/admin-nav"
import {
  Container,
  Heading,
  Table,
  Badge,
  Text,
} from "@medusajs/ui"
import { useEffect, useState, useCallback } from "react"

type Campaign = {
  id: number
  name: string
  subject: string
  status: string
  sentDate: string | null
  stats: {
    sent: number
    opens: number
    clicks: number
    openRate: string
    clickRate: string
  } | null
}

type ListInfo = {
  id: number
  name: string
  subscribers: number
}

type NewsletterData = {
  configured: boolean
  campaigns: Campaign[]
  totalCampaigns: number
  lists: ListInfo[]
}

type StatsData = {
  configured: boolean
  subscribers: {
    vod_auctions: number
    tape_mag: number
    total: number
  }
  medusa_customers: number
  campaigns: {
    total: number
    total_sent: number
    total_opens: number
    total_clicks: number
    avg_open_rate: string
    avg_click_rate: string
  }
}

const NewsletterPage = () => {
  useAdminNav()
  const [data, setData] = useState<NewsletterData | null>(null)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"overview" | "campaigns">("overview")

  const fetchData = useCallback(async () => {
    try {
      const [overviewRes, statsRes] = await Promise.all([
        fetch("/admin/newsletter", { credentials: "include" }),
        fetch("/admin/newsletter/stats", { credentials: "include" }),
      ])
      if (overviewRes.ok) setData(await overviewRes.json())
      if (statsRes.ok) setStats(await statsRes.json())
    } catch (err) {
      console.error("Failed to fetch newsletter data:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <Container>
        <Heading level="h1" className="mb-4">Newsletter</Heading>
        <Text className="text-ui-fg-muted">Loading...</Text>
      </Container>
    )
  }

  if (!data?.configured) {
    return (
      <Container>
        <Heading level="h1" className="mb-4">Newsletter</Heading>
        <Container className="bg-ui-bg-subtle p-6 rounded-lg">
          <Text className="text-ui-fg-muted">
            Brevo is not configured. Set BREVO_API_KEY in backend/.env to enable newsletter features.
          </Text>
        </Container>
      </Container>
    )
  }

  return (
    <Container>
      <div className="flex items-center justify-between mb-6">
        <Heading level="h1">Newsletter</Heading>
        <a
          href="https://app.brevo.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ui-fg-interactive text-sm hover:underline"
        >
          Open Brevo Dashboard →
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["overview", "campaigns"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-ui-bg-interactive text-ui-fg-on-color"
                : "bg-ui-bg-subtle text-ui-fg-muted hover:text-ui-fg-base"
            }`}
          >
            {tab === "overview" ? "Overview" : "Campaigns"}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Total Subscribers"
              value={stats?.subscribers?.total ?? 0}
            />
            <StatCard
              label="VOD Auctions List"
              value={stats?.subscribers?.vod_auctions ?? 0}
            />
            <StatCard
              label="TAPE-MAG List"
              value={stats?.subscribers?.tape_mag ?? 0}
            />
            <StatCard
              label="Medusa Customers"
              value={stats?.medusa_customers ?? 0}
            />
          </div>

          {/* Campaign Performance */}
          <Container className="p-6">
            <Heading level="h2" className="mb-4">
              Campaign Performance
            </Heading>
            {stats?.campaigns?.total ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Campaigns Sent"
                  value={stats.campaigns.total}
                />
                <StatCard
                  label="Total Emails Sent"
                  value={stats.campaigns.total_sent}
                />
                <StatCard
                  label="Avg Open Rate"
                  value={`${stats.campaigns.avg_open_rate}%`}
                />
                <StatCard
                  label="Avg Click Rate"
                  value={`${stats.campaigns.avg_click_rate}%`}
                />
              </div>
            ) : (
              <Text className="text-ui-fg-muted">
                No campaigns sent yet. Create your first campaign in Brevo or use the block announcement feature.
              </Text>
            )}
          </Container>

          {/* Lists */}
          <Container className="p-6">
            <Heading level="h2" className="mb-4">
              Contact Lists
            </Heading>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>List</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Subscribers
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    List ID
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data.lists.map((list) => (
                  <Table.Row key={list.id}>
                    <Table.Cell>
                      <Text className="font-medium">{list.name}</Text>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Text>{list.subscribers.toLocaleString()}</Text>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Badge color="grey" size="2xsmall">
                        #{list.id}
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </Container>
        </div>
      )}

      {activeTab === "campaigns" && (
        <Container className="p-6">
          <Heading level="h2" className="mb-4">
            Recent Campaigns
          </Heading>
          {data.campaigns.length === 0 ? (
            <Text className="text-ui-fg-muted">
              No campaigns sent yet.
            </Text>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Subject</Table.HeaderCell>
                  <Table.HeaderCell>Sent</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Emails
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Opens
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Open %
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Clicks
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Click %
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data.campaigns.map((c) => (
                  <Table.Row key={c.id}>
                    <Table.Cell>
                      <Text className="font-medium">{c.subject}</Text>
                      <Text className="text-ui-fg-muted text-xs">
                        {c.name}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text className="text-sm">
                        {c.sentDate
                          ? new Date(c.sentDate).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Text>{c.stats?.sent?.toLocaleString() ?? "—"}</Text>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Text>{c.stats?.opens?.toLocaleString() ?? "—"}</Text>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Badge
                        color={
                          Number(c.stats?.openRate || 0) > 20
                            ? "green"
                            : Number(c.stats?.openRate || 0) > 10
                              ? "orange"
                              : "grey"
                        }
                        size="2xsmall"
                      >
                        {c.stats?.openRate ?? "0"}%
                      </Badge>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Text>{c.stats?.clicks?.toLocaleString() ?? "—"}</Text>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Badge
                        color={
                          Number(c.stats?.clickRate || 0) > 5
                            ? "green"
                            : Number(c.stats?.clickRate || 0) > 2
                              ? "orange"
                              : "grey"
                        }
                        size="2xsmall"
                      >
                        {c.stats?.clickRate ?? "0"}%
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>
      )}
    </Container>
  )
}

function StatCard({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div className="bg-ui-bg-subtle rounded-lg p-4">
      <Text className="text-ui-fg-muted text-xs mb-1">{label}</Text>
      <Text className="text-2xl font-semibold">
        {typeof value === "number" ? value.toLocaleString() : value}
      </Text>
    </div>
  )
}

export default NewsletterPage
