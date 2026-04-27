/**
 * PrintLocationSwitcher (rc52, 2026-04-27)
 *
 * Toolbar-Widget für Multi-Printer-Setups: zeigt den aktiven physischen
 * Standort des Macs an und erlaubt Frank das Umschalten zwischen Standorten.
 * Persistiert in localStorage (`vod.print.location`) — nächster Print-Job
 * fließt direkt zum richtigen Drucker.
 *
 * Auto-hides wenn:
 *  - Bridge ist offline (printerStatus prüft das schon)
 *  - Bridge meldet nur eine einzige Location (keine Wahl nötig)
 *  - Bridge im Single-Printer-Mode (PRINTER_IP gesetzt, keine PRINTERS-Map)
 */

import { useEffect, useState } from "react"
import { C, S, T } from "./admin-tokens"
import {
  getActiveLocation,
  setActiveLocation,
  getPrinterHealth,
  type PrinterHealth,
} from "../lib/print-client"

export function PrintLocationSwitcher() {
  const [health, setHealth] = useState<PrinterHealth | null>(null)
  const [active, setActive] = useState<string>(getActiveLocation())

  useEffect(() => {
    let cancelled = false
    getPrinterHealth().then((h) => {
      if (!cancelled) setHealth(h)
    })
    // Re-react auf programmatische setActiveLocation-Calls (anderes Tab,
    // oder Dev-Tools-localStorage-Edit).
    const onChange = () => setActive(getActiveLocation())
    window.addEventListener("vod-print-location-changed", onChange)
    window.addEventListener("storage", onChange)
    return () => {
      cancelled = true
      window.removeEventListener("vod-print-location-changed", onChange)
      window.removeEventListener("storage", onChange)
    }
  }, [])

  // Nichts zeigen wenn:
  //  - Health noch nicht da
  //  - Bridge nicht erreichbar
  //  - Single-Printer-Mode (keine locations-Array oder leeres)
  //  - Nur eine Location konfiguriert (nichts zu schalten)
  const locations = health?.locations || []
  if (!health?.ok || locations.length < 2) return null

  // Aktive Location bestimmen: localStorage > Bridge default > erste in Liste
  const effective =
    active ||
    health.default_location ||
    locations.find((l) => l.is_default)?.code ||
    locations[0]?.code ||
    ""

  const onSelect = (code: string) => {
    setActiveLocation(code)
    setActive(code)
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        background: C.subtle,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
      }}
      title="Physischer Standort dieses Macs — Druckjobs gehen zum dortigen Drucker"
    >
      <span style={{ ...T.small, color: C.muted }}>📍</span>
      <select
        value={effective}
        onChange={(e) => onSelect(e.target.value)}
        style={{
          background: "transparent",
          color: C.text,
          border: "none",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          outline: "none",
          padding: "2px 4px",
        }}
      >
        {locations.map((loc) => (
          <option key={loc.code} value={loc.code} style={{ background: C.card, color: C.text }}>
            {loc.code}
            {loc.is_default ? " (default)" : ""}
          </option>
        ))}
      </select>
    </div>
  )
}
