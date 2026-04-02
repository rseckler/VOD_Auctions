// ─── VOD Auctions Admin Layout Components ──────────────────────────────────
// Shared layout primitives used by every admin page.
import { C, T, S } from "./admin-tokens"
import type { CSSProperties, ReactNode } from "react"

// ─── PageHeader ────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string
  subtitle?: string
  badge?: { label: string; color: string }
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, badge, actions }: PageHeaderProps) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
      <div>
        <h1 style={T.pageTitle}>{title}</h1>
        {subtitle && <p style={T.subtitle}>{subtitle}</p>}
      </div>
      {(badge || actions) && (
        <div style={{ display: "flex", alignItems: "center", gap: S.gap.md, flexShrink: 0 }}>
          {badge && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
              padding: "4px 10px", borderRadius: S.radius.sm,
              background: badge.color + "12", color: badge.color, border: `1px solid ${badge.color}30`,
            }}>
              {badge.label}
            </span>
          )}
          {actions}
        </div>
      )}
    </div>
  )
}

// ─── SectionHeader ─────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string
  count?: number
  style?: CSSProperties
}

export function SectionHeader({ title, count, style }: SectionHeaderProps) {
  return (
    <div style={{ ...T.sectionHead, ...style }}>
      {title}
      {count !== undefined && <span style={{ fontWeight: 400, marginLeft: 6 }}>({count})</span>}
    </div>
  )
}

// ─── PageShell ─────────────────────────────────────────────────────────────

interface PageShellProps {
  children: ReactNode
  maxWidth?: number
}

export function PageShell({ children, maxWidth }: PageShellProps) {
  return (
    <div style={{ padding: S.pagePadding, maxWidth: maxWidth || S.pageMaxWidth }}>
      {children}
    </div>
  )
}

// ─── Tabs ──────────────────────────────────────────────────────────────────

interface TabsProps {
  tabs: readonly string[]
  active: string
  onChange: (tab: string) => void
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            padding: "8px 14px", fontSize: 13,
            fontWeight: active === t ? 600 : 400,
            color: active === t ? C.gold : C.muted,
            borderBottom: active === t ? `2px solid ${C.gold}` : "2px solid transparent",
            background: "none", border: "none", cursor: "pointer",
            marginBottom: -1,
          }}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

// ─── StatsGrid ─────────────────────────────────────────────────────────────

interface StatCard {
  label: string
  value: string | number
  subtitle?: string
  color?: string
}

interface StatsGridProps {
  stats: StatCard[]
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
      gap: 1, background: C.border, borderRadius: S.radius.lg, overflow: "hidden", marginBottom: 20,
    }}>
      {stats.map((s, i) => (
        <div key={i} style={{ background: "#fff", padding: "14px 16px" }}>
          <div style={T.micro}>{s.label}</div>
          <div style={{ ...T.stat, color: s.color || C.text, marginTop: 2 }}>{s.value}</div>
          {s.subtitle && <div style={{ ...T.small, marginTop: 2 }}>{s.subtitle}</div>}
        </div>
      ))}
    </div>
  )
}

// ─── Divider ───────────────────────────────────────────────────────────────

export function Divider({ margin = 16 }: { margin?: number }) {
  return <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: `${margin}px 0` }} />
}
