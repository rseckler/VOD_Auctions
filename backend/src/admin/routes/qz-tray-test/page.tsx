import { useState, useRef, useEffect } from "react"
import { useAdminNav } from "../../components/admin-nav"
import { C, T, S } from "../../components/admin-tokens"
import { PageHeader, PageShell, SectionHeader } from "../../components/admin-layout"
import { Btn, Badge } from "../../components/admin-ui"
import {
  qzIsAvailable,
  qzListPrinters,
  qzPrintBarcodeLabel,
  getPreferredPrinter,
  setPreferredPrinter,
  printLabelAuto,
} from "../../lib/qz-tray-client"

type LogEntry = {
  t: number
  level: "info" | "ok" | "error"
  msg: string
}

function QZTrayTestPage() {
  useAdminNav()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [qzStatus, setQzStatus] = useState<"unknown" | "available" | "unavailable">("unknown")
  const [printers, setPrinters] = useState<string[]>([])
  const [printerName, setPrinterName] = useState(getPreferredPrinter())
  const [testItemId, setTestItemId] = useState("01KPR8PB7F8VTB4KZEHAJMZ99B")
  const [certPreview, setCertPreview] = useState("")
  const [signPreview, setSignPreview] = useState("")
  const logBox = useRef<HTMLDivElement>(null)

  const log = (level: LogEntry["level"], msg: string) => {
    setLogs((p) => [...p, { t: Date.now(), level, msg }])
    setTimeout(() => {
      if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight
    }, 50)
  }

  useEffect(() => {
    log("info", "Test-Page geladen — Test-Suite bereit.")
  }, [])

  const testCertEndpoint = async () => {
    log("info", "GET /admin/qz-tray/cert ...")
    try {
      const r = await fetch("/admin/qz-tray/cert", { credentials: "include" })
      if (!r.ok) {
        log("error", `Status ${r.status}: ${r.statusText}`)
        return
      }
      const cert = await r.text()
      const looksLikeCert = cert.includes("BEGIN CERTIFICATE")
      setCertPreview(cert.slice(0, 120) + "...")
      if (looksLikeCert) {
        const lines = cert.split("\n").length
        log("ok", `Cert empfangen (${cert.length} Bytes, ${lines} Zeilen, BEGIN CERTIFICATE ✓)`)
      } else {
        log("error", `Cert payload sieht komisch aus: ${cert.slice(0, 200)}`)
      }
    } catch (e: any) {
      log("error", `Fetch-Error: ${e.message}`)
    }
  }

  const testSignEndpoint = async () => {
    const challenge = `test-${Date.now()}`
    log("info", `POST /admin/qz-tray/sign body="${challenge}"...`)
    try {
      const r = await fetch("/admin/qz-tray/sign", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "text/plain" },
        body: challenge,
      })
      if (!r.ok) {
        log("error", `Status ${r.status}: ${r.statusText}`)
        return
      }
      const sig = await r.text()
      setSignPreview(sig.slice(0, 80) + "...")
      log("ok", `Signature empfangen (${sig.length} Bytes base64). Sig sollte jedes Mal anders sein für gleiches Challenge.`)
    } catch (e: any) {
      log("error", `Fetch-Error: ${e.message}`)
    }
  }

  const testQzAvailable = async () => {
    log("info", "Checke QZ Tray WebSocket-Verbindung (wss://localhost:8181)...")
    try {
      const ok = await qzIsAvailable()
      setQzStatus(ok ? "available" : "unavailable")
      if (ok) {
        log("ok", "QZ Tray antwortet ✓ — Signed-Mode mit Cert + Signature aktiv.")
      } else {
        log("error", "QZ Tray nicht erreichbar. Möglich: QZ Tray App nicht gestartet, oder Dialog noch offen und nicht bestätigt.")
      }
    } catch (e: any) {
      log("error", `Unerwarteter Error: ${e.message}`)
    }
  }

  const testListPrinters = async () => {
    log("info", "Frage Drucker-Liste von QZ Tray an...")
    try {
      const list = await qzListPrinters()
      setPrinters(list)
      log("ok", `${list.length} Drucker gefunden: ${list.join(" | ")}`)
    } catch (e: any) {
      log("error", `Drucker-Liste fehlgeschlagen: ${e.message}`)
    }
  }

  const testPrintQz = async () => {
    log("info", `qzPrintBarcodeLabel(${testItemId}) — direkter QZ-Pfad, kein Fallback...`)
    try {
      const ok = await qzPrintBarcodeLabel(testItemId)
      if (ok) log("ok", "QZ Tray: Druckjob an Queue übergeben (silent)")
      else log("error", "QZ Tray nicht erreichbar — fällt auf iframe zurück (Test 7).")
    } catch (e: any) {
      log("error", `QZ Print Exception: ${e.message || e}`)
      if (e?.stack) console.error(e.stack)
    }
  }

  const testPrintAuto = async () => {
    log("info", `printLabelAuto(${testItemId}) — mit iframe-Fallback...`)
    try {
      const r = await printLabelAuto(testItemId)
      if (r.silent) log("ok", "✓ silent via QZ Tray")
      else log("info", "Browser-Print-Dialog geöffnet (QZ nicht erreichbar)")
    } catch (e: any) {
      log("error", `Exception: ${e.message}`)
    }
  }

  const testLabelEndpoint = async () => {
    log("info", `GET /admin/erp/inventory/items/${testItemId}/label — PDF-Generator check...`)
    try {
      const r = await fetch(`/admin/erp/inventory/items/${testItemId}/label`, {
        credentials: "include",
      })
      if (!r.ok) {
        log("error", `Status ${r.status}: ${r.statusText}`)
        return
      }
      const buf = await r.arrayBuffer()
      const pct = r.headers.get("Content-Type")
      if (pct?.includes("pdf") && buf.byteLength > 0) {
        log("ok", `PDF empfangen (${buf.byteLength} Bytes, Content-Type: ${pct})`)
      } else {
        log("error", `Unerwarteter Response: ${buf.byteLength} Bytes, Type: ${pct}`)
      }
    } catch (e: any) {
      log("error", `Fetch-Error: ${e.message}`)
    }
  }

  const savePrinter = () => {
    setPreferredPrinter(printerName)
    log("ok", `Printer-Preference gespeichert: "${printerName}" (localStorage)`)
  }

  const clearLogs = () => setLogs([])

  return (
    <PageShell>
      <PageHeader
        title="QZ Tray Test-Suite"
        subtitle="End-to-End-Debugging für Silent-Print ohne reale Verify-Aktion"
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.gap.lg, marginBottom: S.gap.lg }}>
        {/* Status Card */}
        <div style={{ background: C.card, borderRadius: S.radius.md, border: `1px solid ${C.border}`, padding: S.gap.lg }}>
          <SectionHeader title="Aktueller Status" style={{ marginTop: 0 }} />
          <div style={{ ...T.small, color: C.muted, marginBottom: 8 }}>QZ Tray:</div>
          <div style={{ marginBottom: S.gap.md }}>
            {qzStatus === "unknown" && <Badge label="Noch nicht getestet" variant="neutral" />}
            {qzStatus === "available" && <Badge label="✓ Verbunden (Signed-Mode aktiv)" variant="success" />}
            {qzStatus === "unavailable" && <Badge label="✗ Nicht erreichbar" variant="error" />}
          </div>
          <div style={{ ...T.small, color: C.muted, marginBottom: 4 }}>Preferred Printer (localStorage):</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="text"
              value={printerName}
              onChange={(e) => setPrinterName(e.target.value)}
              style={{ flex: 1, padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: "monospace", fontSize: 12 }}
            />
            <Btn label="Save" variant="ghost" onClick={savePrinter} style={{ fontSize: 12 }} />
          </div>
          {printers.length > 0 && (
            <div style={{ ...T.small, color: C.muted, marginTop: 8 }}>
              <strong>Gefundene Drucker:</strong>
              <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
                {printers.map((p) => <li key={p} style={{ fontFamily: "monospace" }}>{p}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Test Item Card */}
        <div style={{ background: C.card, borderRadius: S.radius.md, border: `1px solid ${C.border}`, padding: S.gap.lg }}>
          <SectionHeader title="Test-Item für Drucke" style={{ marginTop: 0 }} />
          <div style={{ ...T.small, color: C.muted, marginBottom: 4 }}>inventory_item_id:</div>
          <input
            type="text"
            value={testItemId}
            onChange={(e) => setTestItemId(e.target.value)}
            style={{ width: "100%", padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: "monospace", fontSize: 12 }}
          />
          <div style={{ ...T.small, color: C.muted, marginTop: 8 }}>
            Default ist VOD-000001 (Asmus Tietchens). Aendere für andere Items.
          </div>
        </div>
      </div>

      {/* Test Buttons */}
      <div style={{ background: C.card, borderRadius: S.radius.md, border: `1px solid ${C.border}`, padding: S.gap.lg, marginBottom: S.gap.lg }}>
        <SectionHeader title="Tests (von klein zu groß)" style={{ marginTop: 0 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: S.gap.md }}>
          <Btn label="1. Cert-Endpoint testen" variant="ghost" onClick={testCertEndpoint} />
          <Btn label="2. Sign-Endpoint testen" variant="ghost" onClick={testSignEndpoint} />
          <Btn label="3. Label-PDF Endpoint testen" variant="ghost" onClick={testLabelEndpoint} />
          <Btn label="4. QZ Tray erreichbar?" variant="ghost" onClick={testQzAvailable} />
          <Btn label="5. QZ Tray: Drucker listen" variant="ghost" onClick={testListPrinters} />
          <Btn label="6. QZ Tray: Label drucken (silent-only)" variant="gold" onClick={testPrintQz} />
          <Btn label="7. Auto: QZ → iframe Fallback" variant="gold" onClick={testPrintAuto} />
          <Btn label="Logs leeren" variant="ghost" onClick={clearLogs} />
        </div>
        {certPreview && (
          <div style={{ ...T.small, color: C.muted, marginTop: S.gap.md }}>
            <strong>Cert preview:</strong> <code style={{ fontFamily: "monospace" }}>{certPreview}</code>
          </div>
        )}
        {signPreview && (
          <div style={{ ...T.small, color: C.muted, marginTop: 4 }}>
            <strong>Signature preview:</strong> <code style={{ fontFamily: "monospace" }}>{signPreview}</code>
          </div>
        )}
      </div>

      {/* Live Log */}
      <div style={{ background: C.card, borderRadius: S.radius.md, border: `1px solid ${C.border}`, padding: S.gap.lg }}>
        <SectionHeader title={`Live-Log (${logs.length})`} style={{ marginTop: 0 }} />
        <div
          ref={logBox}
          style={{
            background: "#0b0b0b",
            color: "#e7e5e4",
            padding: 12,
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 12,
            maxHeight: 360,
            overflowY: "auto",
            lineHeight: 1.5,
          }}
        >
          {logs.length === 0 && <span style={{ opacity: 0.5 }}>(noch keine Logs)</span>}
          {logs.map((l, i) => {
            const color = l.level === "error" ? "#fca5a5" : l.level === "ok" ? "#86efac" : "#cbd5e1"
            const time = new Date(l.t).toLocaleTimeString()
            return (
              <div key={i} style={{ color }}>
                <span style={{ opacity: 0.5 }}>[{time}]</span>{" "}
                <span style={{ opacity: 0.7 }}>[{l.level.toUpperCase()}]</span>{" "}
                {l.msg}
              </div>
            )
          })}
        </div>
        <div style={{ ...T.small, color: C.muted, marginTop: S.gap.md }}>
          <strong>Empfohlener Test-Ablauf bei Problemen:</strong>
          <ol style={{ margin: "4px 0", paddingLeft: 20 }}>
            <li>Tests 1–3 (Backend-Endpoints antworten)</li>
            <li>Test 4 (QZ Tray Connect — beim ersten Klick erscheint Dialog mit <strong>VOD Auctions</strong> statt „anonymous")</li>
            <li>Wenn Dialog noch „Untrusted website" sagt → Cert-Promiser greift nicht (check Console)</li>
            <li>Test 6 (silent print, sollte ohne Dialog drucken nach Test 4)</li>
          </ol>
        </div>
      </div>
    </PageShell>
  )
}

// Bewusst kein defineRouteConfig: Debug-Seite, nicht in der Sidebar sichtbar.
// Aufruf per URL: https://admin.vod-auctions.com/app/qz-tray-test
export default QZTrayTestPage
