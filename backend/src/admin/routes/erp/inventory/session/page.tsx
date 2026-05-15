import { useEffect } from "react"

// ─── Redirect ────────────────────────────────────────────────────────────────
//
// Die frühere Erfassungs-Seite /app/erp/inventory/session ist seit 2026-05-15
// in den Tab "Erfassung" der Tab-Seite /app/erp/inventory aufgegangen
// (Konzept: docs/optimizing/INVENTORY_ERFASSUNG_LANDING_KONZEPT.md).
// Diese Route bleibt als Redirect bestehen, damit alte Bookmarks/Links nicht
// brechen.

function InventorySessionRedirect() {
  useEffect(() => {
    window.location.replace("/app/erp/inventory?tab=erfassung")
  }, [])

  return (
    <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
      Weiterleitung zur Erfassung…
    </div>
  )
}

export default InventorySessionRedirect
