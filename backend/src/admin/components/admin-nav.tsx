import { useEffect } from "react"

// ─── Route → parent hub mapping ──────────────────────────────────────────────

const PARENT_HUB: Record<string, { label: string; href: string }> = {
  "/app/media":          { label: "Catalog",    href: "/app/catalog" },
  "/app/entity-content": { label: "Catalog",    href: "/app/catalog" },
  "/app/musicians":      { label: "Catalog",    href: "/app/catalog" },
  "/app/newsletter":     { label: "Marketing",  href: "/app/marketing" },
  "/app/emails":         { label: "Marketing",  href: "/app/marketing" },
  "/app/customers":      { label: "Marketing",  href: "/app/marketing" },
  "/app/content":        { label: "Marketing",  href: "/app/marketing" },
  "/app/gallery":        { label: "Marketing",  href: "/app/marketing" },
  "/app/live-monitor":   { label: "Operations", href: "/app/operations" },
  "/app/system-health":  { label: "Operations", href: "/app/operations" },
  "/app/shipping":       { label: "Operations", href: "/app/operations" },
  "/app/sync":           { label: "Operations", href: "/app/operations" },
  "/app/test-runner":    { label: "Operations", href: "/app/operations" },
}

// ─── Back-nav bar injected at top of sub-pages ───────────────────────────────

const BACK_NAV_ID = "vod-back-nav"

function injectBackNav() {
  if (!window.location) return
  const path = window.location.pathname

  // Remove any existing back nav
  document.getElementById(BACK_NAV_ID)?.remove()

  const parent = PARENT_HUB[path]
  if (!parent) return

  // Find the main content area — the div after the sidebar
  const main = document.querySelector("main") || document.querySelector("[data-testid='main-content']")
  if (!main) return

  const bar = document.createElement("div")
  bar.id = BACK_NAV_ID
  bar.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 36px;
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

// ─── CSS: hide Medusa defaults + Extensions label ────────────────────────────

const NAV_CSS_ID = "vod-nav-css"
const NAV_HIDE_SCRIPT_ID = "vod-nav-script"

function injectNavCSS() {
  if (document.getElementById(NAV_CSS_ID)) return

  const style = document.createElement("style")
  style.id = NAV_CSS_ID
  style.textContent = `
    /* Hide Medusa built-in nav items */
    a[href="/app/orders"],
    a[href="/app/orders/drafts"],
    a[href="/app/products"],
    a[href="/app/products/gift-cards"],
    a[href="/app/inventory"],
    a[href="/app/reservations"],
    a[href="/app/customers"],
    a[href="/app/customer-groups"],
    a[href="/app/promotions"],
    a[href="/app/price-lists"] {
      display: none !important;
    }
    li:has(> a[href="/app/orders"]),
    li:has(> a[href="/app/products"]),
    li:has(> a[href="/app/inventory"]),
    li:has(> a[href="/app/customers"]),
    li:has(> a[href="/app/promotions"]),
    li:has(> a[href="/app/price-lists"]) {
      display: none !important;
    }
  `
  document.head.appendChild(style)
}

function startNavObserver() {
  if (document.getElementById(NAV_HIDE_SCRIPT_ID)) return
  const marker = document.createElement("span")
  marker.id = NAV_HIDE_SCRIPT_ID
  marker.style.display = "none"
  document.head.appendChild(marker)

  const hide = () => {
    // Hide "Extensions" collapsible button in sidebar
    document.querySelectorAll("nav button").forEach((btn) => {
      if (btn.textContent?.trim() === "Extensions") {
        ;(btn as HTMLElement).style.setProperty("display", "none", "important")
      }
    })
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

  // Run immediately and on every DOM mutation (for SPA navigation)
  hide()
  let lastPath = window.location.pathname
  const observer = new MutationObserver(() => {
    hide()
    // Detect SPA route change
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname
      setTimeout(injectBackNav, 50) // slight delay for React to render
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

// ─── Hook: call from every hub page ──────────────────────────────────────────

export function useAdminNav() {
  useEffect(() => {
    injectNavCSS()
    startNavObserver()
    // Small delay to let Medusa's sidebar render before we inject back nav
    setTimeout(injectBackNav, 100)
  }, [])
}
