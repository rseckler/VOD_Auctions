# VOD Auctions -- UI/UX Gap Analysis (Ist vs. Soll)

**Version:** 1.0
**Created:** 2026-04-02
**Scope:** Storefront + Admin -- measured against `docs/UI_UX_STYLE_GUIDE.md` v1.0
**Phase:** 2 of 3 (UX Audit)

---

## Methodology

Every finding references a concrete file and line number in the current codebase, the violated rule from the Style Guide (SG), and a recommended fix. Severity scale:

- **Critical** -- Blocks launch or causes accessibility/legal violations
- **High** -- Visible inconsistency or broken UX pattern affecting most users
- **Medium** -- Deviation from design system that affects perception of quality
- **Low** -- Minor polish item or edge-case inconsistency

---

## 1. Visual Inconsistency

### GAP-101 Hardcoded hex colors across 17 storefront component files

- **Area:** Multiple components
- **Current State:** 41 occurrences of hardcoded hex values across 17 files in `storefront/src/components/`. Key examples:
  - `BidHistoryTable.tsx:174,193,194` -- `#d4a54a` used directly instead of `text-primary`
  - `Header.tsx:92` -- `bg-[#d4a54a]` instead of `bg-primary`
  - `CatalogClient.tsx:335,380` -- `#b8860b` and `#1c1915` hardcoded in gradient/text classes
  - `HomeContent.tsx:28` -- `#1a1612` hardcoded background
  - `BlockItemsGrid.tsx` -- 5 hardcoded hex values
- **Violated Rule:** SG 12.1 S4 -- "All colors reference CSS custom properties -- no hardcoded hex in components"
- **Impact:** Theming impossible; inconsistency when token values are updated
- **Severity:** High
- **Effort:** Medium (grep + replace across 17 files)
- **Recommended Fix:** Replace all hardcoded hex with Tailwind token classes or CSS custom properties. For gradient endpoints like `#b8860b`, create a `--primary-dark` token.

### GAP-102 Container width inconsistency: max-w-7xl vs max-w-6xl

- **Area:** Catalog, Gallery, Auction detail, Loading pages
- **Current State:** `CatalogClient.tsx:293` uses `max-w-7xl` (80rem / 1280px+). Also: `gallery/page.tsx:334`, `loading.tsx:16`, `auctions/[slug]/loading.tsx:9,19`, `auctions/[slug]/[itemId]/loading.tsx:5`.
- **Violated Rule:** SG 2.1 -- "Every page-level content wrapper MUST use `max-w-6xl px-6 mx-auto`. No page content may exceed 1280px."
- **Impact:** Catalog and gallery are wider than all other pages; visual inconsistency when navigating
- **Severity:** High
- **Effort:** Small (change class name in ~6 files)
- **Recommended Fix:** Replace `max-w-7xl` with `max-w-6xl` in all page wrappers. If the catalog genuinely needs wider grid, use a documented exception with `xl:max-w-7xl`.

### GAP-103 Catalog h1 uses non-standard heading approach

- **Area:** `CatalogClient.tsx:295`
- **Current State:** `<h1 className="text-3xl md:text-4xl font-bold font-[family-name:var(--font-dm-serif)]">`. Uses `font-bold` (700) on DM Serif Display and an arbitrary `font-[family-name:...]` syntax instead of the defined `heading-1` class.
- **Violated Rule:** SG 3.5 -- "DM Serif Display headings MUST use weight 400"; SG 3.2 -- use `heading-1 font-serif` class
- **Impact:** Heading renders with wrong weight and inconsistent sizing compared to other pages
- **Severity:** Medium
- **Effort:** Small (one line change)
- **Recommended Fix:** Replace with `<h1 className="heading-1 font-serif">Catalog</h1>`

### GAP-104 About page uses max-w-4xl instead of max-w-6xl

- **Area:** `about/page.tsx:243,270,312,327,347,368,391,418,470`
- **Current State:** All sections use `max-w-4xl` (56rem = 896px)
- **Violated Rule:** SG 2.1 -- "max-w-6xl px-6 mx-auto" for all page content
- **Impact:** About page is noticeably narrower than all other pages
- **Severity:** Low
- **Effort:** Small (replace class in ~10 places)
- **Recommended Fix:** Increase to `max-w-6xl` and use inner content constraining (`max-w-3xl`) for prose paragraphs if readability requires it.

### GAP-105 Hero heading uses text-5xl/text-6xl instead of heading-hero

- **Area:** `page.tsx:73` (Home), `about/page.tsx:248`
- **Current State:** `font-serif text-5xl md:text-6xl leading-[1.1]` -- manual sizing instead of the defined `heading-hero` utility class
- **Violated Rule:** SG 3.2 -- "heading-hero" class exists at `clamp(2.5rem, 5vw, 3.75rem)`
- **Impact:** Hero text does not use fluid `clamp()` sizing; breaks on intermediate viewports
- **Severity:** Medium
- **Effort:** Small
- **Recommended Fix:** Replace with `className="heading-hero font-serif"`

---

## 2. Layout/Spacing Problems

### GAP-201 Home page hero missing pt-8 minimum below header

- **Area:** `page.tsx:62-64`
- **Current State:** Hero section uses `pt-10 pb-10 md:pt-14 md:pb-14` directly inside the hero section, but the `<main>` element has no top padding.
- **Violated Rule:** SG 2.1 Page Structure -- "`<main>` content MUST have `pt-8` minimum below the sticky header"
- **Impact:** On some viewports, content can appear too close to header
- **Severity:** Low
- **Effort:** Small
- **Recommended Fix:** Add `pt-8` to `<main>` or ensure each page's first section provides adequate top spacing consistently.

### GAP-202 Account overview grid uses sm:grid-cols-2 but never reaches 3 columns

- **Area:** `account/page.tsx:57`
- **Current State:** Grid is `grid-cols-1 sm:grid-cols-2` with 5 cards, creating an uneven layout (2+2+1)
- **Violated Rule:** SG 2.1 Grid System -- catalog/card grids should have defined column progression for all breakpoints
- **Impact:** Last card sits alone on its row, looks unbalanced
- **Severity:** Low
- **Effort:** Small
- **Recommended Fix:** Use `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` or `sm:grid-cols-3` for the 5 stat cards, or add a 6th card to fill the grid.

### GAP-203 Section spacing inconsistency on home page

- **Area:** `page.tsx:140,198`
- **Current State:** Gallery teaser uses `py-16`, catalog teaser uses `pt-4 pb-12`. Style guide specifies `gap-8` (32px) between major sections.
- **Violated Rule:** SG 2.1 Spacing Scale -- sections should use consistent `--space-2xl` or `--space-3xl`
- **Impact:** Uneven visual rhythm between sections
- **Severity:** Low
- **Effort:** Small
- **Recommended Fix:** Standardize all top-level sections to `py-16` or `py-12` consistently.

---

## 3. Typography Problems

### GAP-301 Settings page heading uses text-xl instead of heading-2

- **Area:** `account/settings/page.tsx:225`
- **Current State:** `<h2 className="text-xl font-semibold mb-6">Settings</h2>`
- **Violated Rule:** SG 3.2 -- Section titles should use `heading-2 font-serif`
- **Impact:** Settings heading looks different from other section headings across the platform
- **Severity:** Medium
- **Effort:** Small
- **Recommended Fix:** Replace with `<h2 className="heading-2 font-serif">Settings</h2>`

### GAP-302 Account overview heading uses text-xl instead of heading-2

- **Area:** `account/page.tsx:53`
- **Current State:** `<h2 className="text-xl font-semibold mb-6">`
- **Violated Rule:** SG 3.2 -- same as GAP-301
- **Impact:** Inconsistent with rest of platform
- **Severity:** Medium
- **Effort:** Small
- **Recommended Fix:** Use `heading-2 font-serif`

### GAP-303 Card section headers use inconsistent typography

- **Area:** `account/settings/page.tsx:231,325,362,401,468,508,529`
- **Current State:** `<h3 className="text-sm font-medium text-muted-foreground">` for card titles like "Profile Information", "Newsletter", etc.
- **Violated Rule:** SG 3.2 -- Card titles should use `heading-3` (18-20px, font-semibold, DM Sans)
- **Impact:** Card section headers at 14px are too small and use wrong weight
- **Severity:** Medium
- **Effort:** Small
- **Recommended Fix:** Replace with `heading-3` class for all card section headings

### GAP-304 About page h2 headings are text-3xl instead of heading-2

- **Area:** `about/page.tsx:278,319,332,353,374,398,424,471`
- **Current State:** `font-serif text-3xl` -- manual sizing
- **Violated Rule:** SG 3.2 -- Section titles should use `heading-2 font-serif`
- **Impact:** About page headings are larger than other pages' section headings
- **Severity:** Medium
- **Effort:** Small
- **Recommended Fix:** Replace with `heading-2 font-serif`

---

## 4. Mobile UX Problems

### GAP-401 No sticky bottom bid CTA on mobile auction item pages

- **Area:** `ItemBidSection.tsx`
- **Current State:** Bid form is positioned inline in the page content. On mobile, users must scroll past images and description to reach the bid button.
- **Violated Rule:** SG 9.2/9.3 -- "Primary CTAs MUST be in the bottom 60% of the viewport OR use a sticky bottom bar on mobile"
- **Impact:** Critical action (bidding) requires scrolling on mobile; missed bids during time pressure
- **Severity:** Critical
- **Effort:** Medium
- **Recommended Fix:** Add a sticky bottom bar on mobile (`fixed bottom-0 md:hidden`) showing current price and "Place Bid" button. Add `pb-24` to content above.

### GAP-402 Filter toggle buttons use raw `<button>` instead of `<Button>` component

- **Area:** `CatalogClient.tsx:331-350,376-396`
- **Current State:** "All Items" / "For Sale" toggle uses raw `<button>` with manual styling including hardcoded `#b8860b` and `#1c1915`
- **Violated Rule:** SG 12.1 S2 -- "All buttons use `<Button>` from `components/ui/button.tsx`"
- **Impact:** Inconsistent button styling; touch targets may not meet 44px minimum
- **Severity:** High
- **Effort:** Small
- **Recommended Fix:** Replace with `<Button>` component using variant props

### GAP-403 Mobile nav hamburger touch target borderline

- **Area:** `Header.tsx:124-130`
- **Current State:** Hamburger button has `p-2` (8px padding) on a 20px icon = 36px total
- **Violated Rule:** SG 9.1 -- "Buttons minimum 44x44px"
- **Impact:** Undersized touch target on mobile
- **Severity:** High
- **Effort:** Small
- **Recommended Fix:** Increase padding to `p-3` (44px total) or use `size-11` (44px)

### GAP-404 Header icon buttons (saved, cart) are below 44px touch target

- **Area:** `Header.tsx:84-109`
- **Current State:** Heart and ShoppingCart icons are bare `<Link>` elements with 20px icon and no explicit padding, resulting in ~20px touch area
- **Violated Rule:** SG 9.1 -- "Icon buttons minimum 44x44px"
- **Impact:** Very difficult to tap on mobile
- **Severity:** Critical
- **Effort:** Small
- **Recommended Fix:** Add `p-2` or wrap in a 44px container

---

## 5. Form Problems

### GAP-501 Footer newsletter uses raw `<input>` and `<button>` instead of components

- **Area:** `Footer.tsx:57-72`
- **Current State:** Raw `<input type="email">` with manual CSS classes and raw `<button>` for subscribe
- **Violated Rule:** SG 12.1 S2/S3 -- All inputs use `<Input>`, all buttons use `<Button>`; SG 5.1.9 -- "Newsletter signup in footer MUST use the standard `<Input>` component"
- **Impact:** Inconsistent styling, missing focus ring behavior, non-standard appearance
- **Severity:** High
- **Effort:** Small
- **Recommended Fix:** Replace with `<Input>` and `<Button>` components

### GAP-502 Checkout page does not use `inputMode` for numeric/monetary fields

- **Area:** `account/checkout/page.tsx` (postal code, phone)
- **Current State:** Standard `<Input>` without `inputMode` attributes
- **Violated Rule:** SG 6.4 -- Phone must use `inputMode="tel"`, postal codes `inputMode="numeric"`
- **Impact:** Mobile keyboard shows full QWERTY instead of number pad
- **Severity:** Medium
- **Effort:** Small
- **Recommended Fix:** Add `inputMode="tel"` to phone input, `inputMode="numeric"` to postal code

### GAP-503 Bid amount input uses `type="number"` 

- **Area:** `ItemBidSection.tsx` (bid input)
- **Current State:** The bid input appears to use a numeric type for currency amounts
- **Violated Rule:** SG 6.4 -- "`type='number'` MUST NOT be used for monetary amounts"
- **Impact:** Browser spinner buttons can accidentally change bid amounts
- **Severity:** High
- **Effort:** Small
- **Recommended Fix:** Use `type="text" inputMode="decimal"` with pattern validation

---

## 6. Navigation Problems

### GAP-601 Mobile nav has duplicate "Catalog" link (nav item + search)

- **Area:** `MobileNav.tsx:46-54,70-77`
- **Current State:** "Catalog" appears as a nav item at line 46, and "Search Catalog" at line 70 also links to `/catalog`
- **Violated Rule:** SG 7.1 -- Navigation should be clean and non-redundant
- **Impact:** Confusing duplicate; takes up valuable mobile screen space
- **Severity:** Low
- **Effort:** Small
- **Recommended Fix:** Replace "Search Catalog" with actual search functionality (open SearchAutocomplete) or remove it

### GAP-602 Browser-native `window.confirm()` for logout

- **Area:** `MobileNav.tsx:148`, `HeaderAuth.tsx:81`
- **Current State:** `window.confirm("Are you sure you want to log out?")` 
- **Violated Rule:** SG 12.2 F13 -- "Alert/confirm dialogs (browser native) are forbidden. Use `<Dialog>` or `<Modal>` components"
- **Impact:** Inconsistent UX; native dialog breaks the visual language
- **Severity:** Medium
- **Effort:** Medium (need to implement a small confirmation dialog)
- **Recommended Fix:** Replace with shadcn/ui `<AlertDialog>` component

---

## 7. Table/Data View Problems

### GAP-701 BidHistoryTable uses hardcoded hex throughout

- **Area:** `BidHistoryTable.tsx` -- 7 hardcoded hex occurrences
- **Current State:** `text-[#d4a54a]` (line 174, 193), `bg-[#d4a54a]/[0.06]` (line 238), `ring-[#d4a54a]/40` (line 243)
- **Violated Rule:** SG 12.1 S4 -- No hardcoded hex in components
- **Impact:** Would not respond to theme changes; inconsistent token usage
- **Severity:** Medium
- **Effort:** Small
- **Recommended Fix:** Replace `#d4a54a` with `primary` token classes

### GAP-702 Auction Blocks admin table uses mixed Medusa UI and custom tokens

- **Area:** `auction-blocks/page.tsx:4,80-100`
- **Current State:** Imports both `Badge, Button, Text` from `@medusajs/ui` AND custom `C` tokens. Table styling mixes Medusa components with inline CSS using custom tokens.
- **Violated Rule:** SG 12.2 A3 -- "All colors reference `C.*`"
- **Impact:** Inconsistent appearance; Medusa UI Badge renders differently from custom Badge
- **Severity:** Medium
- **Effort:** Large (would need to replace Medusa UI components with custom ones across the page)
- **Recommended Fix:** Use the custom admin components (`Badge` from `admin-ui.tsx`, `Btn` instead of Medusa `Button`) for consistency. Keep Medusa imports only for layout shell.

### GAP-703 Transactions page uses Medusa UI Badge/Button/Input/Select

- **Area:** `transactions/page.tsx:8-14`
- **Current State:** Imports `Badge, Button, Text, Input, Label, Select` from `@medusajs/ui`
- **Violated Rule:** SG 5.2 -- Admin components should use custom token-based components
- **Impact:** Medusa UI components have different styling than the custom design system
- **Severity:** Medium
- **Effort:** Large
- **Recommended Fix:** Migrate to custom `Btn`, `inputStyle`, and `Badge` from admin component library

---

## 8. Accessibility Problems

### GAP-801 No `aria-live` regions for real-time bid updates

- **Area:** `ItemBidSection.tsx`, `BidHistoryTable.tsx`
- **Current State:** Zero `aria-live` attributes anywhere in the storefront codebase
- **Violated Rule:** SG 10.4 -- "Status changes (bid placed, outbid, timer update) MUST use `aria-live='polite'` regions"
- **Impact:** Screen reader users receive no notification when bid status changes or timers update
- **Severity:** Critical
- **Effort:** Small
- **Recommended Fix:** Add `aria-live="polite"` to: current price display, bid status indicator, countdown timer, outbid notification

### GAP-802 Decorative images missing aria-hidden

- **Area:** `page.tsx:109` (vinyl record graphic), `HomeContent.tsx:37` (cover images with `alt=""`)
- **Current State:** Decorative images have `alt=""` but no `aria-hidden="true"`
- **Violated Rule:** SG 10.4 -- "Decorative images MUST use `alt=''` with `aria-hidden='true'`"
- **Impact:** Screen readers may still announce the image element
- **Severity:** Low
- **Effort:** Small
- **Recommended Fix:** Add `aria-hidden="true"` alongside `alt=""`

### GAP-803 About page uses dangerouslySetInnerHTML without semantic structure

- **Area:** `about/page.tsx:288,320,399,427`
- **Current State:** `dangerouslySetInnerHTML={{ __html: founderBody }}` renders HTML blobs without `role` or landmark attributes
- **Violated Rule:** SG 10.5 -- "MUST NOT use `<div>` where a semantic element exists"
- **Impact:** Long-form content has no semantic structure for assistive technology
- **Severity:** Low
- **Effort:** Medium
- **Recommended Fix:** Wrap in `<article>` elements; ensure injected HTML uses semantic elements

### GAP-804 Skip-to-content link missing

- **Area:** Global layout
- **Current State:** No skip-to-content link exists in the storefront
- **Violated Rule:** SG 10.3 -- "Skip-to-content link: MUST be the first focusable element, visible on focus"
- **Impact:** Keyboard users must tab through entire header/nav on every page load
- **Severity:** High
- **Effort:** Small
- **Recommended Fix:** Add `<a href="#main-content" className="sr-only focus:not-sr-only ...">Skip to content</a>` as first child of `<body>`, and `id="main-content"` on `<main>`.

---

## 9. Inconsistent States/Feedback Patterns

### GAP-901 No skeleton/loading state for Account Overview cards

- **Area:** `account/page.tsx:67,79,91,105,119`
- **Current State:** Uses `<Skeleton className="h-9 w-12 inline-block" />` inside the number display, but the entire card renders immediately. On slow connections, cards appear with "0" briefly before real data loads.
- **Violated Rule:** SG 5.1.7 -- "Skeleton shapes MUST approximate the shape of the loaded content"
- **Impact:** Flash of "0" values before real data loads; not true skeleton loading
- **Severity:** Low
- **Effort:** Small
- **Recommended Fix:** Show full card skeletons until `loaded` is true

### GAP-902 Settings page toggle is custom-built instead of using a component

- **Area:** `account/settings/page.tsx:336-349,376-390`
- **Current State:** Hand-coded toggle switch with inline conditional classes. Duplicated twice (newsletter + notifications).
- **Violated Rule:** SG 6.7 -- "For single boolean toggles, prefer a Toggle component (admin) or a Switch (storefront)"
- **Impact:** Not reusable; inconsistent if another toggle is needed elsewhere
- **Severity:** Low
- **Effort:** Medium
- **Recommended Fix:** Extract to a shared `<Switch>` component or use shadcn/ui's Switch component

### GAP-903 Error handling silently fails in multiple components

- **Area:** `account/settings/page.tsx:85,115` (newsletter toggle), `account/page.tsx:48`
- **Current State:** `catch { /* silently fail */ }` and `catch(() => setLoaded(true))` -- errors are swallowed
- **Violated Rule:** SG 1.6 -- "Network errors: inline error message with retry option. Never a blank screen."
- **Impact:** Users see no feedback when API calls fail
- **Severity:** High
- **Effort:** Medium
- **Recommended Fix:** Add error states and retry UI for each data-fetching component

### GAP-904 Admin nav uses MutationObserver with body-wide subtree observation

- **Area:** `admin-nav.tsx:229-243`
- **Current State:** `observer.observe(document.body, { childList: true, subtree: true })` fires on every DOM mutation across the entire body
- **Violated Rule:** SG 12.3 Red Flag -- MutationObserver callbacks must be idempotent (from memory file `feedback_mutation_observer.md`)
- **Impact:** Performance concern; callback runs `hide()` on every single DOM change
- **Severity:** Medium
- **Effort:** Medium
- **Recommended Fix:** Narrow the observer scope to the nav element only, or use a debounced callback

---

## What's Already Good

These patterns are well-implemented and should be preserved:

### Design System Foundation
- **CSS custom properties in globals.css** -- comprehensive token system with spacing, shadows, transitions, and typography scales (lines 88-114). Well-structured and complete.
- **Admin token system** -- `admin-tokens.ts` with `C`, `T`, `S` exports is clean, type-safe, and consistently imported by all admin pages.
- **Typography utility classes** -- `.heading-hero`, `.heading-1`, `.heading-2`, `.heading-3` in globals.css are properly defined with clamp() for fluid sizing.

### Component Architecture
- **Admin layout components** -- `PageShell`, `PageHeader`, `SectionHeader`, `StatsGrid`, `Tabs` are all used consistently across admin pages. Every admin page inspected uses `PageShell` and `PageHeader`.
- **Admin sub-page navigation** -- `useAdminNav()` hook and back-nav injection work correctly. CRM, Config, Waitlist correctly do NOT have `defineRouteConfig` (previously identified violations have been fixed).
- **shadcn/ui adoption** -- Storefront uses `Button`, `Card`, `Input`, `Badge`, `Select`, `Sheet`, `Dialog` components from the shared library.

### Accessibility Baseline
- **Focus indicators** -- `globals.css:153-158` defines gold focus-visible outlines on all interactive elements.
- **Reduced motion** -- `globals.css:186-192` properly disables all animations when `prefers-reduced-motion: reduce` is set.
- **Custom scrollbar** -- Only applied on precise pointer devices (`@media (pointer: fine)`).
- **Number input spinner removal** -- Globally handled in globals.css.

### UX Patterns
- **Auction block cards** -- `HomeContent.tsx` FeaturedBlock component is well-structured with proper status badges, cover images, lot counts, and time displays.
- **Header structure** -- Sticky, backdrop-blurred, correct height (h-16), proper logo with hover animation, responsive mobile/desktop split.
- **Footer structure** -- Proper border-t separator, newsletter signup, legal links, payment badges, copyright line. Matches the style guide's footer spec well.
- **Search** -- Cmd+K shortcut, SearchAutocomplete component, debounced search in catalog.
- **Bid history** -- Real-time updates, flash animations for new bids, bidder anonymization, expand/collapse.
- **Catalog** -- URL sync, server-side rendering with hydration, filter persistence, pagination.

### Admin Excellence
- **Dashboard** -- Uses `PageShell`, `PageHeader`, `StatsGrid`, `SectionHeader` consistently. Platform mode badge, launch readiness checks, activity feed.
- **Config page** -- Uses `Tabs`, `ConfigRow`, `Toggle`, `Modal`, `Alert` from the shared library. Clean token usage.
- **Badge system** -- `badgeStyle()` function generates consistent three-part badge styles (bg + text + border) from a single color input.
