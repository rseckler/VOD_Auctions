import { useCallback, useEffect, useRef, useState } from "react"
import { useAdminNav } from "../../components/admin-nav"
import { C, T, S } from "../../components/admin-tokens"
import { PageHeader, PageShell, SectionHeader } from "../../components/admin-layout"
import { Badge, Btn, Toast, inputStyle } from "../../components/admin-ui"
import {
  getPrinterHealth,
  listPrinters,
  getPreferredPrinter,
  setPreferredPrinter,
  printLabelAuto,
  type PrinterHealth,
  type PrinterEntry,
} from "../../lib/print-client"

const BRIDGE_URL = "http://127.0.0.1:17891"
const HEALTH_POLL_MS = 5000

type LogEntry = { at: string; ok: boolean; message: string; detail?: string }

function useHealthPolling() {
  const [health, setHealth] = useState<PrinterHealth | null>(null)
  const [lastAt, setLastAt] = useState<number>(0)

  const refresh = useCallback(async () => {
    const h = await getPrinterHealth(true)
    setHealth(h)
    setLastAt(Date.now())
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, HEALTH_POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  return { health, lastAt, refresh }
}

function PrintTestPage() {
  useAdminNav()
  const { health, lastAt, refresh } = useHealthPolling()
  const [printers, setPrinters] = useState<PrinterEntry[]>([])
  const [preferred, setPreferredState] = useState<string>(getPreferredPrinter())
  const [itemId, setItemId] = useState<string>("")
  const [copies, setCopies] = useState<number>(1)
  const [log, setLog] = useState<LogEntry[]>([])
  const [busy, setBusy] = useState<boolean>(false)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const logScrollRef = useRef<HTMLDivElement>(null)

  const addLog = useCallback((entry: Omit<LogEntry, "at">) => {
    setLog((l) => [...l, { ...entry, at: new Date().toLocaleTimeString() }].slice(-50))
    setTimeout(() => {
      if (logScrollRef.current) logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight
    }, 50)
  }, [])

  const runPrinters = useCallback(async () => {
    setBusy(true)
    try {
      const list = await listPrinters()
      setPrinters(list)
      addLog({ ok: true, message: `Printers geladen: ${list.length}`, detail: JSON.stringify(list, null, 2) })
    } finally {
      setBusy(false)
    }
  }, [addLog])

  useEffect(() => {
    runPrinters()
  }, [runPrinters])

  const handleSavePreferred = () => {
    setPreferredPrinter(preferred)
    setToast({ message: `Bevorzugter Drucker: ${preferred || "(Default)"}`, type: "success" })
    addLog({ ok: true, message: `localStorage vod.print.printer = ${preferred || "(cleared)"}` })
  }

  const handleHealthPing = async () => {
    setBusy(true)
    try {
      await refresh()
      addLog({ ok: true, message: "Health refresh", detail: JSON.stringify(health, null, 2) })
    } finally {
      setBusy(false)
    }
  }

  const handleSampleBridgeTest = async () => {
    setBusy(true)
    try {
      const pdfResp = await fetch("/admin/print-test/sample-label", { credentials: "include" })
      if (!pdfResp.ok) throw new Error(`Sample-PDF fetch ${pdfResp.status}`)
      const pdfBlob = await pdfResp.blob()

      const printResp = await fetch(`${BRIDGE_URL}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: pdfBlob,
      })
      const result = await printResp.json().catch(() => ({ ok: false, error: "invalid json" }))
      if (printResp.ok && result.ok) {
        addLog({ ok: true, message: `Bridge-Test OK (${pdfBlob.size} bytes → ${result.printer})`, detail: JSON.stringify(result, null, 2) })
        setToast({ message: "Test-Label an Bridge gesendet", type: "success" })
      } else {
        const err = result.error || `HTTP ${printResp.status}`
        addLog({ ok: false, message: `Bridge-Test fehlgeschlagen: ${err}`, detail: JSON.stringify(result, null, 2) })
        setToast({ message: `Fehler: ${err}`, type: "error" })
      }
    } catch (e: any) {
      const msg = e?.message || String(e)
      addLog({ ok: false, message: `Bridge-Test-Exception: ${msg}` })
      setToast({ message: msg, type: "error" })
    } finally {
      setBusy(false)
    }
  }

  const handleInventoryTest = async () => {
    if (!itemId.trim()) {
      setToast({ message: "Inventory Item ID fehlt", type: "error" })
      return
    }
    setBusy(true)
    try {
      const result = await printLabelAuto(itemId.trim(), copies)
      addLog({
        ok: true,
        message: `printLabelAuto → ${result.silent ? "silent via Bridge" : "browser-dialog fallback"}`,
        detail: JSON.stringify({ itemId: itemId.trim(), copies, ...result }, null, 2),
      })
      setToast({
        message: result.silent ? "Silent-Druck via Bridge OK" : "Browser-Fallback (Bridge nicht erreichbar)",
        type: "success",
      })
    } catch (e: any) {
      const msg = e?.message || String(e)
      addLog({ ok: false, message: `printLabelAuto Exception: ${msg}` })
      setToast({ message: msg, type: "error" })
    } finally {
      setBusy(false)
    }
  }

  const clearLog = () => setLog([])

  const healthBadge = !health
    ? { label: "Offline", color: C.error }
    : health.dry_run
    ? { label: `DRY_RUN · v${health.version}`, color: C.warning }
    : health.printer_found
    ? { label: `Silent Print · v${health.version}`, color: C.success }
    : { label: "Bridge OK, kein Drucker", color: C.warning }

  return (
    <PageShell>
      <PageHeader
        title="Print Bridge Diagnostik"
        subtitle="Lokaler Silent-Print-Daemon auf 127.0.0.1:17891 (ersetzt QZ Tray seit rc35)"
        badge={healthBadge}
      />

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* Health-Card */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: S.gap.lg, marginBottom: S.gap.lg }}>
        <SectionHeader title="Bridge-Status" />
        {!health ? (
          <div style={{ ...T.body, color: C.muted }}>
            <p>Bridge antwortet nicht auf <code>{BRIDGE_URL}/health</code>.</p>
            <div style={{ marginTop: S.gap.sm }}>Mögliche Ursachen:</div>
            <ul style={{ marginTop: 4, marginLeft: 20 }}>
              <li>LaunchAgent nicht installiert → <code>bash frank-macbook-setup/print-bridge/install-bridge.sh</code></li>
              <li>Bridge crashed → <code>tail -f ~/Library/Logs/vod-print-bridge.log</code></li>
              <li>Browser blockiert Localhost (Chrome PNA) → DevTools Konsole checken</li>
            </ul>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: S.gap.md, ...T.body }}>
            <KV k="Version" v={health.version || "?"} />
            <KV k="Konfigurierter Drucker" v={health.printer || "—"} />
            <KV k="CUPS verfügbar" v={health.cups_available ? "ja" : "nein"} good={!!health.cups_available} />
            <KV k="Drucker gefunden" v={health.printer_found ? "ja" : "nein"} good={!!health.printer_found} />
            <KV k="Dry-Run-Mode" v={health.dry_run ? "AN (Test)" : "AUS (Prod)"} good={!health.dry_run} warn={!!health.dry_run} />
            <KV k="Letzter Ping" v={lastAt ? new Date(lastAt).toLocaleTimeString() : "—"} />
          </div>
        )}
        <div style={{ marginTop: S.gap.md, display: "flex", gap: S.gap.sm }}>
          <Btn label="Health refresh" variant="ghost" onClick={handleHealthPing} disabled={busy} />
          <Btn label="Printers neu laden" variant="ghost" onClick={runPrinters} disabled={busy} />
        </div>
      </div>

      {/* Printers-Card */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: S.gap.lg, marginBottom: S.gap.lg }}>
        <SectionHeader title={`CUPS-Queues (${printers.length})`} />
        {printers.length === 0 ? (
          <p style={{ ...T.small, color: C.muted }}>Keine Queues gefunden. Bridge offline oder <code>lpstat -e</code> leer.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", ...T.body }}>
            <thead>
              <tr style={{ color: C.muted, textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: "6px 8px" }}>Queue-Name</th>
                <th style={{ padding: "6px 8px" }}>Status</th>
                <th style={{ padding: "6px 8px" }}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {printers.map((p) => (
                <tr key={p.name} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace" }}>{p.name}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <Badge label={p.status} variant={p.status === "accepting" ? "success" : "info"} />
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <Btn
                      label={preferred === p.name ? "Ausgewählt" : "Als bevorzugt setzen"}
                      variant={preferred === p.name ? "gold" : "ghost"}
                      onClick={() => {
                        setPreferredState(p.name)
                        setPreferredPrinter(p.name)
                        setToast({ message: `Drucker ${p.name} als bevorzugt gesetzt`, type: "success" })
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: S.gap.md, display: "flex", gap: S.gap.sm, alignItems: "center" }}>
          <span style={{ ...T.small, color: C.muted }}>Manuell:</span>
          <input
            value={preferred}
            onChange={(e) => setPreferredState(e.target.value)}
            placeholder="Brother_QL_820NWB"
            style={{ ...inputStyle, flex: 1, maxWidth: 300 }}
          />
          <Btn label="Speichern (localStorage)" variant="primary" onClick={handleSavePreferred} disabled={busy} />
        </div>
      </div>

      {/* Test-Card */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: S.gap.lg, marginBottom: S.gap.lg }}>
        <SectionHeader title="Druck-Tests" />

        {/* Bridge-Only Test */}
        <div style={{ marginBottom: S.gap.lg }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: "0 0 8px" }}>1. Bridge-Only (Sample-PDF)</h4>
          <p style={{ ...T.small, color: C.muted, marginBottom: S.gap.sm }}>
            Lädt Sample-Label (<code>/admin/print-test/sample-label</code> — „Cabaret Voltaire · Red Mecca ·
            €42") und POSTet direkt an die Bridge. Testet: PDF-Pipeline + Bridge + <code>lp</code>-Call.
          </p>
          <Btn label="Sample-Label drucken" variant="primary" onClick={handleSampleBridgeTest} disabled={busy || !health} />
        </div>

        {/* Full-Flow Test */}
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: "0 0 8px" }}>2. Full-Flow (echtes Inventory-Item)</h4>
          <p style={{ ...T.small, color: C.muted, marginBottom: S.gap.sm }}>
            Nutzt <code>printLabelAuto()</code> — der gleiche Code-Pfad wie Inventur-Session +
            Catalog-Detail. Item-ID z.B. aus <code>/app/erp/inventory</code>. Bei Bridge-Offline Fallback
            auf Browser-Druckdialog.
          </p>
          <div style={{ display: "flex", gap: S.gap.sm, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              placeholder="erp_inventory_item.id (UUID)"
              style={{ ...inputStyle, flex: 1, minWidth: 280, fontFamily: "ui-monospace, monospace" }}
            />
            <span style={{ ...T.small, color: C.muted }}>Kopien:</span>
            <input
              type="number"
              min="1"
              max="50"
              value={copies}
              onChange={(e) => setCopies(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
              style={{ ...inputStyle, width: 70 }}
            />
            <Btn label="Drucken" variant="primary" onClick={handleInventoryTest} disabled={busy} />
          </div>
        </div>
      </div>

      {/* Log-Card */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: S.gap.lg }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S.gap.md }}>
          <SectionHeader title={`Aktivitäts-Log (${log.length})`} />
          <Btn label="Leeren" variant="ghost" onClick={clearLog} disabled={log.length === 0} />
        </div>
        {log.length === 0 ? (
          <p style={{ ...T.small, color: C.muted }}>Noch keine Aktivität. Starte oben einen Test.</p>
        ) : (
          <div ref={logScrollRef} style={{ maxHeight: 400, overflowY: "auto", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
            {log.map((e, i) => (
              <div key={i} style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}`, color: e.ok ? C.text : C.error }}>
                <div>
                  <span style={{ color: C.muted }}>[{e.at}]</span>{" "}
                  <span>{e.ok ? "✓" : "✗"} {e.message}</span>
                </div>
                {e.detail && (
                  <pre style={{ marginTop: 4, color: C.muted, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{e.detail}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CLI-Hinweise */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: S.gap.lg, marginTop: S.gap.lg }}>
        <SectionHeader title="CLI-Diagnose (Terminal)" />
        <div style={{ ...T.small, fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap", color: C.muted }}>
{`# Health
curl -s http://127.0.0.1:17891/health

# Printers
curl -s http://127.0.0.1:17891/printers

# LaunchAgent-Status
launchctl print gui/$(id -u)/com.vod-auctions.print-bridge

# Logs live
tail -f ~/Library/Logs/vod-print-bridge.log

# Neu starten
launchctl kickstart -k gui/$(id -u)/com.vod-auctions.print-bridge

# Re-Install
bash frank-macbook-setup/print-bridge/install-bridge.sh [--dry-run] [--uninstall]`}
        </div>
      </div>
    </PageShell>
  )
}

function KV({ k, v, good, warn }: { k: string; v: string; good?: boolean; warn?: boolean }) {
  const color = warn ? C.warning : good ? C.success : C.text
  return (
    <div>
      <div style={{ ...T.small, color: C.muted }}>{k}</div>
      <div style={{ ...T.body, color, fontWeight: 500 }}>{v}</div>
    </div>
  )
}

export default PrintTestPage
