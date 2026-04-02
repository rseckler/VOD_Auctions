import { defineRouteConfig } from "@medusajs/admin-sdk"
import { EnvelopeSolid } from "@medusajs/icons"
import { useAdminNav } from "../../components/admin-nav"
import { C } from "../../components/admin-tokens"
import { PageHeader, PageShell } from "../../components/admin-layout"

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
      <div style={{ fontSize: 15, fontWeight: 700, color: "inherit", marginBottom: 4 }}>{title}</div>
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

function MarketingHub() {
  useAdminNav()
  return (
    <PageShell maxWidth={900}>
      <PageHeader title="Marketing" subtitle="Campaigns, email templates, CRM contacts, content blocks, and gallery" />

      {/* Info bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
        {[
          { num: "3,580", label: "CRM Contacts", sub: "tape-mag list" },
          { num: "4", label: "Newsletter Templates", sub: "Brevo campaigns" },
          { num: "6", label: "Transactional Emails", sub: "Resend" },
          { num: "9", label: "Gallery Sections", sub: "active media" },
        ].map((s, i) => (
          <div key={i} style={{
            background: `var(--bg-component, ${C.card})`, border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 8, padding: "10px 16px",
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "inherit" }}>{s.num}</div>
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
          href="/app/crm"
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
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
        <HubCard
          icon="📋"
          title="Waitlist"
          description="Pre-launch applications and invite token management. Approve, invite, and track registrations."
          meta="Invite system"
          badge="Pre-Launch"
          badgeColor="orange"
          href="/app/waitlist"
        />
      </div>
    </PageShell>
  )
}

export const config = defineRouteConfig({
  label: "Marketing",
  icon: EnvelopeSolid,
  rank: 4,
})

export default MarketingHub
