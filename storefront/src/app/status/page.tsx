import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "System Status",
  description: "Current operational status of VOD Auctions services.",
}

// ISR — revalidate 60s, matches backend cache
export const revalidate = 60

type PublicStatus = "operational" | "degraded_performance" | "outage" | "unknown"

type StatusResponse = {
  overall: PublicStatus
  categories: Array<{ name: string; status: PublicStatus }>
  last_updated: string | null
}

async function fetchStatus(): Promise<StatusResponse | null> {
  const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "https://api.vod-auctions.com"
  const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  if (!publishableKey) return null
  try {
    const r = await fetch(`${backendUrl}/store/status`, {
      headers: { "x-publishable-api-key": publishableKey },
      next: { revalidate: 60 },
    })
    if (r.status === 404) return null
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as StatusResponse
  } catch {
    return null
  }
}

const STATUS_META: Record<PublicStatus, { label: string; color: string; bg: string; icon: string }> = {
  operational:          { label: "Operational",          color: "#16a34a", bg: "#16a34a15", icon: "●" },
  degraded_performance: { label: "Degraded Performance", color: "#d97706", bg: "#d9770615", icon: "◐" },
  outage:               { label: "Outage",               color: "#dc2626", bg: "#dc262620", icon: "✕" },
  unknown:              { label: "Unknown",              color: "#78716c", bg: "#78716c15", icon: "?" },
}

function OverallBanner({ status, lastUpdated }: { status: PublicStatus; lastUpdated: string | null }) {
  const m = STATUS_META[status]
  const message =
    status === "operational" ? "All systems operational"
    : status === "degraded_performance" ? "Some systems are experiencing degraded performance"
    : status === "outage" ? "A service disruption is in progress"
    : "Status is currently unknown"
  return (
    <div style={{
      background: m.bg, border: `1px solid ${m.color}55`, borderRadius: 12,
      padding: "24px 28px", marginBottom: 32, display: "flex", alignItems: "center", gap: 18,
    }}>
      <div style={{ fontSize: 40, color: m.color, lineHeight: 1, fontWeight: 700 }}>{m.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: m.color, marginBottom: 4 }}>{message}</div>
        {lastUpdated && (
          <div style={{ fontSize: 13, color: "rgba(0,0,0,0.55)" }}>
            Last updated {new Date(lastUpdated).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
          </div>
        )}
      </div>
    </div>
  )
}

function CategoryRow({ name, status }: { name: string; status: PublicStatus }) {
  const m = STATUS_META[status]
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 20px", background: "#fff", border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: 8, marginBottom: 8,
    }}>
      <div style={{ fontSize: 15, fontWeight: 500 }}>{name}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: m.color, fontSize: 16, lineHeight: 1 }}>{m.icon}</span>
        <span style={{ color: m.color, fontWeight: 600, fontSize: 13 }}>{m.label}</span>
      </div>
    </div>
  )
}

export default async function StatusPage() {
  const data = await fetchStatus()
  if (!data) {
    notFound()
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <nav className="text-sm text-muted-foreground mb-4">
        <Link href="/" className="hover:text-primary">Home</Link>
        <span className="mx-2">/</span>
        <span>System Status</span>
      </nav>
      <h1 className="font-serif text-4xl mb-8">System Status</h1>

      <OverallBanner status={data.overall} lastUpdated={data.last_updated} />

      <div>
        {data.categories.map((c) => (
          <CategoryRow key={c.name} name={c.name} status={c.status} />
        ))}
      </div>

      <div style={{ marginTop: 32, padding: "16px 20px", background: "rgba(0,0,0,0.03)", borderRadius: 8, fontSize: 13, color: "rgba(0,0,0,0.65)" }}>
        This page shows aggregated status of the main user-facing services. Updates every 60 seconds.
        Individual incidents or technical details are not shown here — please contact{" "}
        <a href="mailto:support@vod-auctions.com" style={{ color: "#b8860b" }}>support@vod-auctions.com</a>{" "}
        if you experience an issue.
      </div>
    </main>
  )
}
