import { defineRouteConfig } from "@medusajs/admin-sdk"
import { DocumentText } from "@medusajs/icons"
import { useEffect, useState } from "react"
import { useAdminNav } from "../../components/admin-nav"
import { C } from "../../components/admin-tokens"
import { PageHeader, PageShell } from "../../components/admin-layout"

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeatureFlag {
  key: string
  enabled: boolean
  requires: string[]
}

interface WarehouseLocation {
  id: string
  is_active: boolean
}

// ─── HubCard ──────────────────────────────────────────────────────────────────

function HubCard({
  icon,
  title,
  description,
  statusLine,
  statusColor,
  href,
  disabled,
  disabledReason,
  actionLabel,
  children,
}: {
  icon: string
  title: string
  description: string
  statusLine?: string
  statusColor?: string
  href?: string
  disabled?: boolean
  disabledReason?: string
  actionLabel?: string
  children?: React.ReactNode
}) {
  const handleClick = () => {
    if (!disabled && href) window.location.href = href
  }

  return (
    <div
      onClick={handleClick}
      style={{
        background: `var(--bg-component, ${C.card})`,
        border: `1px solid ${disabled ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.08)"}`,
        borderRadius: 10,
        padding: 20,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.07)"
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 22 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "inherit" }}>{title}</div>
          {statusLine && (
            <div style={{ fontSize: 11, color: statusColor || C.muted, fontWeight: 600, marginTop: 2 }}>
              {statusLine}
            </div>
          )}
        </div>
        {disabled && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: C.muted,
            background: "rgba(0,0,0,0.06)", borderRadius: 4,
            padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            FLAG OFF
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
        {description}
      </div>
      {children}
      {disabled && disabledReason && (
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
          {disabledReason}
        </div>
      )}
      {!disabled && (
        <button style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          background: "transparent", color: C.text,
          border: "none", borderRadius: 5,
          padding: "5px 12px", fontSize: 11, fontWeight: 500, cursor: "pointer",
        }}>
          {actionLabel || "Open →"}
        </button>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ERPHub() {
  useAdminNav()
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [locationCount, setLocationCount] = useState<number | null>(null)

  useEffect(() => {
    fetch("/admin/platform-flags")
      .then((r) => r.json())
      .then((d) => setFlags(d.flags ?? []))
      .catch(() => {})

    fetch("/admin/erp/locations")
      .then((r) => r.json())
      .then((d) => {
        const active = (d.locations ?? []).filter((l: WarehouseLocation) => l.is_active)
        setLocationCount(active.length)
      })
      .catch(() => {})
  }, [])

  const flagOn = (key: string) => flags.find((f) => f.key === key)?.enabled ?? false

  const inventoryOn = flagOn("ERP_INVENTORY")
  const invoicingOn = flagOn("ERP_INVOICING")
  const sendcloudOn = flagOn("ERP_SENDCLOUD")
  const commissionOn = flagOn("ERP_COMMISSION")
  const tax25aOn = flagOn("ERP_TAX_25A")

  const locStatusLine = locationCount === null
    ? "loading…"
    : locationCount === 0
    ? "No locations yet"
    : `${locationCount} active location${locationCount !== 1 ? "s" : ""}`

  return (
    <PageShell>
      <PageHeader
        title="ERP"
        subtitle="Inventory, invoicing, shipping, commission, and tax modules — activate via feature flags"
      />

      {/* Section: Foundation */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: C.muted,
        textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12,
      }}>
        Foundation
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 24 }}>

        <HubCard
          icon="📦"
          title="Warehouse Locations"
          description="Configure and manage physical storage locations. Required before inventory tracking can begin."
          statusLine={locStatusLine}
          statusColor={locationCount && locationCount > 0 ? C.success : C.muted}
          href="/app/erp/locations"
          actionLabel="Manage Locations →"
        />

        <HubCard
          icon="📊"
          title="Inventory"
          description="Article-level stock management (inventory_item). Tracks availability per location, syncs with legacy_available field."
          statusLine={inventoryOn ? "Active" : "Inactive — ERP_INVENTORY off"}
          statusColor={inventoryOn ? C.success : C.muted}
          href="/app/erp/inventory"
          disabled={!inventoryOn}
          disabledReason="Activate ERP_INVENTORY flag in Config → Feature Flags to enable."
        />

      </div>

      {/* Section: Operations */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: C.muted,
        textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12,
      }}>
        Operations
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 24 }}>

        <HubCard
          icon="🧾"
          title="Invoicing — easybill"
          description="GoBD-compliant invoice generation via easybill. Triggered automatically on payment success."
          statusLine={invoicingOn ? "Active" : "Inactive — ERP_INVOICING off"}
          statusColor={invoicingOn ? C.success : C.muted}
          href="/app/erp/invoicing"
          disabled={!invoicingOn}
          disabledReason="Requires: ERP_INVENTORY. Needs accountant sign-off before activation."
        />

        <HubCard
          icon="📮"
          title="Shipping — Sendcloud"
          description="Automated shipping labels and tracking via Sendcloud + DHL business account."
          statusLine={sendcloudOn ? "Active" : "Inactive — ERP_SENDCLOUD off"}
          statusColor={sendcloudOn ? C.success : C.muted}
          href="/app/erp/shipping"
          disabled={!sendcloudOn}
          disabledReason="Requires: ERP_INVENTORY + ERP_INVOICING."
        />

      </div>

      {/* Section: Hardware */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: C.muted,
        textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12,
      }}>
        Hardware
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 24 }}>

        <HubCard
          icon="🖨️"
          title="Printers"
          description="Manage Brother QL label printers per warehouse location. Test-print directly from the Admin UI."
          href="/app/erp/printers"
          actionLabel="Manage Printers →"
        />

        <HubCard
          icon="💻"
          title="Print Bridges"
          description="Registered Mac Bridge hosts. Monitor online/offline status and manage per-Mac pairing."
          href="/app/erp/bridges"
          actionLabel="Manage Bridges →"
        />

      </div>

      {/* Section: Finance */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: C.muted,
        textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12,
      }}>
        Finance
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>

        <HubCard
          icon="💰"
          title="Commission"
          description="Settlement accounting for consignment goods. Calculates and tracks payouts to commission owners."
          statusLine={commissionOn ? "Active" : "Inactive — ERP_COMMISSION off"}
          statusColor={commissionOn ? C.success : C.muted}
          href="/app/erp/commission"
          disabled={!commissionOn}
          disabledReason="Requires: ERP_INVENTORY + ERP_INVOICING. Needs commission contract template."
        />

        <HubCard
          icon="📑"
          title="§25a Tax Tracking"
          description="Margin scheme (Differenzbesteuerung) for used goods. Margin-accurate tracking per item for DATEV export."
          statusLine={tax25aOn ? "Active" : "Inactive — ERP_TAX_25A off"}
          statusColor={tax25aOn ? C.success : C.muted}
          href="/app/erp/tax"
          disabled={!tax25aOn}
          disabledReason="Requires: ERP_INVENTORY + ERP_INVOICING. Needs accountant sign-off (§25a configuration)."
        />

      </div>
    </PageShell>
  )
}

export const config = defineRouteConfig({
  label: "ERP",
  icon: DocumentText,
  rank: 7,
})

export default ERPHub
