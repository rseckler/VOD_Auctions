/**
 * VOD Print Bridge client — silent label printing via localhost HTTP agent.
 *
 * Ersetzt den alten QZ-Tray-Client. Die Bridge läuft als LaunchAgent auf dem
 * Mac (Frank's MacBook Air / Mac Studio, Robin's Mac) und hört auf
 * http://127.0.0.1:17891 — siehe frank-macbook-setup/print-bridge/.
 *
 * Flow:
 *   1. /health pingen → ist die Bridge online?
 *   2. Label-PDF von /admin/erp/inventory/items/:id/label holen (cookie-auth)
 *   3. PDF als raw application/pdf an Bridge POSTen → Bridge macht `lp`
 *   4. Bei Fehler oder Bridge-offline: iframe-Fallback mit Browser-Druckdialog
 *
 * Warum Browser → localhost HTTP klappt trotz HTTPS-Origin:
 *   - Chrome/Safari behandeln 127.0.0.1 als "potentially trustworthy"
 *     (Secure-Context-Spec), also kein Mixed-Content-Block
 *   - Chrome Private-Network-Access: Bridge sendet
 *     Access-Control-Allow-Private-Network: true auf preflight
 */

// HTTPS zwingend: Safari blockiert fetch() von https://admin.vod-auctions.com
// nach http://127.0.0.1 als Mixed Content — selbst für Loopback. Die Bridge
// serviert seit rc36 HTTPS mit mkcert-signiertem Cert (lokale CA im System-
// Keychain, vom Installer eingerichtet). Chrome/Firefox waren nachsichtiger,
// aber Safari-Strict ist der Maßstab für Franks Admin-Webapp.
const BRIDGE_URL = "https://127.0.0.1:17891"
const BRIDGE_TIMEOUT_MS = 2000
const PRINT_TIMEOUT_MS = 15000
const DEFAULT_PRINTER = "Brother_QL_820NWB"
const PRINTER_KEY = "vod.print.printer"
// rc52 (Multi-Printer): aktiver physischer Standort des Macs. Wird vom
// Frontend als `?location=` an die Bridge mitgeschickt; Bridge resolved
// die IP aus ihrer PRINTERS_JSON-Map. Wenn nicht gesetzt → Bridge nutzt
// ihr eigenes default_location oder PRINTER_IP-Fallback.
const LOCATION_KEY = "vod.print.location"

export type PrinterLocation = {
  code: string
  ip: string
  is_default: boolean
}

export type PrinterHealth = {
  ok: boolean
  version?: string
  printer?: string
  printer_found?: boolean
  printer_ip?: string
  printer_model?: string
  dry_run?: boolean
  cups_available?: boolean
  // rc52 multi-printer:
  default_location?: string | null
  default_resolved_from?: string
  locations?: PrinterLocation[]
  single_printer_ip?: string | null
  deps_ok?: boolean
  dep_error?: string
}

export type PrinterEntry = {
  name: string
  status: string
  location?: string | null
  ip?: string
  is_default?: boolean
}

let cachedHealth: { at: number; value: PrinterHealth | null } | null = null
const HEALTH_TTL_MS = 3000

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

export async function getPrinterHealth(force = false): Promise<PrinterHealth | null> {
  if (!force && cachedHealth && Date.now() - cachedHealth.at < HEALTH_TTL_MS) {
    return cachedHealth.value
  }
  try {
    const r = await fetchWithTimeout(`${BRIDGE_URL}/health`, {}, BRIDGE_TIMEOUT_MS)
    if (!r.ok) throw new Error(`health ${r.status}`)
    const value = (await r.json()) as PrinterHealth
    cachedHealth = { at: Date.now(), value }
    return value
  } catch {
    cachedHealth = { at: Date.now(), value: null }
    return null
  }
}

/** Replacement für qzIsAvailable(). true → Bridge erreichbar + Drucker gefunden. */
export async function printerAvailable(): Promise<boolean> {
  const h = await getPrinterHealth()
  return !!h?.ok && !!h.printer_found
}

export async function listPrinters(): Promise<PrinterEntry[]> {
  try {
    const r = await fetchWithTimeout(`${BRIDGE_URL}/printers`, {}, BRIDGE_TIMEOUT_MS)
    if (!r.ok) return []
    const data = await r.json()
    return Array.isArray(data?.printers) ? (data.printers as PrinterEntry[]) : []
  } catch {
    return []
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

/**
 * Aktiver physischer Standort des Macs (rc52, multi-printer).
 * Frank kann zwischen Standorten switchen (Toolbar in Inventory-Session
 * oder Operations-Hub). Persistiert in localStorage. Empty string = nutze
 * Bridge-Default.
 */
export function getActiveLocation(): string {
  if (typeof window === "undefined") return ""
  return (window.localStorage.getItem(LOCATION_KEY) || "").trim().toUpperCase()
}

export function setActiveLocation(code: string): void {
  if (typeof window === "undefined") return
  const v = (code || "").trim().toUpperCase()
  if (!v) window.localStorage.removeItem(LOCATION_KEY)
  else window.localStorage.setItem(LOCATION_KEY, v)
  // Notify subscribers (toolbar widget, session page) — same-tab events
  // need a manual dispatch since localStorage event only fires cross-tab.
  try {
    window.dispatchEvent(new CustomEvent("vod-print-location-changed", { detail: v }))
  } catch { /* noop */ }
}

/**
 * Silently print a barcode label for an inventory item.
 * Returns true on successful queue submit, false if bridge unavailable.
 * Throws on bridge-reached-but-failed (printer offline, CUPS error, etc.).
 *
 * `locationCode` (rc52): physischer Standort des Macs (z.B. "EUGENSTRASSE").
 * Wenn weggelassen, wird der `getActiveLocation()`-Wert aus localStorage
 * verwendet — Bridge fällt dann auf ihr eigenes default_location zurück
 * wenn nichts gesetzt ist.
 */
export async function printBarcodeLabel(
  inventoryItemId: string,
  copies = 1,
  locationCode?: string
): Promise<boolean> {
  const health = await getPrinterHealth(true)
  if (!health?.ok) return false

  // 1. Fetch label PDF from backend (cookie-auth)
  const labelResp = await fetch(`/admin/erp/inventory/items/${inventoryItemId}/label`, {
    credentials: "include",
  })
  if (!labelResp.ok) {
    throw new Error(`Label-PDF fetch ${labelResp.status}: ${labelResp.statusText}`)
  }
  const pdfBlob = await labelResp.blob()

  // 2. POST PDF to bridge (raw body — kein base64 roundtrip nötig)
  const location = (locationCode ?? getActiveLocation()).trim()
  const params = new URLSearchParams({
    copies: String(copies),
    printer: getPreferredPrinter(),
  })
  if (location) params.set("location", location)
  const printResp = await fetchWithTimeout(`${BRIDGE_URL}/print?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: pdfBlob,
  }, PRINT_TIMEOUT_MS)

  if (!printResp.ok) {
    const detail = await printResp.text().catch(() => "")
    throw new Error(`Print-Bridge ${printResp.status}: ${detail || printResp.statusText}`)
  }

  const result = await printResp.json().catch(() => ({ ok: false }))
  if (!result?.ok) {
    throw new Error(`Bridge meldet Fehler: ${result?.error || "unbekannt"}`)
  }
  return true
}

// ─── High-level print helper ────────────────────────────────────────────────

/**
 * Print a label with best-available method: localhost Print-Bridge silent first,
 * fallback to hidden iframe that auto-triggers the browser print dialog,
 * last resort opens a new tab.
 *
 * Returns { silent } — silent=true means Bridge printed without dialog,
 * silent=false means iframe-print-dialog or new tab.
 */
export async function printLabelAuto(
  inventoryItemId: string,
  copies = 1,
  locationCode?: string
): Promise<{ silent: boolean }> {
  try {
    const silent = await printBarcodeLabel(inventoryItemId, copies, locationCode)
    if (silent) return { silent: true }
  } catch (e) {
    // Bridge reached but something failed — surface in console, fall back.
    console.warn("[print-bridge] silent print failed, falling back to browser:", e)
  }

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

