/**
 * QZ Tray browser client wrapper for silent label printing.
 *
 * Strategy:
 *   - Load qz-tray JS lazily from CDN on first use (no npm bundle bloat).
 *   - Connect to wss://localhost:8181 — QZ Tray desktop app must be running
 *     on the admin's machine (Franks MacBook Air / Mac Studio).
 *   - First connection shows a one-time approval prompt ("Allow this site to
 *     print?"). After Frank approves, it's remembered per origin.
 *   - Printer name comes from localStorage (`vod.qz.printer`), defaults to
 *     `Brother_QL_820NWB`. Setup script pre-seeds this key.
 *
 * Usage:
 *   import { qzPrintBarcodeLabel } from "../lib/qz-tray-client"
 *   const ok = await qzPrintBarcodeLabel(inventoryItemId)
 *   // ok === false → QZ Tray offline → caller falls back to iframe print.
 */

const QZ_CDN = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.min.js"
const DEFAULT_PRINTER = "Brother_QL_820NWB"
const PRINTER_KEY = "vod.qz.printer"

declare global {
  interface Window { qz?: any }
}

let loadPromise: Promise<any> | null = null
let promisersInitialized = false

async function loadQZLibrary(): Promise<any> {
  if (typeof window === "undefined") throw new Error("QZ Tray requires browser")
  if (window.qz) return window.qz
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = QZ_CDN
    script.async = true
    script.onload = () => {
      if (window.qz) resolve(window.qz)
      else reject(new Error("qz object not found after script load"))
    }
    script.onerror = () => {
      loadPromise = null
      reject(new Error("Failed to load qz-tray from CDN"))
    }
    document.head.appendChild(script)
  })
  return loadPromise
}

/**
 * Configure QZ Tray security-promisers so that connect requests are signed
 * by our backend. Without this, QZ Tray shows "Untrusted website" on every
 * connect and the "Remember this decision" checkbox is disabled.
 *
 * Flow:
 *   1. QZ Tray challenges client on connect with a random string to sign
 *   2. Our setSignaturePromiser POSTs the challenge to /admin/qz-tray/sign
 *   3. Backend signs it with private key (SHA512withRSA) and returns base64
 *   4. QZ Tray verifies the signature against our cert (from
 *      /admin/qz-tray/cert) — trusts us, allows "Remember"
 *
 * The cert is fetched once and cached for the lifetime of the page.
 */
function configurePromisers(qz: any): void {
  if (promisersInitialized) return
  promisersInitialized = true

  // Certificate: simple Promise<string>
  qz.security.setCertificatePromiser((resolve: (cert: string) => void, reject: (err: Error) => void) => {
    fetch("/admin/qz-tray/cert", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`cert fetch: ${r.status}`)
        return r.text()
      })
      .then((cert) => {
        if (!cert || !cert.includes("BEGIN CERTIFICATE")) {
          throw new Error("cert payload empty or malformed")
        }
        resolve(cert)
      })
      .catch(reject)
  })

  qz.security.setSignatureAlgorithm("SHA512")

  // Signature: QZ API expects factory (toSign) => (resolve, reject) => void
  qz.security.setSignaturePromiser((toSign: string) =>
    (resolve: (sig: string) => void, reject: (err: Error) => void) => {
      fetch("/admin/qz-tray/sign", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "text/plain" },
        body: toSign,
      })
        .then((r) => {
          if (!r.ok) throw new Error(`sign fetch: ${r.status}`)
          return r.text()
        })
        .then(resolve)
        .catch(reject)
    }
  )
}

async function ensureConnected(qz: any): Promise<void> {
  configurePromisers(qz)
  if (qz.websocket.isActive()) return
  await qz.websocket.connect({ retries: 2, delay: 1 })
  // Trigger signed-handshake direkt nach Connect. Ohne diesen no-op API-Call
  // zeigt der QZ Tray Permission-Dialog "anonymous request / Untrusted website"
  // (weil der Connect-Prompt nicht zwingend den signaturePromiser triggert).
  // Mit getVersion() wird die Challenge-Signierung sofort gemacht und der
  // Dialog zeigt das VOD-Cert — "Remember this decision" wird klickbar.
  try {
    await qz.api.getVersion()
  } catch {
    // getVersion wirft wenn User "Block" klickt oder QZ Tray das Cert
    // nicht verifizieren kann — Aufrufer behandelt das als "unavailable".
    throw new Error("QZ Tray connected but API-call rejected")
  }
}

export async function qzIsAvailable(): Promise<boolean> {
  try {
    const qz = await loadQZLibrary()
    await ensureConnected(qz)
    return true
  } catch {
    return false
  }
}

export function getPreferredPrinter(): string {
  if (typeof window === "undefined") return DEFAULT_PRINTER
  return window.localStorage.getItem(PRINTER_KEY) || DEFAULT_PRINTER
}

export function setPreferredPrinter(name: string): void {
  if (typeof window === "undefined") return
  if (!name) window.localStorage.removeItem(PRINTER_KEY)
  else window.localStorage.setItem(PRINTER_KEY, name)
}

export async function qzListPrinters(): Promise<string[]> {
  const qz = await loadQZLibrary()
  await ensureConnected(qz)
  const printers = await qz.printers.find()
  return Array.isArray(printers) ? printers : [printers]
}

/**
 * Silently print a barcode label for an inventory_item.
 * Returns true on successful queue submit, false if QZ Tray is unavailable.
 * Throws if QZ is available but something else went wrong (printer not found,
 * print payload rejected, etc.) so caller can expose the error in UI.
 */
export async function qzPrintBarcodeLabel(inventoryItemId: string): Promise<boolean> {
  let qz: any
  try {
    qz = await loadQZLibrary()
    await ensureConnected(qz)
  } catch {
    return false  // QZ Tray not reachable → caller falls back to iframe
  }

  const printerName = getPreferredPrinter()

  // Fetch PDF as base64 from admin label endpoint
  const resp = await fetch(`/admin/erp/inventory/items/${inventoryItemId}/label`, {
    credentials: "include",
  })
  if (!resp.ok) {
    throw new Error(`Label-PDF fetch ${resp.status}: ${resp.statusText}`)
  }
  const buf = await resp.arrayBuffer()
  const pdfBase64 = arrayBufferToBase64(buf)

  // Try exact name first; fall back to fuzzy Brother match so Franks
  // MacBook Air + Mac Studio both work even if CUPS renames the queue.
  let printer: string | null = await qz.printers.find(printerName).catch(() => null)
  if (!printer) {
    const all = await qz.printers.find().catch(() => [])
    const list: string[] = Array.isArray(all) ? all : (all ? [all] : [])
    console.log("QZ printers available:", list)
    const brother = list.find((p) => /brother.*ql/i.test(p) || /ql[_-]?82/i.test(p))
    if (brother) {
      console.warn(`QZ printer '${printerName}' not found — using '${brother}' instead`)
      printer = brother
    }
  }
  if (!printer) {
    throw new Error(`QZ: Kein Drucker '${printerName}' und kein Brother QL im System`)
  }

  const config = qz.configs.create(printer, {
    size: { width: 29, height: 90, units: "mm" },
    units: "mm",
    orientation: "portrait",
    margins: 0,
    copies: 1,
  })
  // QZ Tray 2.2.x akzeptiert keine data:-URIs für PDF. Richtige Syntax:
  // type=pixel, format=pdf, flavor=base64, data=<reiner base64 string>.
  // Frühere Versuche mit data:application/pdf;base64,... werfen
  // "unknown protocol: data" — siehe Franks Test 6 Log.
  await qz.print(config, [{
    type: "pixel",
    format: "pdf",
    flavor: "base64",
    data: pdfBase64,
  }])
  return true
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
  }
  return btoa(binary)
}

// ─── High-level print helper ────────────────────────────────────────────────

/**
 * Print a label with best-available method: QZ Tray silent print first,
 * fallback to hidden iframe that auto-triggers the browser print dialog,
 * last resort opens a new tab. Use this from any admin UI button that needs
 * to print a barcode label.
 *
 * Returns { silent } — silent=true means QZ Tray printed without any dialog,
 * silent=false means the OS print dialog was opened and user must click Print.
 */
export async function printLabelAuto(
  inventoryItemId: string
): Promise<{ silent: boolean }> {
  // Try QZ Tray first
  const silent = await qzPrintBarcodeLabel(inventoryItemId).catch(() => false)
  if (silent) return { silent: true }

  if (typeof window === "undefined") return { silent: false }

  // Fallback: hidden iframe → contentWindow.print() opens dialog
  return new Promise((resolve) => {
    const existing = document.getElementById("vod-print-frame") as HTMLIFrameElement | null
    const iframe = existing || document.createElement("iframe")
    iframe.id = "vod-print-frame"
    iframe.style.position = "fixed"
    iframe.style.right = "0"
    iframe.style.bottom = "0"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.border = "0"
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch {
        window.open(`/admin/erp/inventory/items/${inventoryItemId}/label`, "_blank")
      }
      resolve({ silent: false })
    }
    iframe.src = `/admin/erp/inventory/items/${inventoryItemId}/label`
    if (!existing) document.body.appendChild(iframe)
  })
}
