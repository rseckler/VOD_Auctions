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

const BRIDGE_URL = "https://127.0.0.1:17891"
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
      const pdfResp = await fetch("/admin/print-bridge/sample-label", { credentials: "include" })
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
        title="Drucker-Test"
        subtitle="Hier kannst Du prüfen, ob der Etikettendruck funktioniert, und ein Test-Etikett drucken."
        badge={healthBadge}
      />

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* Status-Card — große Ampel + klare Handlung */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: S.gap.lg, marginBottom: S.gap.lg }}>
        {!health ? (
          <div style={{ ...T.body }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.error, marginBottom: S.gap.md }}>
              🔴 Der Drucker-Dienst läuft gerade nicht
            </div>
            <p style={{ marginBottom: S.gap.md }}>
              Das Admin-Backend kann die Druck-Brücke auf diesem Mac nicht erreichen. Etiketten können
              aktuell nicht im Hintergrund gedruckt werden — der Browser öffnet stattdessen den
              normalen Druck-Dialog (Cmd+P).
            </p>
            <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 6, padding: S.gap.md, marginBottom: S.gap.md }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Was jetzt?</div>
              <p style={{ margin: 0 }}>
                Bitte bei <strong>Robin</strong> melden (<a href="mailto:rseckler@gmail.com">rseckler@gmail.com</a>).
                Er startet den Druck-Dienst per Fernwartung in ein paar Minuten. Bis dahin funktioniert
                der normale Druck-Dialog weiter.
              </p>
            </div>
            <div style={{ ...T.small, color: C.muted }}>
              Status wird alle 5 Sekunden automatisch geprüft — sobald der Dienst wieder läuft,
              verschwindet diese Meldung ohne Neuladen.
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: S.gap.md, color: health.dry_run ? C.warning : health.printer_found ? C.success : C.warning }}>
              {health.dry_run
                ? "🟡 Drucker-Dienst läuft im Test-Modus"
                : health.printer_found
                ? "🟢 Drucker-Dienst bereit"
                : "🟡 Drucker-Dienst läuft, aber kein Etiketten-Drucker gefunden"}
            </div>
            <div style={{ ...T.body, marginBottom: S.gap.md }}>
              {health.dry_run ? (
                <p style={{ margin: 0 }}>
                  Der Dienst nimmt Druck-Aufträge an, druckt aber nichts aus. Das ist nur für Tests
                  auf einem Mac ohne angeschlossenen Etiketten-Drucker (z.B. Robins Dev-Rechner).
                </p>
              ) : health.printer_found ? (
                <p style={{ margin: 0 }}>
                  Etiketten werden ab sofort im Hintergrund gedruckt, ohne Druck-Dialog. Du kannst
                  unten ein Test-Etikett drucken um es zu prüfen.
                </p>
              ) : (
                <p style={{ margin: 0 }}>
                  Der Dienst läuft, aber <strong>{health.printer || "der erwartete Drucker"}</strong>{" "}
                  ist gerade nicht im System. Prüfe ob der Brother-Drucker eingeschaltet und im WLAN ist.
                </p>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: S.gap.md, ...T.body, fontSize: 12 }}>
              <KV k="Drucker" v={health.printer || "—"} />
              <KV k="Drucker erkannt" v={health.printer_found ? "Ja" : "Nein"} good={!!health.printer_found} />
              <KV k="Letzter Ping" v={lastAt ? new Date(lastAt).toLocaleTimeString() : "—"} />
            </div>
          </>
        )}
      </div>

      {/* Printers-Card */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: S.gap.lg, marginBottom: S.gap.lg }}>
        <SectionHeader title={`CUPS-Queues (${printers.length})`} />
        {printers.length === 0 ? (
          <p style={{ ...T.small, color: C.muted }}>Keine Drucker gefunden. Sobald der Drucker-Dienst läuft, erscheinen hier alle installierten Drucker.</p>
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
            Lädt Sample-Label (<code>/admin/print-bridge/sample-label</code> — „Cabaret Voltaire · Red Mecca ·
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

      {/* CLI-Hinweise — nur aufklappbar (für Robin/Entwickler) */}
      <details style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: S.gap.lg, marginTop: S.gap.lg }}>
        <summary style={{ ...T.small, color: C.muted, cursor: "pointer", fontWeight: 600 }}>
          Technische Details (für Entwickler)
        </summary>
        <div style={{ ...T.small, fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap", color: C.muted, marginTop: S.gap.md }}>
{`# Health (HTTPS, mkcert-Cert)
curl -s https://127.0.0.1:17891/health
# oder (wenn mkcert local CA noch nicht trusted):
curl -sk https://127.0.0.1:17891/health

# Printers
curl -sk https://127.0.0.1:17891/printers

# LaunchAgent-Status
launchctl print gui/$(id -u)/com.vod-auctions.print-bridge

# Logs live
tail -f ~/Library/Logs/vod-print-bridge.log

# Neu starten
launchctl kickstart -k gui/$(id -u)/com.vod-auctions.print-bridge

# Re-Install (inkl. mkcert-Setup)
bash frank-macbook-setup/print-bridge/install-bridge.sh [--dry-run] [--uninstall]`}
        </div>
      </details>
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
