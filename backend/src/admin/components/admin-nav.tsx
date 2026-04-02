import { useEffect } from "react"

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
  "/app/config":         { label: "Operations", href: "/app/operations" },
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
  }

  hide()
  let lastPath = window.location.pathname
  const observer = new MutationObserver(() => {
    hide()
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname
      setTimeout(injectBackNav, 50)
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
