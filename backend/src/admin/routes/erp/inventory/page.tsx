import { useState, useCallback } from "react"
import { useAdminNav } from "../../../components/admin-nav"
import { PageHeader, PageShell, Tabs } from "../../../components/admin-layout"
import { UebersichtTab } from "./UebersichtTab"
import { ErfassungTab } from "./session/ErfassungTab"

// ─── Inventory Tab-Shell ─────────────────────────────────────────────────────
//
// /app/erp/inventory ist seit 2026-05-15 eine Tab-Seite (Konzept:
// docs/optimizing/INVENTORY_ERFASSUNG_LANDING_KONZEPT.md). Der Default-Tab
// "Erfassung" ist der Arbeitsplatz (Suche + Bewertung + Label-Druck), Tab
// "Übersicht" ist das frühere Dashboard.
//
// Lazy-Mount-Hybrid:
//  - ErfassungTab ist IMMER gemountet — sonst geht beim Tab-Wechsel der
//    Such-/Edit-State verloren.
//  - UebersichtTab wird erst beim ersten Aktivieren gemountet (die 9 schweren
//    Aggregat-Queries des Dashboards feuern dann erst), bleibt danach gemountet.
//  - Der inaktive Tab wird per display:none versteckt, NICHT unmounten.

type TabKey = "erfassung" | "uebersicht"

const TAB_LABELS: Record<TabKey, string> = {
  erfassung: "Erfassung",
  uebersicht: "Übersicht",
}
const LABEL_TO_KEY: Record<string, TabKey> = {
  Erfassung: "erfassung",
  Übersicht: "uebersicht",
}

function readInitialTab(): TabKey {
  if (typeof window === "undefined") return "erfassung"
  const t = new URLSearchParams(window.location.search).get("tab")
  return t === "uebersicht" ? "uebersicht" : "erfassung"
}

function InventoryPage() {
  useAdminNav()

  const [tab, setTab] = useState<TabKey>(readInitialTab)
  // Übersicht-Tab erst beim ersten Aktivieren mounten.
  const [overviewMounted, setOverviewMounted] = useState<boolean>(
    () => readInitialTab() === "uebersicht"
  )

  const handleTabChange = useCallback((label: string) => {
    const key = LABEL_TO_KEY[label] ?? "erfassung"
    setTab(key)
    if (key === "uebersicht") setOverviewMounted(true)
    try {
      window.history.replaceState(null, "", `?tab=${key}`)
    } catch { /* ignore */ }
  }, [])

  return (
    <PageShell>
      <PageHeader title="Inventory" subtitle="Stocktake & Erfassung" />
      <Tabs
        tabs={[TAB_LABELS.erfassung, TAB_LABELS.uebersicht]}
        active={TAB_LABELS[tab]}
        onChange={handleTabChange}
      />
      <div style={{ display: tab === "erfassung" ? "block" : "none" }}>
        <ErfassungTab active={tab === "erfassung"} />
      </div>
      <div style={{ display: tab === "uebersicht" ? "block" : "none" }}>
        {overviewMounted && <UebersichtTab />}
      </div>
    </PageShell>
  )
}

export default InventoryPage
