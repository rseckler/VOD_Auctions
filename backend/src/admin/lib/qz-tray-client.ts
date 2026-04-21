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

async function ensureConnected(qz: any): Promise<void> {
  // Unsigned mode: no certificate promiser set → user sees one-time prompt.
  if (qz.websocket.isActive()) return
  await qz.websocket.connect({ retries: 2, delay: 1 })
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
 * Returns true on successful queue submit, false if QZ Tray is unavailable
 * (caller should then fall back to browser/iframe print).
 */
export async function qzPrintBarcodeLabel(inventoryItemId: string): Promise<boolean> {
  let qz: any
  try {
    qz = await loadQZLibrary()
    await ensureConnected(qz)
  } catch {
    return false
  }

  const printerName = getPreferredPrinter()

  // Fetch PDF as base64 from admin label endpoint
  let pdfBase64: string
  try {
    const resp = await fetch(`/admin/erp/inventory/items/${inventoryItemId}/label`, {
      credentials: "include",
    })
    if (!resp.ok) {
      console.error(`Label fetch failed: ${resp.status}`)
      return false
    }
    const buf = await resp.arrayBuffer()
    pdfBase64 = arrayBufferToBase64(buf)
  } catch (e) {
    console.error("Label fetch error", e)
    return false
  }

  try {
    // Try exact name first; fall back to fuzzy Brother match so Franks
    // MacBook Air + Mac Studio both work even if CUPS renames the queue.
    let printer: string | null = await qz.printers.find(printerName).catch(() => null)
    if (!printer) {
      const all = await qz.printers.find().catch(() => [])
      const list: string[] = Array.isArray(all) ? all : (all ? [all] : [])
      const brother = list.find((p) => /brother.*ql/i.test(p) || /ql[_-]?82/i.test(p))
      if (brother) {
        console.warn(`QZ printer '${printerName}' not found — using '${brother}' instead`)
        printer = brother
      }
    }
    if (!printer) {
      console.error(`QZ printer not found: ${printerName}`)
      return false
    }
    const config = qz.configs.create(printer, {
      size: { width: 29, height: 90, units: "mm" },
      units: "mm",
      orientation: "portrait",
      margins: 0,
      copies: 1,
    })
    await qz.print(config, [{ type: "pixel", format: "pdf", data: `data:application/pdf;base64,${pdfBase64}` }])
    return true
  } catch (e) {
    console.error("QZ print error", e)
    return false
  }
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
