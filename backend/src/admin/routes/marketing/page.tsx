import { defineRouteConfig } from "@medusajs/admin-sdk"
import { EnvelopeSolid } from "@medusajs/icons"

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
    blue:  { bg: "#dbeafe", color: "#1d4ed8" },
    amber: { bg: "#fef3c7", color: "#b45309" },
    green: { bg: "#dcfce7", color: "#15803d" },
    red:   { bg: "#fee2e2", color: "#b91c1c" },
  }
  const bc = badge && badgeColor ? badgeColors[badgeColor] : null

  return (
    <div
      onClick={() => { window.location.href = href }}
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 20,
        cursor: "pointer",
        position: "relative",
        transition: "box-shadow 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"
        ;(e.currentTarget as HTMLDivElement).style.borderColor = "#d1d5db"
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = "none"
        ;(e.currentTarget as HTMLDivElement).style.borderColor = "#e5e7eb"
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
      <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5, marginBottom: 12 }}>{description}</div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 14 }}>{meta}</div>
      <button style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        background: "#f3f4f6", color: "#374151",
        border: "none", borderRadius: 5,
        padding: "5px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer",
      }}>
        Open →
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function MarketingHub() {
  return (
    <div style={{ padding: "32px 36px", maxWidth: 900, fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* Header */}
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 20 }}>Admin</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 4 }}>
        📢 Marketing
      </div>
      <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 28 }}>
        Campaigns, email templates, CRM contacts, content blocks, and gallery management
      </div>

      {/* Info bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
        {[
          { num: "3,580", label: "CRM Contacts", sub: "tape-mag list" },
          { num: "4", label: "Newsletter Templates", sub: "Brevo campaigns" },
          { num: "6", label: "Transactional Emails", sub: "Resend" },
          { num: "9", label: "Gallery Sections", sub: "active media" },
        ].map((s, i) => (
          <div key={i} style={{
            background: "#fff", border: "1px solid #e5e7eb",
            borderRadius: 8, padding: "10px 16px",
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>{s.num}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>{s.label}</div>
            {s.sub && <div style={{ fontSize: 10, color: "#9ca3af" }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Section heading */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#9ca3af",
        textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12,
      }}>
        Sections
      </div>

      {/* Cards — 2 rows */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
        <HubCard
          icon="📰"
          title="Newsletter"
          description="Plan and send block-based email campaigns via Brevo. T-7 / T-24h / T+0 / T-6h auction sequence."
          meta="List ID 4 · 3,580 tape-mag contacts"
          badge="Brevo"
          badgeColor="blue"
          href="/app/newsletter"
        />
        <HubCard
          icon="✉️"
          title="Email Templates"
          description="Preview, edit subject lines, and send test emails for all 6 transactional templates (welcome, bid-won, outbid, payment, shipping, feedback)."
          meta="6 templates · Resend"
          href="/app/emails"
        />
        <HubCard
          icon="👥"
          title="CRM Dashboard"
          description="Customer overview, Brevo sync status, list membership, and contact management."
          meta="3,580 contacts · tape-mag list"
          badge="Live CRM"
          badgeColor="green"
          href="/app/customers"
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        <HubCard
          icon="📝"
          title="Content Blocks"
          description="Manage homepage hero, catalog teaser, about page sections, and auction page content via the CMS editor."
          meta="3 pages · JSONB blocks"
          href="/app/content"
        />
        <HubCard
          icon="🖼️"
          title="Gallery"
          description="Manage storefront image gallery sections. Reorder, activate/deactivate, and upload media for 9 gallery sections."
          meta="9 sections · position ordering"
          href="/app/gallery"
        />
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Marketing",
  icon: EnvelopeSolid,
})

export default MarketingHub
