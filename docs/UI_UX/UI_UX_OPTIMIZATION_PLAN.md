# VOD Auctions -- UI/UX Optimization Plan

**Version:** 1.0
**Created:** 2026-04-02
**Based On:** `docs/UI_UX_GAP_ANALYSIS.md` v1.0 + `docs/UI_UX_STYLE_GUIDE.md` v1.0
**Phase:** 3 of 3 (UX Audit)

---

## 1. Executive Summary

### Biggest Problems

1. **Missing `aria-live` regions** (GAP-801): The entire real-time bidding experience -- current price, bid status, countdown timers -- is invisible to screen readers. This is an accessibility violation and a potential legal risk under EU accessibility regulations (EAA, effective June 2025).

2. **Touch targets below 44px** (GAP-403, GAP-404): Header icon buttons (cart, saved, hamburger) are 20-36px tap areas. On the core mobile bidding flow, this directly impacts conversion.

3. **No sticky mobile bid CTA** (GAP-401): The primary revenue-generating action (placing a bid) requires scrolling on mobile. This is the single highest-leverage UX fix.

4. **41 hardcoded hex values** in storefront components (GAP-101): Makes the design system unreliable. Any theme adjustment requires touching 17 files instead of one.

5. **Container width split** (GAP-102): Catalog uses `max-w-7xl` while all other pages use `max-w-6xl`, creating a jarring width jump during navigation.

### Highest Leverage Fixes

| Fix | Impact | Effort | GAP IDs |
|-----|--------|--------|---------|
| Sticky mobile bid bar | Revenue | Medium | GAP-401 |
| Touch target enlargement | Conversion | Small | GAP-403, GAP-404 |
| Skip-to-content + aria-live | Legal compliance | Small | GAP-801, GAP-804 |
| Hardcoded hex cleanup | Maintainability | Medium | GAP-101, GAP-701 |

### Key Risks

- **Scope creep**: The admin Medusa UI migration (GAP-702, GAP-703) is a large effort. It should NOT block storefront improvements.
- **Regression**: Changing container widths (GAP-102) and heading classes will affect visual layout. Requires visual QA on desktop + mobile for all affected pages.
- **Bidding UX**: The sticky mobile bid bar (GAP-401) needs careful z-index management to not conflict with the header (z-50) and any potential modals.

---

## 2. Quick Wins (< 1 hour each, high impact)

### QW-1: Touch target fix for header icons

**Goal:** All header interactive elements meet 44px minimum touch target
**Affected Areas:** `storefront/src/components/layout/Header.tsx:84-130`
**Benefit:** Improved mobile tap accuracy for cart, saved, hamburger -- used on every page
**Priority:** P0
**Effort:** 15 min
**Dependencies:** None

**Changes:**
- Header saved/cart links (lines 84-109): Add `p-2` class to both `<Link>` elements
- Hamburger button (line 124): Change `p-2` to `p-3`
- Mobile account icon (line 117): Change `p-2` to `p-3`

### QW-2: Skip-to-content link

**Goal:** Keyboard-accessible skip navigation link
**Affected Areas:** `storefront/src/app/layout.tsx`, all `<main>` elements
**Benefit:** WCAG 2.1 AA compliance; keyboard users skip repeated header on every page
**Priority:** P0
**Effort:** 15 min
**Dependencies:** None

**Changes:**
- Add `<a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md">Skip to content</a>` as first child of `<body>` in layout.tsx
- Add `id="main-content"` to `<main>` elements

### QW-3: aria-live regions for bid updates

**Goal:** Screen reader announcement for price changes, bid status, and timers
**Affected Areas:** `storefront/src/components/ItemBidSection.tsx`
**Benefit:** Accessibility compliance for the core bidding interaction
**Priority:** P0
**Effort:** 20 min
**Dependencies:** None

**Changes:**
- Add `aria-live="polite"` to the current price display wrapper
- Add `aria-live="assertive"` to outbid notification area
- Add `role="timer" aria-live="off" aria-atomic="true"` to countdown display (announcing every second is too noisy; let it be read on demand)

### QW-4: Container width standardization

**Goal:** All pages use consistent `max-w-6xl` container
**Affected Areas:** `CatalogClient.tsx:293`, `gallery/page.tsx:334`, `loading.tsx:16`, `auctions/[slug]/loading.tsx:9,19`, `auctions/[slug]/[itemId]/loading.tsx:5`
**Benefit:** No width jump when navigating between pages
**Priority:** P1
**Effort:** 10 min
**Dependencies:** None

**Changes:** Replace `max-w-7xl` with `max-w-6xl` in all 6 file locations.

### QW-5: Hero heading class standardization

**Goal:** Home and About hero use `heading-hero` utility class
**Affected Areas:** `page.tsx:73`, `about/page.tsx:248`
**Benefit:** Fluid clamp() sizing; consistent hero appearance
**Priority:** P1
**Effort:** 5 min
**Dependencies:** None

**Changes:** Replace `font-serif text-5xl md:text-6xl leading-[1.1]` with `heading-hero font-serif`

### QW-6: Catalog h1 fix

**Goal:** Correct heading weight and class
**Affected Areas:** `CatalogClient.tsx:295`
**Benefit:** DM Serif Display rendered at correct weight; consistent with other pages
**Priority:** P1
**Effort:** 5 min
**Dependencies:** None

**Changes:** Replace `text-3xl md:text-4xl font-bold font-[family-name:var(--font-dm-serif)]` with `heading-1 font-serif`

### QW-7: Decorative image aria-hidden

**Goal:** Decorative images hidden from assistive technology
**Affected Areas:** `page.tsx:109`, `HomeContent.tsx:37`
**Benefit:** Cleaner screen reader experience
**Priority:** P2
**Effort:** 5 min
**Dependencies:** None

**Changes:** Add `aria-hidden="true"` to all `<Image>` and `<div>` elements that have `alt=""`

---

## 3. Medium-Term Improvements (1-4 hours each)

### MT-1: Sticky mobile bid bar

**Goal:** Primary bid CTA always accessible on mobile without scrolling
**Affected Areas:** `storefront/src/components/ItemBidSection.tsx`, auction item page layout
**Benefit:** Direct conversion improvement for mobile bidders
**Priority:** P0
**Effort:** 3 hours
**Dependencies:** QW-1 (touch targets)

**Implementation:**
1. Create `<MobileBidBar>` component: `fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border p-4 z-40 md:hidden`
2. Shows: current price (left), "Place Bid" button (right, size="lg" for 44px+ target)
3. On tap, smooth-scrolls to full bid form OR opens a bottom sheet with bid input
4. Add `pb-24` to main content on mobile to prevent content hiding
5. Hide when auction is not active

### MT-2: Hardcoded hex cleanup (storefront components)

**Goal:** Eliminate all 41 hardcoded hex values from storefront components
**Affected Areas:** 17 files in `storefront/src/components/`
**Benefit:** Theming works from tokens; single source of truth
**Priority:** P1
**Effort:** 2 hours
**Dependencies:** None

**Implementation:**
1. Create new CSS tokens where needed:
   - `--primary-dark: #b8860b` (gradient endpoint)
   - `--card-hover: #1a1612` (card hover background)
2. Systematic grep-and-replace:
   - `#d4a54a` --> `text-primary` / `bg-primary` / `border-primary`
   - `#1c1915` --> `text-primary-foreground` / `bg-background`
   - `#b8860b` --> `to-primary-dark` (after adding token)
   - `#1a1612` --> `bg-card-hover` (after adding token)
   - `rgba(232,224,212,0.*)` --> `border-border` or opacity variants of foreground
3. Verify each replacement renders identically

### MT-3: Replace raw `<button>` elements with `<Button>` component

**Goal:** All interactive buttons use the design system component
**Affected Areas:** `CatalogClient.tsx:331-396` (toggle), `Footer.tsx:65-71` (subscribe), `BidHistoryTable.tsx:291-305` (expand), various small instances
**Benefit:** Consistent styling, focus states, and touch targets
**Priority:** P1
**Effort:** 2 hours
**Dependencies:** None

**Implementation:**
1. Footer newsletter: Replace raw `<input>` with `<Input>`, raw `<button>` with `<Button size="sm">`
2. Catalog for-sale toggle: Convert to `<Button variant="default">` / `<Button variant="outline">` pair
3. BidHistoryTable expand: Replace with `<Button variant="ghost" size="sm">`
4. Any other raw `<button>` with class styling

### MT-4: Replace window.confirm with AlertDialog

**Goal:** Native browser dialogs replaced with design-system dialogs
**Affected Areas:** `HeaderAuth.tsx:81`, `MobileNav.tsx:148`
**Benefit:** Consistent UX; branded confirmation dialogs
**Priority:** P2
**Effort:** 1.5 hours
**Dependencies:** None

**Implementation:**
1. Create a reusable `<ConfirmDialog>` wrapper around shadcn/ui `<AlertDialog>`
2. Replace `window.confirm("Are you sure...")` in both files
3. Destructive action button uses `variant="destructive"`, cancel is `variant="outline"`

### MT-5: Account page heading and section header standardization

**Goal:** Consistent heading hierarchy across all account sub-pages
**Affected Areas:** `account/page.tsx:53`, `account/settings/page.tsx:225,231,325,362,401,468,508,529`
**Benefit:** Visual consistency across the entire account section
**Priority:** P2
**Effort:** 1 hour
**Dependencies:** None

**Implementation:**
1. Account overview: Change `<h2 className="text-xl font-semibold">` to `<h2 className="heading-2 font-serif">`
2. Settings: Same for page heading
3. Settings card headers: Change `<h3 className="text-sm font-medium text-muted-foreground">` to `<h3 className="heading-3">` (18-20px, DM Sans, semibold)

### MT-6: Error state and retry UI for silent failures

**Goal:** Users see feedback when API calls fail
**Affected Areas:** `account/settings/page.tsx:85,115`, `account/page.tsx:48`
**Benefit:** Users are not left wondering why data did not load
**Priority:** P1
**Effort:** 2 hours
**Dependencies:** None

**Implementation:**
1. Create a reusable `<ErrorRetry message="..." onRetry={fn}>` component
2. Replace all `catch { /* silently fail */ }` blocks with error state + retry UI
3. Newsletter toggle: Show toast on failure
4. Account overview: Show error state with "Retry" button if all API calls fail

---

## 4. Structural/Systemic Improvements (1+ day each)

### ST-1: Admin component migration (Medusa UI --> Custom)

**Goal:** Consistent admin UI using only the custom token-based component library
**Affected Areas:** `auction-blocks/page.tsx`, `transactions/page.tsx`, `crm/page.tsx`
**Benefit:** All admin pages render consistently; no style conflicts between Medusa UI and custom components
**Priority:** P3
**Effort:** 3-5 days
**Dependencies:** None (but should be done after all storefront work)

**Implementation:**
1. Audit all admin page imports for `@medusajs/ui` components
2. Replace `Badge` (Medusa) with `Badge`/`ColorBadge` from `admin-ui.tsx`
3. Replace `Button` (Medusa) with `Btn` from `admin-ui.tsx`
4. Replace `Input`/`Select` (Medusa) with `inputStyle`/`selectStyle`
5. Replace `Text` (Medusa) with `<span style={T.body}>` or similar
6. Test each page visually after migration

### ST-2: Shared Switch/Toggle component for storefront

**Goal:** Reusable toggle/switch component for storefront settings
**Affected Areas:** `account/settings/page.tsx` (newsletter toggle, 4x notification toggles)
**Benefit:** DRY code; consistent toggle behavior; accessible by default
**Priority:** P3
**Effort:** 1 day
**Dependencies:** MT-5

**Implementation:**
1. Create `storefront/src/components/ui/switch.tsx` (shadcn/ui Switch)
2. Ensure gold accent when ON (`bg-primary`), muted when OFF
3. Proper `role="switch"`, `aria-checked`, `aria-label`
4. Replace all 5 hand-coded toggles in settings page

### ST-3: Mobile bottom-sheet dialog pattern

**Goal:** Modals convert to bottom sheets on mobile
**Affected Areas:** `AuthModal`, `SearchAutocomplete`, `ConfirmDialog` (from MT-4)
**Benefit:** Native-feeling mobile interaction; easier to dismiss
**Priority:** P3
**Effort:** 2 days
**Dependencies:** MT-4

**Implementation:**
1. Create a `<ResponsiveDialog>` wrapper that renders as Dialog on desktop (>= md) and bottom Sheet on mobile
2. Style: `bottom-0 w-full rounded-t-2xl max-h-[85vh]`
3. Migrate AuthModal, SearchAutocomplete, and ConfirmDialog to use it

---

## 5. Roadmap

### Phase A: Foundations (Tokens + Base Components) -- Week 1

| Task | Effort | GAP IDs | Parallel? |
|------|--------|---------|-----------|
| QW-2: Skip-to-content link | 15 min | GAP-804 | Yes |
| QW-3: aria-live regions | 20 min | GAP-801 | Yes |
| QW-7: Decorative image aria-hidden | 5 min | GAP-802 | Yes |
| MT-2: Hardcoded hex cleanup | 2 hrs | GAP-101, GAP-701 | Yes (independent) |
| QW-1: Touch target fix | 15 min | GAP-403, GAP-404 | Yes |

**Milestone:** All accessibility P0 issues resolved. Token system is reliable.

### Phase B: Core Pages (Home, Catalog, Auctions, Checkout) -- Week 1-2

| Task | Effort | GAP IDs | Parallel? |
|------|--------|---------|-----------|
| QW-4: Container width fix | 10 min | GAP-102 | Yes |
| QW-5: Hero heading class | 5 min | GAP-105 | Yes |
| QW-6: Catalog h1 fix | 5 min | GAP-103 | Yes |
| MT-1: Sticky mobile bid bar | 3 hrs | GAP-401 | No (requires QW-1 first) |
| MT-3: Replace raw buttons | 2 hrs | GAP-402, GAP-501 | Yes |
| MT-6: Error state/retry UI | 2 hrs | GAP-903 | Yes |

**Milestone:** Mobile bidding UX is production-grade. All page containers are consistent.

### Phase C: Account + Settings -- Week 2

| Task | Effort | GAP IDs | Parallel? |
|------|--------|---------|-----------|
| MT-5: Heading standardization | 1 hr | GAP-301, GAP-302, GAP-303, GAP-304 | Yes |
| MT-4: Replace window.confirm | 1.5 hrs | GAP-602 | Yes |
| GAP-502: inputMode attributes | 15 min | GAP-502 | Yes |
| GAP-503: Bid input type fix | 15 min | GAP-503 | Yes |

**Milestone:** Account section is polished and consistent.

### Phase D: Admin + Polish -- Week 3-4

| Task | Effort | GAP IDs | Parallel? |
|------|--------|---------|-----------|
| ST-1: Admin Medusa UI migration | 3-5 days | GAP-702, GAP-703 | Independent |
| ST-2: Shared Switch component | 1 day | GAP-902 | Yes |
| ST-3: Mobile bottom-sheet dialogs | 2 days | Related to SG 9.5 | After MT-4 |
| GAP-601: Mobile nav dedup | 15 min | GAP-601 | Yes |
| GAP-202: Account grid fix | 15 min | GAP-202 | Yes |
| GAP-203: Home spacing fix | 15 min | GAP-203 | Yes |
| GAP-904: Admin nav observer scope | 1 hr | GAP-904 | Yes |

**Milestone:** Full design system compliance across storefront and admin.

---

## 6. Detailed Measure Specifications

### M-01: Accessibility Foundation

**Goal:** WCAG 2.1 AA compliance for the bidding flow
**Affected Areas:** ItemBidSection, BidHistoryTable, Header, layout.tsx
**Benefit:** Legal compliance (EU EAA), inclusive UX, potential SEO benefit
**Priority:** P0
**Effort:** 1 hour total (QW-1 + QW-2 + QW-3 + QW-7)
**Dependencies:** None

### M-02: Token System Integrity

**Goal:** Zero hardcoded colors in storefront components
**Affected Areas:** 17 component files, globals.css (for new tokens)
**Benefit:** Any future theme adjustment (e.g., lighter gold, darker background) is a one-line change
**Priority:** P1
**Effort:** 2 hours (MT-2)
**Dependencies:** None

### M-03: Mobile Bidding Conversion

**Goal:** Bid CTA always reachable on mobile without scrolling
**Affected Areas:** ItemBidSection, auction item page layout
**Benefit:** Direct revenue impact -- reduced friction for the primary action
**Priority:** P0
**Effort:** 3 hours (MT-1)
**Dependencies:** M-01 (touch targets)

### M-04: Component Consistency

**Goal:** All interactive elements use design system components
**Affected Areas:** Footer, CatalogClient, BidHistoryTable, HeaderAuth, MobileNav
**Benefit:** Consistent focus states, hover states, and touch targets everywhere
**Priority:** P1
**Effort:** 3.5 hours (MT-3 + MT-4)
**Dependencies:** None

### M-05: Heading Hierarchy

**Goal:** Consistent heading rendering across all pages
**Affected Areas:** CatalogClient, About, Account, Settings
**Benefit:** Visual consistency; correct semantic structure for SEO
**Priority:** P2
**Effort:** 1.5 hours (QW-5 + QW-6 + MT-5)
**Dependencies:** None

### M-06: Error Resilience

**Goal:** No silent failures; users always see feedback
**Affected Areas:** Account settings, account overview, newsletter
**Benefit:** Users trust the platform; no "nothing happened" moments
**Priority:** P1
**Effort:** 2 hours (MT-6)
**Dependencies:** None

### M-07: Admin Unification

**Goal:** All admin pages use the custom component library exclusively
**Affected Areas:** auction-blocks, transactions, crm pages
**Benefit:** Visual consistency in admin; maintainable codebase
**Priority:** P3
**Effort:** 3-5 days (ST-1)
**Dependencies:** None (can run in parallel with storefront work)

---

## 7. Design System Perspective: Central vs. Page-Local

### Solve Centrally (in shared files)

| Issue | Central Solution | File |
|-------|-----------------|------|
| Hardcoded hex colors | Add missing tokens (`--primary-dark`, `--card-hover`) | `globals.css` |
| Raw buttons | All pages already import `<Button>` -- just enforce usage | `components/ui/button.tsx` |
| Missing Switch | Create `components/ui/switch.tsx` | New file |
| Skip-to-content | Add to `layout.tsx` once | `app/layout.tsx` |
| ConfirmDialog | Create `components/ui/confirm-dialog.tsx` | New file |
| ResponsiveDialog | Create `components/ui/responsive-dialog.tsx` | New file |
| Admin Medusa UI wrapper | No new central solution needed; just swap imports | Page-by-page migration |

### Solve Page-Locally

| Issue | Page-Local Solution | File(s) |
|-------|-------------------|---------|
| Heading classes | Replace class names in each page | 6 pages |
| Container width | Replace class names | 6 files |
| aria-live attributes | Add to specific components | ItemBidSection, BidHistoryTable |
| inputMode attributes | Add to specific inputs | Checkout page |
| Error/retry UI | Add per-component error state | Account pages |
| Sticky bid bar | Component-specific to bidding flow | ItemBidSection |

### Decision Rule

- If 2+ pages need it --> centralize as a shared component
- If only 1 page needs it --> solve locally first, extract later if reused
- Tokens and utilities --> always central (globals.css, admin-tokens.ts)

---

## 8. Execution Order

### Do First (Week 1, Days 1-2)

These can all be done in parallel as they touch different files:

```
[Day 1 Morning]
  QW-1: Touch targets         (Header.tsx -- 15 min)
  QW-2: Skip-to-content       (layout.tsx -- 15 min)
  QW-3: aria-live              (ItemBidSection.tsx -- 20 min)
  QW-4: Container width fix    (6 files -- 10 min)
  QW-5: Hero heading class     (2 files -- 5 min)
  QW-6: Catalog h1 fix         (1 file -- 5 min)
  QW-7: aria-hidden            (2 files -- 5 min)

[Day 1 Afternoon]
  MT-2: Hardcoded hex cleanup  (17 files -- 2 hrs)

[Day 2]
  MT-1: Sticky mobile bid bar  (ItemBidSection.tsx -- 3 hrs)
```

### Do Second (Week 1, Days 3-5)

```
[Day 3]
  MT-3: Replace raw buttons    (4+ files -- 2 hrs)
  MT-6: Error state/retry      (3 files -- 2 hrs)

[Day 4]
  MT-5: Heading standardization (5 files -- 1 hr)
  MT-4: window.confirm replacement (2 files -- 1.5 hrs)
  GAP-502/503: inputMode fixes (checkout -- 30 min)

[Day 5]
  Minor polish (GAP-201, 202, 203, 601) -- 1 hr total
  Visual QA pass on all changed pages -- 2 hrs
```

### Do Later (Weeks 2-4, can be parallelized)

```
ST-1: Admin Medusa UI migration    (independent, 3-5 days)
ST-2: Shared Switch component      (1 day)
ST-3: Mobile bottom-sheet dialogs  (2 days, after MT-4)
```

### Screenshot-Based Fixes (Priority, Week 1-2)

```
[CRITICAL — Do First]
  GAP-1001/1010: Account sidebar → horizontal tabs on mobile   (AccountLayoutClient.tsx — 2 hrs)
  GAP-1004: Verify/fix sticky mobile bid CTA                    (ItemBidSection.tsx — 1 hr)
  GAP-1003: Checkout form single-column on mobile                (checkout/page.tsx — 30 min)

[HIGH — Do Second]
  GAP-1008: Remove Load More OR Pagination (keep one)           (CatalogClient.tsx — 30 min)
  GAP-1005: Compact homepage empty state                         (HomeContent.tsx — 30 min)
  GAP-1002: Catalog mobile card density reduction                (CatalogClient.tsx — 30 min)

[MEDIUM — Polish]
  GAP-1007: Account overview 5-card grid balance                 (account/page.tsx — 20 min)
  GAP-1006: "Last copy" badge vs price collision                 (catalog/[id]/page.tsx — 20 min)
  GAP-1009: Footer newsletter input → Input component            (Footer.tsx — 15 min)
  GAP-1011: Wins Savings Bar more compact                        (wins/page.tsx — 20 min)
  GAP-1012: Related table price column label                     (lot detail page — 10 min)
```

### Backend Admin Fixes (from Screenshot Audit)

```
[HIGH — Week 2]
  GAP-1101: Hide Medusa native Orders page                     (admin-nav.tsx — 30 min)
  GAP-1104: Style Media page filter pills                      (media/page.tsx — 1 hr)

[MEDIUM — Week 2-3]
  GAP-1103: Consolidate auction block status badge colors       (auction-blocks/[id]/page.tsx — 1 hr)
  GAP-1108: Sync Log changes column → summary instead of JSON  (sync/page.tsx — 1 hr)
  GAP-1105: Media table column prioritization                   (media/page.tsx — 1 hr)
  GAP-1109: Go Live button less prominent in beta mode          (config/page.tsx — 30 min)
  GAP-1111: Test Runner "Not Run" vs "Pass" distinction         (test-runner/page.tsx — 30 min)
  GAP-1102: Dashboard activity text contrast                    (dashboard/page.tsx — 20 min)

[LOW — Deferred]
  GAP-1106: Entity Content table spacing                        (entity-content/page.tsx — 20 min)
  GAP-1110: Medusa native settings theme inconsistency          (Large effort, accept for now)
```

### Backend Admin MOBILE Fixes

**Decision needed: Is the admin intended to be usable on mobile?**

If YES (mobile admin needed):
```
[CRITICAL — Week 2]
  GAP-1201: Auto-collapse Medusa sidebar on mobile              (admin-nav.tsx — 2 hrs)
  GAP-1204: StatsGrid responsive columns (1col mobile, 2 tablet) (admin-layout.tsx — 1 hr)
  GAP-1202: Table containers overflow-x: auto                   (all admin table pages — 2 hrs)

[HIGH — Week 3]
  GAP-1203: Block Detail workflow steps vertical on mobile       (auction-blocks/[id]/page.tsx — 30 min)
  GAP-1205: Media filter pills horizontal scroll or dropdown    (media/page.tsx — 1 hr)
  GAP-1206: Email editor form inputs max-width 100%             (emails/page.tsx — 30 min)
```

If NO (admin is desktop-only): **← ENTSCHEIDUNG: DIESE OPTION GEWÄHLT (2026-04-04)**
```
  → Admin ist Desktop-only. GAP-12xx Fixes deferred.
  → Kein mobile Redirect nötig — Admin-Nutzer (Frank) nutzt Desktop.
  → Total effort saved: ~7 hours
```

### Explicitly Deferred

| Item | Reason |
|------|--------|
| About page max-w-4xl (GAP-104) | Intentional design choice for readability; low impact |
| Full Framer Motion audit | Current usage is reasonable; `useReducedMotion` check is a nice-to-have |
| Admin mobile responsiveness | Admin is desktop-first by spec; current CSS fixes in admin-nav are adequate |

---

## Summary

**Total estimated effort:** ~20 hours for storefront (Phase A-C), ~5 days for admin (Phase D)

**Highest ROI items** (do these first for maximum impact with minimum effort):
1. Touch target fixes (15 min, affects every page)
2. aria-live regions (20 min, accessibility compliance)
3. Skip-to-content link (15 min, accessibility compliance)
4. Sticky mobile bid bar (3 hrs, revenue impact)
5. Hardcoded hex cleanup (2 hrs, system integrity)

**After Phase C completion**, the storefront will fully comply with the Style Guide's hard standards (S1-S10) and the platform will be ready for the pre-launch phase with confidence in its UX quality.
