import { useEffect } from "react"

// ─── Sidebar Shortcuts (rc52+, 2026-04-28) ───────────────────────────────────
// Eigene "Shortcuts"-Sektion unter Extensions, für die Routen die Frank gerade
// am häufigsten klickt. Hardcoded TS-Array — erweitern = Eintrag dazu, kein
// Build-System nötig. Items werden als Sibling NACH dem Extensions-Container
// injiziert und stylen sich so, dass sie wie native Medusa-Nav-Items aussehen
// (Größe / Padding / Hover via inline-styles).
//
// Active-State: wenn `pathname.startsWith(href)` → Gold-Akzent (b8860b),
// damit Frank auch dann sieht wo er ist, wenn das Ziel parallel im Hauptmenü
// existiert (z.B. Catalog).

const SHORTCUTS_ID = "vod-shortcuts"

// Heroicons (24/outline) — inline-SVG um keine zusätzliche Dep zu ziehen.
// stroke="currentColor", fill="none" → erbt vom Parent <a>.
const ICON_INVENTORY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>`

const ICON_CATALOG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/></svg>`

const SHORTCUTS: Array<{ href: string; label: string; icon: string }> = [
  { href: "/app/erp/inventory", label: "Inventory", icon: ICON_INVENTORY },
  { href: "/app/media", label: "Catalog", icon: ICON_CATALOG },
]

function injectShortcuts() {
  if (!window.location) return

  const path = window.location.pathname

  // Anker: ein bekannter Extensions-Item-Link. POS ist das letzte Item in der
  // Extensions-Liste (vgl. Sidebar-Reihenfolge). Wir gehen vom Link zur
  // Wrapper-Komponente (`<li>`, `<div>`, was Medusa gerade nutzt) und appenden
  // unsere Shortcuts als Sibling in den selben Container.
  //
  // Fallback-Reihenfolge: pos → erp → dashboard. Falls Medusa die Routen-
  // Reihenfolge ändert, finden wir trotzdem einen Anker.
  const ANCHOR_HREFS = ["/app/pos", "/app/erp", "/app/dashboard"]
  let anchorLink: HTMLElement | null = null
  for (const href of ANCHOR_HREFS) {
    anchorLink = document.querySelector<HTMLElement>(`a[href="${href}"]`)
    if (anchorLink) break
  }
  if (!anchorLink) return

  // Wrapper = nächste umschließende `<li>`, sonst direkter Parent (für DOM-
  // Strukturen ohne `<ul><li>`-Schachtelung). itemsContainer ist der Container
  // der alle Nav-Items hält — genau dort hängen wir hinten an.
  const anchorWrapper =
    (anchorLink.closest("li") as HTMLElement | null) || anchorLink.parentElement
  if (!anchorWrapper || !anchorWrapper.parentElement) return

  const itemsContainer = anchorWrapper.parentElement
  const existing = document.getElementById(SHORTCUTS_ID)

  // Idempotenz: state-key aus Path + Shortcuts-Hash. Path bestimmt Active-Highlight,
  // Hash invalidiert beim Code-Change (HMR / Deploy).
  const stateKey = `${path}::${SHORTCUTS.map((s) => s.href).join("|")}`
  if (existing && existing.dataset.state === stateKey && existing.parentElement === itemsContainer) {
    return
  }
  existing?.remove()

  // Wrapper-Tag matcht den Anchor-Wrapper (li bleibt li, div bleibt div) —
  // dadurch greifen Medusa's Layout-Styles auch für unsere Sektion.
  const wrapper = document.createElement(anchorWrapper.tagName.toLowerCase())
  wrapper.id = SHORTCUTS_ID
  wrapper.dataset.state = stateKey
  wrapper.style.cssText = `
    list-style: none;
    margin: 8px 0 0;
    padding: 8px 12px 0;
    border-top: 1px dashed var(--vod-border, #e7e5e4);
  `

  const itemsHtml = SHORTCUTS.map((s) => {
    const isActive = path === s.href || path.startsWith(s.href + "/")
    const activeBg = isActive ? "rgba(184, 134, 11, 0.10)" : "transparent"
    const activeColor = isActive ? "#b8860b" : "var(--vod-text, #1a1714)"
    const iconColor = isActive ? "#b8860b" : "var(--vod-muted, #78716c)"
    return `
      <a href="${s.href}"
         data-shortcut="${s.href}"
         style="
           display: flex;
           align-items: center;
           gap: 10px;
           padding: 7px 8px;
           margin: 2px 0;
           border-radius: 6px;
           color: ${activeColor};
           background: ${activeBg};
           text-decoration: none;
           font-size: 13px;
           font-weight: ${isActive ? "600" : "500"};
           transition: background 80ms ease;
         "
         onmouseover="if(!this.dataset.active)this.style.background='var(--vod-hover, #f5f4f3)'"
         onmouseout="if(!this.dataset.active)this.style.background='transparent'"
         ${isActive ? 'data-active="1"' : ""}>
        <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; color: ${iconColor}; flex-shrink: 0;">${s.icon}</span>
        <span>${s.label}</span>
      </a>
    `
  }).join("")

  wrapper.innerHTML = `
    <div style="
      font-size: 11px;
      font-weight: 600;
      color: var(--vod-muted, #78716c);
      padding: 4px 8px 6px;
      letter-spacing: 0.02em;
    ">Shortcuts</div>
    <div style="display: flex; flex-direction: column;">${itemsHtml}</div>
  `

  // Append nach dem Anchor-Wrapper. Wenn anchorWrapper das letzte Item ist
  // (POS), landen wir direkt am Ende der Items-Liste, oberhalb von Settings
  // (das in einem separaten Footer-Container sitzt).
  itemsContainer.insertBefore(wrapper, anchorWrapper.nextSibling)
}

// ─── Route → parent hub mapping ──────────────────────────────────────────────

const PARENT_HUB: Record<string, { label: string; href: string }> = {
  "/app/media":          { label: "Catalog",    href: "/app/catalog" },
  "/app/entity-content": { label: "Catalog",    href: "/app/catalog" },
  "/app/musicians":      { label: "Catalog",    href: "/app/catalog" },
  "/app/newsletter":     { label: "Marketing",  href: "/app/marketing" },
  "/app/emails":         { label: "Marketing",  href: "/app/marketing" },
  "/app/crm":            { label: "Marketing",  href: "/app/marketing" },
  "/app/content":        { label: "Marketing",  href: "/app/marketing" },
  "/app/gallery":        { label: "Marketing",  href: "/app/marketing" },
  "/app/live-monitor":   { label: "Operations", href: "/app/operations" },
  "/app/system-health":  { label: "Operations", href: "/app/operations" },
  "/app/shipping":       { label: "Operations", href: "/app/operations" },
  "/app/sync":           { label: "Operations", href: "/app/operations" },
  "/app/test-runner":    { label: "Operations", href: "/app/operations" },
  "/app/config":           { label: "Operations", href: "/app/operations" },
  "/app/discogs-import":   { label: "Operations", href: "/app/operations" },
  "/app/erp/locations":  { label: "ERP",        href: "/app/erp" },
  "/app/erp/inventory":  { label: "ERP",        href: "/app/erp" },
  "/app/erp/invoicing":  { label: "ERP",        href: "/app/erp" },
  "/app/erp/shipping":   { label: "ERP",        href: "/app/erp" },
  "/app/erp/commission": { label: "ERP",        href: "/app/erp" },
  "/app/erp/tax":        { label: "ERP",        href: "/app/erp" },
  "/app/waitlist":       { label: "Marketing",  href: "/app/marketing" },
}

// ─── Back-nav bar injected at top of sub-pages ───────────────────────────────

const BACK_NAV_ID = "vod-back-nav"

function injectBackNav() {
  if (!window.location) return
  const path = window.location.pathname
  const parent = PARENT_HUB[path]

  const existing = document.getElementById(BACK_NAV_ID)

  // If no parent hub for this path, remove any existing nav bar and stop
  if (!parent) {
    existing?.remove()
    return
  }

  // Idempotency check: if correct nav bar already exists, do nothing (prevents DOM mutation loop)
  if (existing && existing.dataset.href === parent.href) return

  existing?.remove()

  const main = document.querySelector("main") || document.querySelector("[data-testid='main-content']")
  if (!main) return

  const bar = document.createElement("div")
  bar.id = BACK_NAV_ID
  bar.dataset.href = parent.href
  bar.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px max(12px, min(36px, 4vw));
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    font-size: 12px;
    color: #6b7280;
    font-family: var(--font-sans, system-ui, sans-serif);
    flex-shrink: 0;
  `
  bar.innerHTML = `
    <a href="${parent.href}"
       style="color: #6366f1; text-decoration: none; font-weight: 500; display: flex; align-items: center; gap: 4px;"
       onmouseover="this.style.textDecoration='underline'"
       onmouseout="this.style.textDecoration='none'">
      ← ${parent.label}
    </a>
    <span style="color: #d1d5db;">/</span>
    <span style="color: #374151; font-weight: 500;">${document.title.split("·")[0].trim() || path.replace("/app/", "")}</span>
  `
  main.prepend(bar)
}

// ─── CSS: hide Medusa defaults + keep Extensions content visible ─────────────

const NAV_CSS_ID = "vod-nav-css"
const NAV_HIDE_SCRIPT_ID = "vod-nav-script"

function injectNavCSS() {
  if (document.getElementById(NAV_CSS_ID)) return

  const style = document.createElement("style")
  style.id = NAV_CSS_ID
  style.textContent = `
    /* Prevent horizontal page scroll on mobile */
    html, body { overflow-x: hidden !important; }

    /* Medusa's main content wrapper uses overflow-auto (both axes).
       This allows independent horizontal scrolling even when body is locked.
       Target it precisely: it's the only element that has both h-screen and overflow-auto. */
    .h-screen.overflow-auto { overflow-x: hidden !important; overscroll-behavior-x: none !important; }

    /* Medusa's <main> uses items-center in flex-col, which horizontally centers
       children. On narrow viewports this clips content on both sides.
       Force children to fill available width instead. */
    main { align-items: flex-start !important; overflow-x: hidden !important; }
    /* Gutter (direct child of main): force full width, prevent flex min-width expansion */
    main > * { max-width: 100% !important; width: 100% !important; min-width: 0 !important; }
    /* Page root divs (children of Gutter): min-width:auto by default lets flex items
       expand wider than the Gutter if content (e.g. a table) has a wide min-content.
       Force min-width:0 so they stay within the Gutter, clip overflow. */
    main > * > * { min-width: 0 !important; overflow-x: hidden !important; box-sizing: border-box !important; }

    /* Hide Medusa built-in nav items */
    a[href="/app/orders"],
    a[href="/app/orders"],
    a[href="/app/orders/drafts"],
    a[href="/app/products"],
    a[href="/app/products/gift-cards"],
    a[href="/app/inventory"],
    a[href="/app/reservations"],
    a[href="/app/customer-groups"],
    a[href="/app/promotions"],
    a[href="/app/price-lists"] {
      display: none !important;
    }
    li:has(> a[href="/app/orders"]),
    li:has(> a[href="/app/products"]),
    li:has(> a[href="/app/inventory"]),
    li:has(> a[href="/app/reservations"]),
    li:has(> a[href="/app/customer-groups"]),
    li:has(> a[href="/app/promotions"]),
    li:has(> a[href="/app/price-lists"]) {
      display: none !important;
    }

    /* Hide the Extensions section header (trigger button) via CSS —
       catches both the expand (+) and collapse (—) variants */
    nav [data-radix-collapsible-trigger] {
      display: none !important;
    }

    /* Override Radix UI collapsible animation so Extensions content stays visible
       after we hide the trigger button. Without this, content stays at height:0. */
    nav [data-radix-collapsible-content] {
      overflow: visible !important;
      height: auto !important;
      min-height: 0 !important;
      animation: none !important;
      display: block !important;
    }
    /* Also target the data-state="closed" variant Radix sets */
    nav [data-radix-collapsible-content][data-state="closed"] {
      overflow: visible !important;
      height: auto !important;
      display: block !important;
    }
  `
  document.head.appendChild(style)
}

// ─── Click to expand Extensions, then hide its trigger ───────────────────────

// ─── Mobile scroll-container fix ─────────────────────────────────────────────
// CSS alone is unreliable here: Medusa's inner scroll containers use
// overflow-auto which can scroll horizontally even with body overflow-x:hidden.
// Apply inline styles directly so there's no specificity or timing race.
function fixMobileScrollContainers() {
  if (window.innerWidth > 1024) return

  const mainEl = document.querySelector<HTMLElement>("main")
  if (!mainEl) return

  // Fix items-center centering: anchor content to left on mobile
  mainEl.style.setProperty("align-items", "flex-start", "important")
  mainEl.style.setProperty("overflow-x", "hidden", "important")
  mainEl.scrollLeft = 0

  // Walk ALL ancestors up to body — set overflow-x:hidden and reset scrollLeft on each.
  // This catches any scroll container regardless of Medusa DOM depth changes.
  let el: HTMLElement | null = mainEl.parentElement
  while (el && el.tagName !== "BODY") {
    el.style.setProperty("overflow-x", "hidden", "important")
    el.style.setProperty("overscroll-behavior-x", "none", "important")
    el.scrollLeft = 0
    el = el.parentElement
  }
}

function expandAndHideExtensions() {
  const buttons = document.querySelectorAll("nav button")
  buttons.forEach((btn) => {
    const text = btn.textContent?.trim()
    if (!text?.includes("Extensions")) return

    const el = btn as HTMLElement

    // Step 1: expand if not already open
    if (el.getAttribute("aria-expanded") !== "true") {
      el.click()
    }

    // Step 2: hide the trigger after expansion — use rAF to let React/Radix finish
    requestAnimationFrame(() => {
      el.style.setProperty("display", "none", "important")
    })
  })
}

function startNavObserver() {
  if (document.getElementById(NAV_HIDE_SCRIPT_ID)) return
  const marker = document.createElement("span")
  marker.id = NAV_HIDE_SCRIPT_ID
  marker.style.display = "none"
  document.head.appendChild(marker)

  const hide = () => {
    fixMobileScrollContainers()
    expandAndHideExtensions()

    // Remove any remaining empty top-level <li> separators
    document.querySelectorAll("nav > ul > li").forEach((li) => {
      const links = li.querySelectorAll("a[href]")
      const visible = Array.from(links).some(
        (a) => (a as HTMLElement).style.display !== "none" && !(a as HTMLElement).closest("[style*='display: none']")
      )
      if (links.length > 0 && !visible) {
        ;(li as HTMLElement).style.setProperty("display", "none", "important")
      }
    })

    // Inject back nav for sub-pages
    injectBackNav()

    // Inject Shortcuts section under Extensions
    injectShortcuts()
  }

  hide()
  let lastPath = window.location.pathname
  const observer = new MutationObserver(() => {
    hide()
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname
      setTimeout(injectBackNav, 50)
      setTimeout(injectShortcuts, 50)
      // Reset horizontal scroll on navigation so new page always starts at left edge
      const mainEl = document.querySelector<HTMLElement>("main")
      if (mainEl) {
        mainEl.scrollLeft = 0
        const wrapper = mainEl.parentElement
        if (wrapper) wrapper.scrollLeft = 0
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

// ─── Module-level init: inject CSS immediately on import ─────────────────────
// This runs before React renders, so the style is ready before any paint.

if (typeof window !== "undefined") {
  injectNavCSS()
}

// ─── Hook: call from every hub page ──────────────────────────────────────────

export function useAdminNav() {
  useEffect(() => {
    injectNavCSS()
    startNavObserver()
    setTimeout(injectBackNav, 100)
  }, [])
}
