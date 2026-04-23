// ─── VOD Auctions Admin Design Tokens ──────────────────────────────────────
// Single source of truth for all colors, typography, and spacing.
// Every admin page MUST import from here. No hardcoded values in pages.
//
// Dark-Mode: deaktiviert. Medusas next-themes-Switch wird hart auf Light
// gepinnt, weil nicht alle Admin-Seiten/Dialoge sauber durchgefärbt sind.
// Der unten injizierte Style + Observer reißt `.dark` von <html> wieder runter,
// falls Medusa (z. B. via Systemeinstellung) sie re-applyt.

// ─── Theme-var injection (side-effect, module-init) ────────────────────────

const THEME_VAR_CSS = `
  :root {
    color-scheme: light;
    --vod-card: #f8f7f6;
    --vod-text: #1a1714;
    --vod-muted: #78716c;
    --vod-border: #e7e5e4;
    --vod-hover: #f5f4f3;
    --vod-subtle: rgba(0, 0, 0, 0.04);
  }
  html.dark, html[data-theme="dark"], .dark {
    color-scheme: light;
    --vod-card: #f8f7f6;
    --vod-text: #1a1714;
    --vod-muted: #78716c;
    --vod-border: #e7e5e4;
    --vod-hover: #f5f4f3;
    --vod-subtle: rgba(0, 0, 0, 0.04);
  }
`

if (typeof document !== "undefined" && !document.getElementById("vod-theme-vars")) {
  const style = document.createElement("style")
  style.id = "vod-theme-vars"
  style.textContent = THEME_VAR_CSS
  document.head.appendChild(style)
}

// Force light mode: pin next-themes preference + strip `.dark` / data-theme
// from <html>. Observer is idempotent — only acts when dark is actually set,
// so our own removals don't loop.
if (typeof document !== "undefined" && !(window as any).__vodForceLight) {
  ;(window as any).__vodForceLight = true
  try {
    window.localStorage?.setItem("theme", "light")
  } catch {}
  const html = document.documentElement
  const stripDark = () => {
    if (html.classList.contains("dark")) html.classList.remove("dark")
    if (html.getAttribute("data-theme") === "dark") html.setAttribute("data-theme", "light")
  }
  stripDark()
  const obs = new MutationObserver(stripDark)
  obs.observe(html, { attributes: true, attributeFilter: ["class", "data-theme"] })
}

// ─── Color Tokens ──────────────────────────────────────────────────────────

export const C = {
  // Theme-aware (flip with dark mode)
  bg: "transparent",
  card: "var(--vod-card)",
  text: "var(--vod-text)",
  muted: "var(--vod-muted)",
  border: "var(--vod-border)",
  hover: "var(--vod-hover)",
  subtle: "var(--vod-subtle)",

  // Constant accents — readable on both light and dark
  gold: "#b8860b",
  success: "#16a34a",
  error: "#dc2626",
  blue: "#2563eb",
  purple: "#7c3aed",
  warning: "#d97706",
} as const

export const T = {
  pageTitle: { fontSize: 20, fontWeight: 700 as const, color: C.text, margin: 0 },
  subtitle: { fontSize: 13, color: C.muted, margin: "4px 0 0" },
  sectionHead: { fontSize: 11, fontWeight: 700 as const, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: C.muted, marginTop: 28, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${C.border}` },
  body: { fontSize: 13, color: C.text },
  small: { fontSize: 12, color: C.muted },
  micro: { fontSize: 10, fontWeight: 700 as const, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: C.muted },
  stat: { fontSize: 22, fontWeight: 700 as const, color: C.text },
  mono: { fontFamily: "monospace" as const, fontSize: 12 },
} as const

export const S = {
  pagePadding: "20px 24px 48px",
  pageMaxWidth: 960,
  sectionGap: 28,
  cardPadding: "16px 18px",
  cellPadding: "10px 14px",
  gap: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 4, md: 6, lg: 8, xl: 10 },
} as const

// ─── Status color maps ─────────────────────────────────────────────────────

export function badgeStyle(color: string) {
  // Expect `color` to be a constant accent (#hex). Theme-var values like
  // var(--vod-...) cannot be concatenated with "12" for opacity — use the
  // neutral badge variant below for those.
  return {
    display: "inline-block" as const,
    fontSize: 11,
    fontWeight: 600 as const,
    padding: "2px 8px",
    borderRadius: S.radius.sm,
    textTransform: "uppercase" as const,
    letterSpacing: "0.03em",
    background: color + "12",
    color: color,
    border: `1px solid ${color}30`,
  }
}

export const BADGE_VARIANTS = {
  success: badgeStyle(C.success),
  error: badgeStyle(C.error),
  warning: badgeStyle(C.warning),
  info: badgeStyle(C.blue),
  purple: badgeStyle(C.purple),
  // Neutral uses theme-vars directly — no opacity concat since CSS vars
  // can't be combined with hex alpha suffixes.
  neutral: {
    display: "inline-block" as const,
    fontSize: 11,
    fontWeight: 600 as const,
    padding: "2px 8px",
    borderRadius: S.radius.sm,
    textTransform: "uppercase" as const,
    letterSpacing: "0.03em",
    background: C.subtle,
    color: C.muted,
    border: `1px solid ${C.border}`,
  },
} as const

// ─── Formatters ────────────────────────────────────────────────────────────

export function fmtMoney(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(value)
}

export function fmtNum(value: number): string {
  return value.toLocaleString("de-DE")
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  return fmtDate(iso)
}
