import { defineRouteConfig } from "@medusajs/admin-sdk"
import { FolderOpen } from "@medusajs/icons"
import { useEffect, useState } from "react"
import { useAdminNav } from "../../components/admin-nav"

const C = {
  bg: "transparent",
  card: "#f8f7f6",
  text: "#1a1714",
  muted: "#78716c",
  gold: "#b8860b",
  border: "#e7e5e4",
  hover: "#f5f4f3",
  success: "#16a34a",
  error: "#dc2626",
  blue: "#2563eb",
  purple: "#7c3aed",
  warning: "#d97706",
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CatalogStats = {
  total_releases: number
  enriched_entities: number
  enriched_total: number
  musicians: number
  bands: number
}

// ─── Card component ───────────────────────────────────────────────────────────

function HubCard({
  icon,
  title,
  description,
  meta,
  badge,
  badgeColor,
  href,
}: {
  icon: string
  title: string
  description: string
  meta: string
  badge?: string
  badgeColor?: "blue" | "amber" | "green" | "red"
  href: string
}) {
  const badgeColors = {
    blue:  { bg: C.blue + "15", color: C.blue },
    amber: { bg: C.warning + "15", color: C.warning },
    green: { bg: C.success + "15", color: C.success },
    red:   { bg: C.error + "15", color: C.error },
  }
  const bc = badge && badgeColor ? badgeColors[badgeColor] : null

  return (
    <div
      onClick={() => { window.location.href = href }}
      style={{
        background: `var(--bg-component, ${C.card})`,
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 10,
        padding: 20,
        cursor: "pointer",
        position: "relative",
        transition: "box-shadow 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"
        ;(e.currentTarget as HTMLDivElement).style.borderColor = C.text
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = "none"
        ;(e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,0,0,0.08)"
      }}
    >
      {badge && bc && (
        <span style={{
          position: "absolute", top: 14, right: 14,
          background: bc.bg, color: bc.color,
          borderRadius: 10, padding: "2px 8px",
          fontSize: 10, fontWeight: 600,
        }}>
          {badge}
        </span>
      )}
      <div style={{ fontSize: 24, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>{description}</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>{meta}</div>
      <button style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        background: "transparent", color: C.text,
        border: "none", borderRadius: 5,
        padding: "5px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer",
      }}>
        Open →
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function CatalogHub() {
  useAdminNav()
  const [stats, setStats] = useState<CatalogStats | null>(null)

  useEffect(() => {
    // Load quick stats from media endpoint
    fetch("/admin/media?limit=1")
      .then((r) => r.json())
      .then((d) => {
        setStats({
          total_releases: d.total ?? 41529,
          enriched_entities: 576,
          enriched_total: 3650,
          musicians: 897,
          bands: 189,
        })
      })
      .catch(() => {
        setStats({
          total_releases: 41529,
          enriched_entities: 576,
          enriched_total: 3650,
          musicians: 897,
          bands: 189,
        })
      })
  }, [])

  const total = stats?.total_releases?.toLocaleString("en") ?? "41,529"
  const enrichedPct = stats
    ? Math.round((stats.enriched_entities / stats.enriched_total) * 100)
    : 16

  return (
    <div style={{ padding: "32px 36px", maxWidth: 900, fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* Header */}
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Admin</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>
        🗃️ Catalog
      </div>
      <div style={{ fontSize: 14, color: C.muted, marginBottom: 28 }}>
        Browse and enrich the {total}-release catalog — releases, artists, labels, and press
      </div>

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
        {[
          { num: total, label: "Total Releases" },
          { num: "12,451", label: "Artists" },
          { num: `${stats?.enriched_entities ?? 576} / ${stats?.enriched_total ?? "3,650"}`, label: "Entities enriched", sub: `${enrichedPct}% · P2 paused` },
          { num: stats?.musicians ?? 897, label: "Musicians", sub: `${stats?.bands ?? 189} bands` },
        ].map((s, i) => (
          <div key={i} style={{
            background: `var(--bg-component, ${C.card})`, border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 8, padding: "10px 16px",
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: i === 2 ? C.purple : C.text }}>
              {String(s.num)}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>{s.label}</div>
            {s.sub && <div style={{ fontSize: 10, color: C.muted }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Section heading */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: C.muted,
        textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12,
      }}>
        Sections
      </div>

      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <HubCard
          icon="💿"
          title="Media Browser"
          description="Browse all 41,500+ releases. Search by artist, label, format, country, or year. Set pricing and check Discogs data."
          meta={`${total} releases · 97%+ cover images`}
          badge="41.5k items"
          badgeColor="blue"
          href="/app/media"
        />
        <HubCard
          icon="✍️"
          title="Entity Content"
          description="AI-generated descriptions for bands, labels, and press orgs. Manage the overhaul pipeline and review quality scores."
          meta={`${stats?.enriched_entities ?? 576} / ${stats?.enriched_total ?? 3650} enriched (${enrichedPct}%)`}
          badge="P2 Paused"
          badgeColor="amber"
          href="/app/entity-content"
        />
        <HubCard
          icon="🎵"
          title="Musicians"
          description="Musician database with roles, band affiliations and project history."
          meta={`${stats?.musicians ?? 897} musicians · ${stats?.bands ?? 189} bands · 3 roles`}
          badge={`${stats?.musicians ?? 897} entries`}
          badgeColor="green"
          href="/app/musicians"
        />
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Catalog",
  icon: FolderOpen,
  rank: 3,
})

export default CatalogHub
