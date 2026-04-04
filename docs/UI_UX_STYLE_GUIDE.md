# VOD Auctions — Unified UI/UX Style Guide

**Version:** 2.0
**Created:** 2026-04-02 | **Updated:** 2026-04-04 (visual audit findings from 170+ screenshots)
**Status:** Single Source of Truth — supersedes `DESIGN_GUIDE_FRONTEND.md` and `DESIGN_GUIDE_BACKEND.md`
**Scope:** Storefront (Next.js 16 / Tailwind CSS 4 / shadcn/ui) + Admin (Medusa.js 2.x, desktop-only)
**Phase:** 1 of 3 (UX Audit)

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Layout System](#2-layout-system)
3. [Typography](#3-typography)
4. [Color & Status System](#4-color--status-system)
5. [Component System](#5-component-system)
6. [Forms & Data Entry](#6-forms--data-entry)
7. [Navigation & Information Architecture](#7-navigation--information-architecture)
8. [Tables & Data-Heavy Interfaces](#8-tables--data-heavy-interfaces)
9. [Mobile-First UX Rules](#9-mobile-first-ux-rules)
10. [Accessibility Standards](#10-accessibility-standards)
11. [Tone of UI](#11-tone-of-ui)
12. [Concrete Implementation Rules](#12-concrete-implementation-rules)

---

## 1. Design Principles

These seven principles govern every design decision across both storefront and admin. When in conflict, principles higher in this list take priority.

### 1.1 Consistency

Every element that serves the same purpose MUST look the same and behave the same across every page.

- A "Save" button on the Shipping page MUST be identical to a "Save" button on the Configuration page.
- A status badge for "active" MUST use the same color, font size, and border radius whether it appears in the Auction Blocks list, the Dashboard, or the Orders table.
- Token values (colors, spacing, typography) are the single source of truth. Hardcoded values are forbidden.
- **Storefront tokens:** CSS custom properties in `globals.css` (`--primary`, `--space-*`, `--text-*`).
- **Admin tokens:** TypeScript constants in `admin-tokens.ts` (`C.*`, `T.*`, `S.*`).

**Rule:** If a value appears in more than one place, it MUST be a token. If it appears in only one place, it SHOULD still be a token if it belongs to a systematic scale (color, spacing, type).

### 1.2 Simplicity

Every screen MUST earn its complexity. Default to the simplest solution.

- One primary action per screen. Secondary actions use subdued styling.
- No more than 3 levels of visual hierarchy on any single view.
- If a feature can be expressed as a single line in a table instead of a card, use the table.
- Empty states MUST explain what will appear and how to create it — never show a blank page.

**Rule:** Before adding a new component, verify that no existing component can serve the purpose. New components require a documented rationale.

### 1.3 Visual Hierarchy

Users MUST be able to identify the most important element on any screen within 2 seconds.

- Hierarchy is established through size, weight, color, and spacing — in that order.
- Primary CTAs use the gold accent (`--primary` / `C.gold`). Only ONE gold CTA per viewport.
- Section headers use uppercase micro typography to separate content zones without visual weight.
- White space is structural, not decorative. It separates logical groups.

**Rule:** Every page MUST follow the structure: PageHeader (title + subtitle + actions) > Content Sections > Footer Actions. No exceptions.

### 1.4 Accessibility

The platform MUST meet WCAG 2.1 AA standards as a minimum.

- All text MUST achieve a contrast ratio of at least 4.5:1 against its background. Large text (18px+ or 14px+ bold) MUST achieve 3:1.
- All interactive elements MUST have visible focus indicators.
- All images MUST have alt text. Decorative images MUST use `alt=""` with `aria-hidden="true"`.
- All form fields MUST have associated labels (visible or `aria-label`).
- The interface MUST be fully operable via keyboard alone.

**Rule:** Accessibility is not a phase or a nice-to-have. Every PR that introduces visual elements MUST pass contrast checks before merge.

### 1.5 Responsiveness

The storefront MUST work flawlessly from 320px to 2560px. The admin is **desktop-only** (>= 1024px viewport). Mobile admin access is not supported.

- Storefront: mobile-first CSS. Base styles target phones, `md:` adds tablet, `lg:` adds desktop.
- Admin: desktop-only (Medusa shell). Minimum supported viewport: 1024px. No mobile optimization required.
- No horizontal scrolling on any viewport width within the supported range.
- Touch targets MUST be at least 44x44px on mobile (per Apple HIG / WCAG 2.5.5).

**Rule:** Every component specification in this guide includes both desktop and mobile behavior. If only one is listed, the component is not yet compliant.

### 1.6 Feedback

Every user action MUST produce visible feedback within 100ms.

- Button clicks: immediate visual state change (opacity, color shift, or loading spinner).
- Form submissions: loading state on submit button + success/error toast within 3s.
- Destructive actions: confirmation dialog before execution, success toast after.
- Network errors: inline error message with retry option. Never a blank screen.
- Long operations (>2s): skeleton loaders or progress indicators. Never a frozen UI.

**Rule:** "Nothing happened" is the worst UX. If the system is working, show it. If it failed, explain it.

### 1.7 Touch Optimization

Auction bidding happens on phones. The storefront MUST be optimized for thumb-driven interaction.

- Primary actions in the bottom 60% of the viewport (thumb zone) on mobile.
- Spacing between tap targets: minimum 8px gap.
- Swipe gestures only as enhancements, never as the sole interaction path.
- Form inputs MUST use appropriate `inputMode` attributes (`numeric`, `email`, `tel`).
- No hover-only interactions. Every hover state MUST have a tap equivalent.

**Rule:** Test every new feature on an actual phone before merging. Simulator testing is insufficient for touch interactions.

---

## 2. Layout System

### 2.1 Storefront Layout

#### Container

```
Max width:    1280px (max-w-6xl, Tailwind CSS 4)
Side padding: 24px (px-6)
Centering:    mx-auto
```

**Rule:** Every page-level content wrapper MUST use `max-w-6xl px-6 mx-auto`. No page content may exceed 1280px. No page content may have less than 24px side padding at any viewport.

#### Spacing Scale (CSS Custom Properties)

| Token | Value | Tailwind Equivalent | Usage |
|-------|-------|---------------------|-------|
| `--space-xs` | 4px | `gap-1`, `p-1` | Inline element gaps, badge padding |
| `--space-sm` | 8px | `gap-2`, `p-2` | Tight spacing between related items |
| `--space-md` | 16px | `gap-4`, `p-4` | Standard content spacing |
| `--space-lg` | 24px | `gap-6`, `p-6` | Section padding, card content padding |
| `--space-xl` | 32px | `gap-8`, `p-8` | Between major sections |
| `--space-2xl` | 48px | `gap-12`, `py-12` | Page section gaps |
| `--space-3xl` | 64px | `gap-16`, `py-16` | Hero spacing |

**Rule:** All spacing MUST align to the 4px grid. Values not in this scale are forbidden. Use `gap-*` for flex/grid children, `p-*` for padding, `m-*` for margins.

#### Grid System

```css
/* Product/Catalog Grid */
Mobile:   1 column    (default)
Tablet:   2 columns   (md:grid-cols-2)
Desktop:  3 columns   (lg:grid-cols-3)
Wide:     4 columns   (xl:grid-cols-4) — catalog only

/* Auction Block Grid */
Mobile:   1 column
Desktop:  2 columns   (md:grid-cols-2)

/* Grid gap: always gap-6 (24px) */
```

**Rule:** Product grids MUST use `grid gap-6`. Card grids MUST NOT use `flex-wrap` — use CSS Grid exclusively for card layouts. Flex is reserved for inline/toolbar arrangements.

**Catalog Card Density on Mobile:**
- At < 375px width, catalog cards in 2-column grid become too dense
- MUST reduce information density on mobile cards: hide year, hide condition badge
- Card title MUST NOT truncate beyond 2 lines on mobile
- Artist name: 1 line max, truncate with ellipsis
- *(Finding: GAP-1002)*

#### Breakpoints

| Name | Pixel | Purpose |
|------|-------|---------|
| (base) | 0-639px | Phone portrait — single column |
| `sm` | 640px | Phone landscape — minor adjustments |
| `md` | 768px | Tablet — navigation appears, 2-col grids |
| `lg` | 1024px | Desktop — 3-col grids, sidebar layouts |
| `xl` | 1280px | Wide desktop — 4-col catalog, max container |

**Rule:** The primary layout breakpoint is `md` (768px). All components MUST define behavior for `< md` (mobile) and `>= md` (desktop) at minimum.

#### Page Structure (Storefront)

```
┌────────────────────────────────────────────────────┐
│  Header (h-16, sticky top-0 z-50, backdrop-blur)   │
├────────────────────────────────────────────────────┤
│                                                    │
│  <main>                                            │
│    max-w-6xl px-6 mx-auto                          │
│    pt-8 pb-16 (min gap from header/footer)         │
│                                                    │
│    [Page Heading — heading-1 or heading-hero]      │
│    [Content Sections — gap-8 between sections]     │
│                                                    │
│  </main>                                           │
│                                                    │
├────────────────────────────────────────────────────┤
│  Footer (py-12, border-t)                          │
└────────────────────────────────────────────────────┘
```

**Rule:** `<main>` content MUST have `pt-8` minimum below the sticky header. Footer MUST have `border-t border-border` separator.

#### Account Navigation on Mobile

The account sidebar (Overview, My Bids, Won, Saved, Cart, Checkout, Orders, Archive, Feedback, Settings, Profile, Addresses) MUST collapse on mobile.

**Desktop (>= 768px):**
- Left sidebar with vertical navigation links
- Content area takes remaining width

**Mobile (< 768px):**
- Sidebar MUST be hidden
- Navigation MUST convert to horizontal scrollable tabs OR a dropdown selector
- Content area MUST be 100% width
- Current active section shown as selected tab/dropdown value

**Rule:** The account sidebar MUST NEVER render as a vertical list on mobile. Content area MUST NEVER be narrower than 100% viewport width minus padding on mobile. *(Finding: GAP-1001/1010)*

### 2.2 Admin Layout

#### Container

```
Max width:    960px (S.pageMaxWidth)
Padding:      20px top, 24px sides, 48px bottom (S.pagePadding)
Background:   transparent (inherits Medusa light shell)
```

**Rule:** Every admin page MUST wrap its content in `<PageShell>` from `admin-layout.tsx`. No admin page may define its own padding or max-width.

#### Spacing Scale (TypeScript Constants)

| Token | Value | Usage |
|-------|-------|-------|
| `S.gap.xs` | 4px | Inline icon gaps |
| `S.gap.sm` | 8px | Tight element spacing |
| `S.gap.md` | 12px | Button groups, badge rows |
| `S.gap.lg` | 16px | Card internal sections |
| `S.gap.xl` | 24px | Between content areas |
| `S.gap.xxl` | 32px | Major section separation |
| `S.sectionGap` | 28px | Between `<SectionHeader>` groups |
| `S.cardPadding` | `16px 18px` | Standard card padding |
| `S.cellPadding` | `10px 14px` | Table cell padding |

**Rule:** All admin spacing MUST reference `S.*` tokens. Numeric pixel values in `style={{}}` are forbidden unless they reference a token.

#### Border Radius Scale (Admin)

| Token | Value | Usage |
|-------|-------|-------|
| `S.radius.sm` | 4px | Badges, small tags |
| `S.radius.md` | 6px | Buttons, inputs |
| `S.radius.lg` | 8px | Cards, table containers |
| `S.radius.xl` | 10px | Hub cards, modals, stats grid |

#### Border Radius Scale (Storefront)

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `--radius-sm` | 6px | `rounded` | Inputs, small buttons |
| `--radius-md` | 8px | `rounded-md` | Standard buttons |
| `--radius-lg` | 10px | `rounded-lg` | Standard cards |
| `--radius-xl` | 14px | `rounded-xl` | Large cards |
| `--radius-2xl` | 18px | `rounded-2xl` | Hero cards, block cards |
| `rounded-full` | 9999px | `rounded-full` | Badges, avatars, pills |

### 2.3 Card Rules

#### Storefront Card

```
Container:  rounded-xl border bg-card shadow-sm
Padding:    p-6 (content area)
Gap:        gap-6 between header/content/footer
```

- Header: `px-6`, title uses `font-semibold`, description uses `text-sm text-muted-foreground`.
- Content: `px-6`.
- Footer: `flex items-center px-6`.

**Rule:** Cards MUST NOT have margin — use the parent grid's gap for spacing. Cards MUST NOT nest other cards.

#### Admin Card

```
Container:  background: "#fff", border: 1px solid C.border, borderRadius: S.radius.xl
Padding:    S.cardPadding (16px 18px)
Hover:      borderColor: C.text, boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
```

**Rule:** Admin cards are styled via inline CSS referencing tokens. No Tailwind in admin pages.

### 2.4 Shadow Scale (Storefront)

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` | Cards at rest |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` | Elevated elements, dropdowns |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.5)` | Modals, overlays |
| `--shadow-gold` | `0 0 40px rgba(212,165,74,0.08)` | Gold glow on featured items |

**Rule:** Shadows are calibrated for the dark theme. Storefront shadows MUST NOT use Tailwind defaults (`shadow-sm`, `shadow-md`) — use the custom properties or their Tailwind equivalents mapped in `@theme`.

---

## 3. Typography

### 3.1 Font Families

| Font | CSS Variable | Tailwind Class | Usage |
|------|-------------|----------------|-------|
| **DM Serif Display** | `--font-dm-serif` | `font-serif` | Storefront headings (hero, h1, h2) |
| **DM Sans** | `--font-dm-sans` | `font-sans` | Everything else: body, labels, buttons, h3 |

Both fonts are loaded via `next/font/google` in `layout.tsx` and exposed as CSS variables.

**Rule:** `font-serif` (DM Serif Display) MUST ONLY be used for `heading-hero`, `heading-1`, and `heading-2`. All other text — including `heading-3` — MUST use `font-sans` (DM Sans). Mixing serif into body text, labels, or buttons is forbidden.

**Admin fonts:** The admin panel inherits the Medusa shell's system font stack. No custom fonts are loaded. All admin typography is controlled via `T.*` tokens in `admin-tokens.ts`.

### 3.2 Storefront Typography Scale

Built on a Perfect Fourth ratio (1.333) with `clamp()` for fluid sizing.

| Class | CSS Property | Size Range | Weight | Line Height | Letter Spacing | Font |
|-------|-------------|------------|--------|-------------|----------------|------|
| `.heading-hero` | `--text-hero` | 40px - 60px | 400 | 1.1 | -0.01em | DM Serif Display |
| `.heading-1` | `--text-h1` | 30px - 36px | 400 | 1.2 | normal | DM Serif Display |
| `.heading-2` | `--text-h2` | 24px - 30px | 400 | 1.25 | normal | DM Serif Display |
| `.heading-3` | `--text-h3` | 18px - 20px | 600 | 1.3 | normal | DM Sans |
| body | `--text-body` | 14px | 400 | 1.5 | normal | DM Sans |
| small | `--text-small` | 12px | 400 | 1.5 | normal | DM Sans |
| micro | `--text-micro` | 10px | 700 | 1.4 | 0.06em | DM Sans |

**Heading class usage:**

| Element | Class | When to Use |
|---------|-------|-------------|
| Page hero | `heading-hero font-serif` | Homepage hero, auction block hero. Max 1 per page. |
| Page title | `heading-1 font-serif` | Top-level page heading (Catalog, About, Account). Exactly 1 per page. |
| Section title | `heading-2 font-serif` | Major sections within a page. |
| Subsection title | `heading-3` | Card titles, subsection headers. No `font-serif`. |
| Body | `text-sm` | Default paragraph text (14px). |
| Label/Caption | `text-xs` | Form labels, meta text, timestamps (12px). |
| Badge/Micro | `text-[10px]` or `text-[11px]` | Condition badges, format tags, lot numbers. |

**Rule:** Every page MUST have exactly one `<h1>` element using `heading-1 font-serif` (or `heading-hero font-serif` for hero pages). The H1 MUST be the first visible heading. Subsequent headings MUST follow semantic order (h2, h3, etc.). Skipping levels (h1 > h3) is forbidden.

**Rule:** Text size MUST NOT be set via arbitrary values (`text-[17px]`) unless it matches a token value exactly. Use the defined scale.

### 3.3 Admin Typography Scale

| Token | Size | Weight | Transform | Usage |
|-------|------|--------|-----------|-------|
| `T.pageTitle` | 20px | 700 | none | Page heading (via `PageHeader`) |
| `T.subtitle` | 13px | 400 | none | Page subtitle, descriptions |
| `T.sectionHead` | 11px | 700 | uppercase | Section dividers, table column headers |
| `T.body` | 13px | 400 | none | Default text |
| `T.small` | 12px | 400 | none | Secondary text, hints, timestamps |
| `T.micro` | 10px | 700 | uppercase | Labels, badge text, overlines |
| `T.stat` | 22px | 700 | none | Large numbers in stats cards |
| `T.mono` | 12px | 400 | none | IDs, codes, technical values |

**Rule:** All admin text MUST use a `T.*` token or direct inline `fontSize` that matches one of these values exactly. No custom font sizes.

### 3.4 Line Height Rules

| Context | Line Height | Rationale |
|---------|------------|-----------|
| Headings (hero, h1, h2) | 1.1 - 1.25 | Tight for visual impact |
| Body text | 1.5 | Readable paragraph spacing |
| Labels and micro text | 1.3 - 1.4 | Compact but legible |
| Single-line elements (buttons, badges) | 1 | Vertical centering |

**Rule:** Line height MUST NOT be set to `1.0` on multi-line text. Multi-line body text MUST use `leading-normal` (1.5) or `leading-relaxed` (1.625).

### 3.5 Font Weight Rules

| Weight | Value | When to Use |
|--------|-------|-------------|
| Regular | 400 | Body text, descriptions, serif headings |
| Medium | 500 | Config row labels, emphasized body text |
| Semibold | 600 | h3 headings, card titles, button text, badge text, active tab labels |
| Bold | 700 | Page titles (admin), stat numbers, section headers, micro labels |

**Rule:** DM Serif Display headings MUST use weight 400 (the font's regular weight). Applying `font-bold` to serif headings produces visual artifacts.

---

## 4. Color & Status System

### 4.1 Storefront Colors (Dark Theme — "Vinyl Culture")

#### Core Palette

| Token | Hex | Contrast on bg | Usage |
|-------|-----|----------------|-------|
| `--primary` | `#d4a54a` | 6.8:1 | Gold — CTAs, accents, active states, links |
| `--primary-foreground` | `#1c1915` | — | Text on gold buttons/backgrounds |
| `--background` | `#1c1915` | — | Page background |
| `--foreground` | `#f5efe6` | 12.8:1 | Primary text |
| `--card` | `#241f1a` | — | Card backgrounds |
| `--card-foreground` | `#f5efe6` | 11.2:1 on card | Text on cards |
| `--secondary` | `#2a2520` | — | Secondary buttons, muted areas |
| `--secondary-foreground` | `#f5efe6` | 10.1:1 on secondary | Text on secondary |
| `--muted` | `#2a2520` | — | Disabled/inactive backgrounds |
| `--muted-foreground` | `#a09888` | 4.7:1 | Secondary text, placeholders, timestamps |
| `--input` | `#302a22` | — | Input field backgrounds |
| `--border` | `rgba(232,224,212,0.08)` | — | Subtle borders |
| `--ring` | `#d4a54a` | — | Focus ring color |
| `--accent` | `#d4a54a` | — | Alias for primary (hover backgrounds) |
| `--destructive` | `#ef4444` | 5.2:1 | Errors, delete actions |

#### Status Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--status-active` | `#4ade80` | Live auctions, winning bids, online indicators |
| `--status-scheduled` | `#a09888` | Scheduled/upcoming items |
| `--status-ended` | `#71717a` | Ended/archived items |
| `--status-preview` | `#f97316` | Preview mode indicator |
| `--bid-winning` | `#4ade80` | Current highest bidder indicator |
| `--bid-outbid` | `#f97316` | Outbid warning |

#### Format Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--format-vinyl` | `#d4a54a` | Vinyl format badge |
| `--format-cd` | `#38bdf8` | CD format badge |
| `--format-cassette` | `#a855f7` | Cassette format badge |

#### Condition Badge Colors

| Condition | Background | Text | Border |
|-----------|-----------|------|--------|
| M / NM (Mint) | `bg-green-500/15` | `text-green-400` | `border-green-500/20` |
| VG+ / VG | `bg-amber-500/15` | `text-amber-400` | `border-amber-500/20` |
| G+ / G | `bg-orange-500/15` | `text-orange-400` | `border-orange-500/20` |
| F / P (Fair/Poor) | `bg-red-500/15` | `text-red-400` | `border-red-500/20` |

**Rule:** Condition badges MUST use the three-layer color approach: semi-transparent background + opaque text + semi-transparent border. This ensures readability on both `--background` and `--card`.

### 4.2 Admin Colors (Light Theme)

#### Core Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `C.bg` | `transparent` | Page background (inherits Medusa white shell) |
| `C.card` | `#f8f7f6` | Card backgrounds, table headers, modal headers |
| `C.text` | `#1a1714` | Primary text |
| `C.muted` | `#78716c` | Secondary text, labels, placeholders |
| `C.gold` | `#b8860b` | Primary accent — active tabs, gold CTAs |
| `C.border` | `#e7e5e4` | Borders, dividers, table lines |
| `C.hover` | `#f5f4f3` | Row hover, interactive highlights |

#### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `C.success` | `#16a34a` | Success states, active toggles, "active" badges |
| `C.error` | `#dc2626` | Errors, danger actions, "failed" badges |
| `C.warning` | `#d97706` | Warnings, "pending" badges |
| `C.blue` | `#2563eb` | Info, links, "approved" badges |
| `C.purple` | `#7c3aed` | Special states, "invited" badges |

#### Status Badge Color Map

Each semantic color generates a three-part badge style via `badgeStyle()`:

```
Background: {color}12  (7% opacity hex suffix)
Text:       {color}    (full opacity)
Border:     {color}30  (19% opacity hex suffix)
```

Available variants: `success`, `error`, `warning`, `info`, `purple`, `neutral`.

### 4.3 Forbidden Colors

**Storefront — MUST NOT use:**

| Color | Reason |
|-------|--------|
| Pure `#fff` as text | Too harsh on dark background — use `--foreground` (`#f5efe6`) |
| Pure `#000` as background | Too cold — use `--background` (`#1c1915`) |
| Any color below 4.5:1 contrast on `--background` | WCAG violation |

**Admin — MUST NOT use:**

| Color | Reason |
|-------|--------|
| `#f5f0eb`, `#e8e0d4`, `#d1d5db` | Light text — invisible on white background |
| `#1c1915`, `#0d0b08` | Dark backgrounds — conflicts with Medusa light shell |
| `rgba(255,255,255,*)` borders | Invisible on white |
| `#9ca3af` | Insufficient contrast for body text on white |
| Any hardcoded hex in `page.tsx` | MUST use `C.*` token reference |

### 4.4 Color Usage Rules

1. **One gold CTA per viewport.** If two buttons are visible simultaneously, only one may use `bg-primary` (storefront) or `C.gold` (admin). The other MUST use secondary/ghost styling.

2. **Red means destructive.** `--destructive` / `C.error` MUST ONLY be used for delete actions, errors, and failure states. Never for prices, emphasis, or decoration.

3. **Green means success or active.** `--status-active` / `C.success` MUST ONLY indicate positive states: winning bid, live auction, successful operation, toggle ON.

4. **Orange means warning or attention.** `--status-preview` / `C.warning` signals caution: outbid, pending review, approaching deadline.

5. **No color alone conveys meaning.** Every color-coded element MUST also have a text label or icon. Color-blind users MUST be able to distinguish all states.

---

## 5. Component System

### 5.1 Storefront Components

#### 5.1.1 Button (shadcn/ui — `components/ui/button.tsx`)

**Variants:**

| Variant | Classes | When to Use |
|---------|---------|-------------|
| `default` (Gold) | `bg-primary text-primary-foreground hover:bg-primary/90` | Primary CTA — "Place Bid", "Add to Cart", "Pay Now" |
| `destructive` | `bg-destructive text-white hover:bg-destructive/90` | Delete, cancel, remove actions |
| `outline` | `border bg-background shadow-xs hover:bg-accent` | Secondary actions — "View Details", "See All" |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/80` | Tertiary actions, filter toggles |
| `ghost` | `hover:bg-accent hover:text-accent-foreground` | Minimal actions — icon buttons, nav links |
| `link` | `text-primary underline-offset-4 hover:underline` | Inline text links styled as buttons |

**Sizes:**

| Size | Height | Padding | Min Touch Target | Usage |
|------|--------|---------|------------------|-------|
| `xs` | 24px (h-6) | px-2 | 24px (NOT mobile-safe alone) | Tight spaces, inline badges |
| `sm` | 32px (h-8) | px-3 | 32px | Secondary actions, table row buttons |
| `default` | 36px (h-9) | px-4 | 36px | Standard buttons |
| `lg` | 40px (h-10) | px-6 | 40px | Primary CTAs, submit buttons |
| `icon` | 36x36px | — | 36px | Icon-only buttons (bookmark, close) |
| `icon-xs` | 24x24px | — | 24px | Tight icon buttons |
| `icon-sm` | 32x32px | — | 32px | Small icon buttons |
| `icon-lg` | 40x40px | — | 40px | Large icon buttons |

**States:**

| State | Visual |
|-------|--------|
| Default | As defined per variant |
| Hover | `hover:bg-primary/90` (gold) or variant-specific hover |
| Focus | `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50` |
| Disabled | `opacity-50 pointer-events-none cursor-not-allowed` |
| Loading | Replace label with spinner. Button width MUST NOT change. |

**Rules:**
- MUST use the `<Button>` component from `components/ui/button.tsx`. No `<button>` with custom classes.
- On mobile, buttons that are the primary CTA MUST be `size="lg"` (40px) minimum for 44px touch target (with padding).
- `xs` buttons MUST NOT be used as standalone mobile CTAs. Acceptable only inside tables or tight desktop UIs.
- Button labels MUST be 2-3 words maximum. No sentences in buttons.

#### 5.1.2 Input (shadcn/ui — `components/ui/input.tsx`)

**Structure:**
```
Height:      36px (h-9)
Background:  var(--input) — #302a22
Border:      1px solid var(--primary)/25 (gold at 25% opacity)
Radius:      rounded-md (8px)
Padding:     px-3 py-1
Font size:   16px mobile (prevents iOS zoom), 14px desktop (md:text-sm)
```

**States:**

| State | Visual |
|-------|--------|
| Default | `border-primary/25 bg-input` |
| Focus | `border-ring ring-[3px] ring-ring/50` (gold focus ring) |
| Error | `border-destructive ring-destructive/20` (via `aria-invalid`) |
| Disabled | `opacity-50 cursor-not-allowed pointer-events-none` |
| Placeholder | `text-muted-foreground` |

**Rules:**
- MUST use the `<Input>` component. No raw `<input>` elements.
- Selection highlight uses `selection:bg-primary selection:text-primary-foreground` (gold).
- Number inputs MUST hide browser spinners (already in globals.css).
- On mobile, `type="email"`, `type="tel"`, and `type="number"` MUST use appropriate `inputMode` for correct virtual keyboard.

#### 5.1.3 Card (shadcn/ui — `components/ui/card.tsx`)

**Structure:**
```
Container: rounded-xl border bg-card shadow-sm py-6 gap-6
Header:    px-6 — title (font-semibold), description (text-sm text-muted-foreground)
Content:   px-6
Footer:    flex items-center px-6
```

**Rules:**
- Cards MUST NOT contain other cards.
- Cards MUST have consistent padding — `px-6` for all zones.
- Card titles MUST use `font-semibold` (DM Sans 600), NOT `font-serif`.
- Cards at rest use `--shadow-sm`. Hover elevation is optional, via `hover:shadow-md` or `hover:-translate-y-1`.

#### 5.1.4 Block Card (Auction Block — `components/BlockCard.tsx`)

**Structure:**
```
Container: rounded-2xl border border-border bg-[rgba(232,224,212,0.04)]
Hover:     border-[rgba(212,165,74,0.4)] -translate-y-1
Image:     aspect-[16/10], hover: scale-105 transition-transform duration-500
Overlay:   top-3 left-3, bg-[rgba(28,25,21,0.85)] backdrop-blur-sm
Text:      p-5
```

**Rule:** Block cards are the primary auction navigation element. They MUST show: cover image, block title (serif), item count, status badge, and time remaining (if active).

#### 5.1.5 Badge (shadcn/ui — `components/ui/badge.tsx`)

**Structure:**
```
Layout:  inline-flex items-center gap-1
Radius:  rounded-full
Padding: px-2 py-0.5
Font:    text-xs font-medium
```

**Variants:** `default` (gold), `secondary`, `destructive`, `outline`.

**Condition badges** (vinyl grading) use custom styling — see Section 4.1.

**Rules:**
- Badges MUST NOT be interactive (no click handlers). Use buttons if clickable.
- Badge text MUST be 1-2 words maximum.
- Status badges MUST pair with a text label — never color alone.

#### 5.1.6 Dialog (shadcn/ui)

**Structure:**
```
Overlay:   bg-black/80
Container: max-w-lg, centered
Animation: fade + zoom (0.2s)
Padding:   p-6
```

**Rules:**
- Dialogs MUST have a visible close mechanism (X button or Cancel).
- On mobile (< 768px), dialogs SHOULD transition to bottom sheets (`bottom-0 w-full rounded-t-2xl`).
- Dialogs MUST NOT contain scrollable tables. Use a separate page for complex data.

#### 5.1.7 Skeleton Loader

**Structure:**
```
Background: bg-secondary (--muted: #2a2520)
Animation:  animate-pulse (2s, custom — see globals.css)
Radius:     Match the element being loaded
```

**Rules:**
- Every data-dependent section MUST show a skeleton while loading.
- Skeleton shapes MUST approximate the shape of the loaded content.
- Skeletons MUST NOT flash (minimum display time: 300ms).

#### 5.1.8 Header (Storefront)

**Structure:**
```
Position:   sticky top-0 z-50
Height:     h-16 (64px)
Background: rgba(28,25,21,0.95) backdrop-blur-xl
Border:     border-b border-[rgba(232,224,212,0.1)]
```

**Desktop (>= md):** Logo left, nav links center, auth/cart icons right.
**Mobile (< md):** Logo left, hamburger right. Navigation opens as right-side Sheet (`w-72`).

**Rules:**
- Logo: `Disc3` icon with gradient `from-primary to-[#b8860b]`.
- Nav links: `text-muted-foreground` default, `text-foreground` when active.
- Badge counters (cart, saved, wins): gold circle `bg-primary text-primary-foreground`, max display "9+".
- Header MUST NOT exceed 64px height. No mega-menus or multi-row headers.

#### 5.1.9 Footer (Storefront)

**Structure:**
```
Padding:  py-12
Border:   border-t border-border
Layout:   3-column links (desktop), stacked (mobile)
Content:  Logo, navigation links, legal links, copyright
```

**Rules:**
- Footer links MUST use `text-muted-foreground hover:text-foreground` styling.
- Newsletter signup in footer MUST use the standard `<Input>` component.
- Copyright line MUST be at the bottom, `text-xs text-muted-foreground`.

#### 5.1.10 Save for Later Button

**Structure:**
```
Size:       44x44px (11*4px)
Radius:     rounded-[10px]
Default:    bg-primary/8 border-primary/25
Hover:      bg-primary/15 border-primary/40
Saved:      bg-primary/20 border-primary/50
Icon:       Heart — outline (unsaved), filled (saved)
```

**Rule:** The save button MUST be 44x44px minimum for mobile touch compliance. It MUST provide immediate optimistic UI feedback on tap.

#### 5.1.11 Direct Purchase Section

**Structure:**
```
Container: bg-primary/10 border border-primary/30 rounded-lg p-4
Price:     text-2xl font-bold font-mono text-primary
Button:    bg-primary hover:bg-primary/90 text-primary-foreground
Added:     bg-green-600 text-white
```

**Rule:** Price MUST use monospace font for alignment. "Add to Cart" MUST transition to "Added" with checkmark for 2s, then revert. The entire section MUST be visually distinct from bid-related UI.

### 5.2 Admin Components

#### 5.2.1 PageHeader (`admin-layout.tsx`)

**Structure:**
```
Layout:    flex, space-between, align-start
Title:     T.pageTitle (20px, 700)
Subtitle:  T.subtitle (13px, muted)
Badge:     Right-aligned, semi-transparent bg
Actions:   Right-aligned, button group
Margin:    marginBottom: 20
```

**Rule:** EVERY admin page MUST use the `<PageHeader>` component as its first visual element. No custom header markup.

#### 5.2.2 SectionHeader (`admin-layout.tsx`)

**Structure:**
```
Typography: T.sectionHead (11px, 700, uppercase, 0.06em tracking)
Border:     1px solid C.border (bottom)
Spacing:    marginTop: 28, marginBottom: 10, paddingBottom: 8
Optional:   count prop — renders as "(count)" in regular weight
```

**Rule:** Sections within an admin page MUST be separated by `<SectionHeader>`. No custom dividers or heading markup for section breaks.

#### 5.2.3 PageShell (`admin-layout.tsx`)

**Structure:**
```
Padding:   S.pagePadding (20px 24px 48px)
MaxWidth:  S.pageMaxWidth (960px) — overridable
```

**Rule:** EVERY admin page MUST wrap content in `<PageShell>`. This is the only way to ensure consistent padding and max-width.

#### 5.2.4 Tabs (`admin-layout.tsx`)

**Structure:**
```
Container: flex, borderBottom: 1px C.border, marginBottom: 20
Tab:       padding 8px 14px, fontSize 13
Active:    fontWeight 600, color C.gold, borderBottom 2px C.gold
Inactive:  fontWeight 400, color C.muted, borderBottom 2px transparent
```

**Rules:**
- Tab labels MUST be 1-2 words.
- Max 6 tabs per page. If more than 6 sections exist, use a dropdown or hub-card navigation.
- Active tab indicator MUST be gold (`C.gold`).

#### 5.2.5 StatsGrid (`admin-layout.tsx`)

**Structure:**
```
Grid:      repeat(N, 1fr), gap: 1px
Container: background: C.border (creates 1px gap lines), borderRadius: S.radius.lg
Card:      background: "#fff", padding: 14px 16px
Label:     T.micro (10px, uppercase)
Value:     T.stat (22px, 700)
Subtitle:  T.small (12px, muted)
```

**Rules:**
- Stats grid MUST NOT exceed 6 columns. For 5+ stats, consider 2 rows of 3.
- On screens below 768px, stats grid SHOULD reflow to 2 columns.
- Stat values MUST use `fmtMoney()` for currency and `fmtNum()` for counts (both from `admin-tokens.ts`).

#### 5.2.6 Badge (`admin-ui.tsx`)

**Structure:**
```
Display:    inline-block
Font:       11px, 600, uppercase, 0.03em tracking
Padding:    2px 8px
Radius:     S.radius.sm (4px)
Variants:   success, error, warning, info, purple, neutral
```

**Rule:** Admin badges MUST use the `<Badge>` component or `<ColorBadge>` for custom colors. No inline badge styles.

#### 5.2.7 Toggle (`admin-ui.tsx`)

**Structure:**
```
Track:  38x20px, borderRadius: 10
Knob:   14x14px, borderRadius: 7, white
ON:     background: C.success, knob left: 21
OFF:    background: C.border, knob left: 3
```

**Rules:**
- Toggles MUST have an associated label (via `<ConfigRow>` or adjacent text).
- Toggle changes SHOULD auto-save (no separate "Save" button needed).
- Disabled toggles: `opacity: 0.5, cursor: not-allowed`.

#### 5.2.8 Toast (`admin-ui.tsx`)

**Structure:**
```
Position:   fixed, bottom: 24, right: 24, z-9999
Background: #fff
Border:     1px solid {color}
Padding:    10px 18px
Radius:     S.radius.lg (8px)
Shadow:     0 4px 20px rgba(0,0,0,0.1)
Duration:   2500ms auto-dismiss
```

**Variants:** `success` (green border), `error` (red border).

**Rules:**
- Toasts MUST appear after every mutating action: save, delete, send, toggle.
- Toasts MUST NOT require user dismissal for success states (auto-dismiss).
- Error toasts SHOULD be dismissible and MAY persist longer (5000ms).
- Max 1 toast visible at a time. New toasts replace existing ones.

#### 5.2.9 Alert (`admin-ui.tsx`)

**Structure:**
```
Padding:   12px 16px
Radius:    S.radius.lg (8px)
Margin:    marginBottom: 16
Layout:    flex, space-between (message + optional dismiss)
Variants:  error, warning, success, info
```

**Rules:**
- Alerts MUST be used for persistent messages that relate to the page state (not transient feedback — use Toast for that).
- Alerts MUST have a clear label prefix: "Error:", "Warning:", "Note:".
- Dismissible alerts (`onDismiss`) MUST have an accessible close button.

#### 5.2.10 EmptyState (`admin-ui.tsx`)

**Structure:**
```
Padding:    48px 20px
Alignment:  center
Icon:       40px emoji, opacity: 0.4
Title:      fontWeight: 600, C.text
Description: fontSize: 13, C.muted
```

**Rules:**
- EVERY list/table page MUST show `<EmptyState>` when data is empty.
- Empty state MUST explain what the section is for and how to populate it.
- Empty state SHOULD include a CTA button when the user can create content.

#### 5.2.11 Btn (`admin-ui.tsx`)

**Structure:**
```
Base:     fontSize: 12, fontWeight: 600, padding: 6px 16px, borderRadius: S.radius.md
Variants:
  primary: bg C.text, color #fff
  gold:    bg C.gold, color #fff
  danger:  bg C.error+12, color C.error, border C.error+40
  ghost:   bg transparent, color C.muted, border C.border
```

**Rules:**
- Primary action: `primary` or `gold` variant.
- Destructive action: `danger` variant.
- Secondary/cancel: `ghost` variant.
- Disabled: `opacity: 0.4, cursor: not-allowed`.

#### 5.2.12 Modal (`admin-ui.tsx`)

**Structure:**
```
Overlay:    rgba(0,0,0,0.4)
Container:  #fff, borderRadius: 12, maxWidth: 540px, maxHeight: 80vh
Header:     background: C.card, border-bottom C.border, padding: 18px 24px
Body:       padding: 20px 24px
Footer:     padding: 14px 24px, border-top C.border, flex justify-end
```

**Rules:**
- Modal MUST have a title in the header.
- Modal MUST be closable via overlay click AND Escape key.
- Footer buttons: Cancel (ghost) on left, Primary action on right.
- Modals MUST NOT be wider than 540px. For complex forms, use a full page instead.
- Content that scrolls MUST scroll within the body area, not the entire modal.

#### 5.2.13 ConfigRow (`admin-ui.tsx`)

**Structure:**
```
Layout:  flex, space-between, align-center
Padding: 12px 0
Border:  borderBottom 1px C.border at 50% opacity
Label:   fontSize: 13, fontWeight: 500
Hint:    fontSize: 11, C.muted, marginTop: 2
Control: right-aligned, flex with gap S.gap.sm
```

**Rule:** Settings/configuration pages MUST use `<ConfigRow>` for every setting. No freeform layout for config items.

#### 5.2.14 Input (Admin — `admin-ui.tsx`)

**Structure:**
```
Width:     100% (maxWidth: 240px for inline inputs)
Padding:   7px 11px
Radius:    S.radius.md (6px)
Border:    1px solid C.border
Background: #fff
Font:      13px, C.text
Focus:     borderColor: C.gold
```

**Rule:** Admin inputs MUST use the exported `inputStyle` object or `selectStyle` for selects. No custom input styling.

### 5.3 Shared Motion & Animation

#### Storefront — Framer Motion (`lib/motion.ts`)

| Preset | Effect | Duration | Usage |
|--------|--------|----------|-------|
| `fadeIn` | Opacity 0 > 1 | 0.4s | Page-level fade-in |
| `fadeInUp` | Opacity + Y(20px) > 0 | 0.5s, easeOut | Section-level entrance |
| `staggerContainer` | Stagger children delay | 0.04s per child | Grid/list containers |
| `staggerItem` | Opacity + Y(8px) > 0 | 0.2s, easeOut | Individual grid items |
| `scaleIn` | Scale 0.95 > 1 + Opacity | 0.3s | Modal/dialog entrance |

**Rules:**
- Entrance animations MUST use `fadeIn` or `fadeInUp`. No custom spring physics.
- Grid item animations MUST use `staggerContainer` + `staggerItem` for sequential reveal.
- Animation duration MUST NOT exceed 500ms for any element.
- `@media (prefers-reduced-motion: reduce)` MUST disable all animations (already in globals.css).

#### Storefront — CSS Transitions

| Element | Property | Duration |
|---------|----------|----------|
| Image hover (cards) | `transform: scale(1.05)` | `duration-500` (500ms) |
| Card hover | `transform: translateY(-4px)` | default transition |
| Button hover | `background-color` | default transition |
| Link/nav color | `color` | default transition |

**Rule:** CSS transitions MUST use the token durations: `--transition-fast` (150ms) for micro-interactions, `--transition-normal` (250ms) for state changes, `--transition-slow` (400ms) for emphasis.

#### Admin — Inline Transitions

| Element | Property | Duration |
|---------|----------|----------|
| Toggle track | `background` | 200ms |
| Toggle knob | `left` | 150ms |
| Table row hover | `background` | 100ms |
| Hub card hover | `border-color, box-shadow` | 150ms |
| Button hover | `opacity` | 150ms |

**Rule:** Admin transitions MUST be subtle. No bouncing, no elastic springs, no scaling. Fade and slide only.

#### Pulse Animation

```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
```

**Usage:** Live auction indicator dot. MUST NOT be used for anything else. Duration: 2s infinite.

---

## 6. Forms & Data Entry

### 6.1 Form Structure

#### Storefront Forms

```
<form>
  <fieldset>                         /* Logical group */
    <legend class="heading-3">       /* Group title (optional) */
    
    <div class="space-y-4">          /* 16px gap between fields */
      <div>                          /* Field container */
        <Label>                      /* Visible label, text-sm font-medium */
        <Input>                      /* Input component */
        <p class="text-xs text-destructive mt-1">  /* Error (conditional) */
      </div>
    </div>
  </fieldset>
  
  <div class="flex justify-end gap-3 mt-6">  /* Form actions */
    <Button variant="outline">Cancel</Button>
    <Button>Submit</Button>
  </div>
</form>
```

**Rules:**
- Fields MUST be stacked vertically. No side-by-side fields on mobile.
- On desktop, short related fields MAY be placed side-by-side using `grid grid-cols-2 gap-4`.
- Form action buttons MUST be right-aligned, with Cancel before Submit.
- The submit button MUST be the only `default` (gold) variant button in the form.

#### Admin Forms

```tsx
<div style={{ display: "flex", flexDirection: "column", gap: S.gap.lg }}>
  <div>
    <label style={T.small}>{label}</label>
    <input style={inputStyle} />
    {error && <div style={{ fontSize: 11, color: C.error, marginTop: 4 }}>{error}</div>}
  </div>
</div>
```

**Rules:**
- Admin forms MUST use `inputStyle` or `selectStyle` from `admin-ui.tsx`.
- Labels MUST use `T.small` styling (12px, muted).
- Error messages MUST use `fontSize: 11, color: C.error`.

### 6.2 Labels

| Context | Style | Rule |
|---------|-------|------|
| Storefront field label | `text-sm font-medium text-foreground` | Visible above every input |
| Storefront optional marker | `text-xs text-muted-foreground` (inline) | "(optional)" text next to label |
| Admin field label | `T.small` (12px, C.muted) | Above or to the left of input |
| Required indicator | Red asterisk is forbidden | Use "(required)" text if needed, or make all fields required by default and mark optional ones |

**Rule:** Every form field MUST have a visible text label. Placeholder text is NOT a substitute for labels. Placeholders SHOULD show example values, not field names.

### 6.3 Validation

#### Timing

| Event | Action |
|-------|--------|
| On blur (first touch) | Validate field, show error if invalid |
| On change (after first error) | Re-validate in real-time to clear error |
| On submit | Validate all fields, focus first invalid field |

**Rule:** MUST NOT validate on every keystroke before the user has left the field. Aggressive validation frustrates users.

#### Error Display

**Storefront:**
```
<p class="text-xs text-destructive mt-1">Error message here</p>
```
The input border also changes via `aria-invalid="true"` — `border-destructive ring-destructive/20`.

**Admin:**
```tsx
<div style={{ fontSize: 11, color: C.error, marginTop: 4 }}>Error message here</div>
```

**Rules:**
- Error messages MUST appear directly below the field they refer to.
- Error messages MUST be specific: "Email address is required" not "This field is required".

#### Checkout Form Mobile Layout

**Rule:** Checkout address forms MUST be single-column on mobile (< 768px). Multi-column form rows (Postal Code + City + Country) MUST stack vertically: `grid-cols-1 md:grid-cols-3`.

**MUST NOT:** Render 3 narrow inputs side-by-side on a 375px screen. *(Finding: GAP-1003)*
- Form-level errors (server errors, network failures) MUST appear as an `<Alert type="error">` above the form.
- MUST NOT use browser-native validation tooltips. Use `noValidate` on `<form>` and handle validation in JS.

### 6.4 Input Types

| Data Type | Input | `inputMode` | Pattern |
|-----------|-------|-------------|---------|
| Email | `type="email"` | `email` | — |
| Phone | `type="tel"` | `tel` | — |
| Money | `type="text"` | `decimal` | — (format on blur) |
| Quantity | `type="text"` | `numeric` | `[0-9]*` |
| Password | `type="password"` | — | — |
| Search | `type="search"` | `search` | — |
| URL | `type="url"` | `url` | — |

**Rule:** `type="number"` MUST NOT be used for monetary amounts or IDs (spinner buttons cause errors). Use `type="text"` with `inputMode="decimal"` or `inputMode="numeric"`.

### 6.5 Textarea

**Storefront:** Same styling as Input but with `min-h-[80px]` and `resize-y`.
**Admin:** Same as `inputStyle` but with `minHeight: 80` and no `maxWidth`.

**Rule:** Textareas MUST allow vertical resize. Horizontal resize MUST be disabled (`resize: vertical` or `resize-y`).

### 6.6 Select / Dropdown

**Storefront:** Use shadcn/ui `<Select>` component with same border/focus styling as Input.
**Admin:** Use `selectStyle` from `admin-ui.tsx`. Native `<select>` with consistent styling.

**Rule:** For fewer than 8 options, use a `<select>`. For 8+ options, use a searchable dropdown or combobox.

### 6.7 Checkbox / Radio

**Storefront:** Use shadcn/ui `<Checkbox>` and `<RadioGroup>`. Gold accent (`bg-primary`) when checked.
**Admin:** Native with custom styling. `accent-color: C.gold` or custom checkbox via CSS.

**Rule:** Radio buttons MUST be used for mutually exclusive choices (2-5 options). Checkboxes for multi-select. For single boolean toggles, prefer a Toggle component (admin) or a Switch (storefront).

---

## 7. Navigation & Information Architecture

### 7.1 Storefront Navigation

#### Primary Navigation (Header)

**Desktop (>= md):** Horizontal links in center of header.

```
[Logo]    Auctions    Catalog    Gallery    About    [Search] [Cart] [Account]
```

**Mobile (< md):** Hamburger icon on the right opens a Sheet from the right side.

```
Sheet (w-72):
  [Close X]
  Auctions
  Catalog
  Gallery
  About
  ─────────────
  Account
  Saved Items
  Cart
```

**Rules:**
- Active link: `text-foreground` (bright cream). Inactive: `text-muted-foreground`.
- Max 5 primary nav items on desktop. 6+ items MUST be consolidated or moved to a "More" dropdown.
- Mobile sheet MUST close on navigation (route change) and on overlay tap.
- Badge counters on Cart/Saved/Account icons: `bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px]`.

#### Breadcrumbs

```
Catalog > Artist Name > Release Title
```

**Structure:** `text-sm text-muted-foreground` with `>` separator. Final item in `text-foreground` (not clickable).

**Rules:**
- Breadcrumbs MUST appear on detail pages (release detail, artist page, label page, auction block detail).
- Breadcrumbs MUST NOT appear on top-level pages (Catalog listing, Auctions listing, Homepage).
- Breadcrumbs MUST be placed between the Header and the page heading, with `mb-4` spacing.

#### Secondary Navigation

Tabbed navigation within sections:

```
Account: Orders | Saved Items | Settings
Catalog: [Filters in sidebar / top bar]
```

**Rule:** Use the shadcn/ui `<Tabs>` component for in-page section switching. Tab labels MUST be consistent with the primary nav item they belong to.

### 7.2 Admin Navigation

> **Important:** The admin interface is **desktop-only** (>= 1024px viewport). Mobile admin access is not officially supported. All admin navigation rules apply to desktop viewports only. *(Decision: 2026-04-04)*

#### Sidebar Structure (7 Items)

```
SIDEBAR
├── Dashboard (rank 0)          [House]
├── Auction Blocks (rank 1)     [ChatBubbleLeftRight]
├── Orders (rank 2)             [CurrencyDollar]
├── Catalog (rank 3)            [FolderOpen]         ← Hub
├── Marketing (rank 4)          [EnvelopeSolid]       ← Hub
├── Operations (rank 5)         [CogSixTooth]         ← Hub
└── AI Assistant (rank 6)       [Sparkles]
```

#### Hub Pages

Hub pages (Catalog, Marketing, Operations) show sub-pages as a card grid:

```
Grid:       gridTemplateColumns: repeat(3, 1fr), gap: 16
Card:       #fff, border 1px C.border, borderRadius: S.radius.xl
Card Hover: borderColor: C.text, boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
```

**Sub-pages per hub:**

| Hub | Sub-Pages |
|-----|-----------|
| Catalog | Media, Musicians, Entity Content |
| Marketing | Newsletter, Emails, CRM, Content, Gallery, Waitlist |
| Operations | Live Monitor, System Health, Shipping, Sync, Test Runner, Configuration |

#### Navigation Rules

1. **Standalone pages** (Dashboard, Auction Blocks, Orders, AI Assistant): MUST have `defineRouteConfig` with `rank` and `icon`.
2. **Hub pages** (Catalog, Marketing, Operations): MUST have `defineRouteConfig` with `rank` and `icon`. Their page content is a card grid of sub-pages.
3. **Sub-pages** (Media, CRM, Shipping, etc.): MUST NOT have `defineRouteConfig`. They are reachable via URL but not visible in the sidebar.
4. **Sub-page back navigation:** MUST call `useAdminNav()` which renders a back-arrow link to the parent hub.

**Rule:** A page MUST NOT appear both as a sidebar item AND as a hub card. If it has `defineRouteConfig`, it MUST NOT appear as a card in any hub.

#### Current Violations to Fix

| Page | Problem | Fix |
|------|---------|-----|
| CRM (`/app/crm`) | Has `defineRouteConfig` with label "Customers" | Remove `defineRouteConfig` |
| Configuration (`/app/config`) | Has `defineRouteConfig` | Remove `defineRouteConfig` |
| Waitlist (`/app/waitlist`) | Has `defineRouteConfig` | Remove `defineRouteConfig` |

---

## 8. Tables & Data-Heavy Interfaces

### 8.1 Admin Tables

#### Desktop Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Search input]                    [Filter dropdown] [Export btn]   │
├─────────────────────────────────────────────────────────────────────┤
│  LOT #    TITLE        ARTIST       BIDS    PRICE    STATUS        │  ← Header (T.micro)
├─────────────────────────────────────────────────────────────────────┤
│  001      Example LP   Example      3       €25.00   ● Active      │  ← Data row (T.body)
│  002      Other LP     Other        0       €10.00   ○ Draft       │
│  ...                                                                │
├─────────────────────────────────────────────────────────────────────┤
│  Showing 1-50 of 1,234                          [Prev]  [Next]     │  ← Pagination
└─────────────────────────────────────────────────────────────────────┘
```

**Styles:**
```
Container:    border: 1px solid C.border, borderRadius: S.radius.lg, overflow: hidden
Header row:   background: C.card, padding: S.cellPadding
Header text:  T.micro (10px, 700, uppercase, C.muted)
Data row:     borderBottom: 1px solid C.border, padding: S.cellPadding
Data text:    fontSize: 13, color: C.text
Row hover:    background: C.hover
Row click:    cursor: pointer (if row is clickable)
```

**Rules:**
- Column headers MUST use `T.micro` (uppercase, 10px, 700). No other header style.
- Numeric columns (prices, counts, IDs) MUST be right-aligned. Text columns left-aligned.
- Money values MUST use `fmtMoney()` for consistent EUR formatting.
- Date values MUST use `fmtDate()` or `fmtDatetime()` — never raw ISO strings.
- Boolean columns: use colored dot or Badge, not "true"/"false" text.
- Empty cells MUST show `—` (em dash), not blank space.
- Table MUST NOT have horizontal scroll on desktop (>= 960px). Reduce columns or use ellipsis if needed.

#### Pagination

```
Layout:     flex, space-between, padding: 12px S.cellPadding
Left text:  T.small — "Showing 1-50 of 1,234"
Right:      Prev/Next buttons (ghost variant)
```

**Rules:**
- Page size: 50 rows default for admin tables.
- Prev button MUST be disabled on first page. Next MUST be disabled on last page.

#### Load More vs. Pagination

**Rule:** A page MUST use ONE navigation pattern — either pagination OR "Load More". MUST NOT show both simultaneously.

- **Pagination** (default): Page numbers + prev/next. Best for SEO and direct page access.
- **Load More**: "Load More (N items)" button. Best for browsing/discovery flows.
- **MUST NOT:** Show a "Load More" button AND full pagination on the same page. This creates user confusion about which to use. *(Finding: GAP-1008)*

#### Data Display in Tables

**Rule:** Tables MUST NOT display raw JSON objects in cells. Data must be formatted:
- JSON change logs → show summary ("4 changes, 2 images") with expandable detail on click
- Long text → truncate with ellipsis, show full text in tooltip or expanded row
- Dates → formatted with `fmtDate()` or `fmtDatetime()`, never raw ISO strings
- Numbers → formatted with locale (`fmtNum()`, `fmtMoney()`)
- *(Finding: GAP-1108)*
- Total count MUST always be visible.
- "Load More" is acceptable for append-style lists. Full pagination is required for tables.

#### Sorting

- Clickable column headers with directional indicator (arrow up/down).
- Default sort MUST be clearly indicated.
- Sort state MUST persist across pagination.

### 8.2 Storefront Tables

Storefront SHOULD avoid tables for user-facing content. Instead use:

| Data Type | Storefront Pattern |
|-----------|--------------------|
| Product listing | Card grid |
| Order history | Stacked cards with key info |
| Bid history | Stacked list with bid amount + timestamp |
| Account details | Key-value pairs with label/value rows |

**Rule:** If a table is absolutely necessary on storefront (e.g., tracking details), it MUST be responsive. Below `md`, convert to a stacked "label: value" format per row.

### 8.3 Admin Table — Mobile Fallback (>= 768px)

While admin is primarily desktop, tables SHOULD degrade gracefully:

**Below 960px:** Hide non-essential columns. Priority order:
1. Primary identifier (name, title, order number) — always visible
2. Status badge — always visible
3. Primary metric (amount, price) — visible if room
4. Dates, secondary text — hidden

**Below 768px:** Convert to stacked card layout:
```
┌────────────────────────┐
│  Title / Name          │
│  Status ● Active       │
│  Price  €25.00         │
│  Date   02 Apr 2026    │
└────────────────────────┘
```

### 8.4 Filtering

**Admin Filters:**
- Search: text input with debounced search (300ms delay).
- Status filter: `<select>` dropdown with "All" default.
- Date range: two date inputs (from/to).
- Filters MUST be above the table, in a single row on desktop.
- Active filters MUST show a "Clear filters" link/button.

**Storefront Catalog Filters:**
- Mobile: filter sheet/modal triggered by "Filter" button, sticky at bottom.
- Desktop: sidebar or top bar with inline filter controls.
- Active filters MUST be shown as removable badges/chips.
- Filter changes MUST update the URL (query params) for shareability.

---

## 9. Mobile-First UX Rules

### 9.1 Touch Targets

| Element | Minimum Size | Minimum Gap |
|---------|-------------|-------------|
| Buttons | 44x44px | 8px |
| Links (in text) | 44px height (via padding) | — |
| Checkboxes / Radios | 44x44px tap area | 12px |
| Table rows (if tappable) | 44px row height | — |
| Icon buttons | 44x44px (size-10 + padding) | 8px |

**Rule:** Interactive elements below 44x44px MUST have expanded tap areas via padding or `::after` pseudo-elements. This is non-negotiable for accessibility.

### 9.2 Thumb Zone Optimization

On phones held one-handed, the bottom third of the screen is the easiest to reach.

**Rules:**
- Primary CTAs ("Place Bid", "Add to Cart", "Checkout") MUST be in the bottom 60% of the viewport OR use a sticky bottom bar on mobile.
- Navigation/back buttons are acceptable at the top (users expect them there).
- Destructive actions MUST NOT be in the easy-reach zone to prevent accidental taps.

### 9.3 Sticky Bottom Actions (Mobile)

For pages with a primary action:

```
┌────────────────────────────┐
│ [Content scrolls here]     │
│                            │
│                            │
├────────────────────────────┤
│ €25.00      [Place Bid]    │  ← sticky bottom-0, bg-card, border-t, p-4
└────────────────────────────┘
```

**Style:**
```
fixed bottom-0 left-0 right-0
bg-card/95 backdrop-blur-xl
border-t border-border
p-4
z-40
```

**Rules:**
- Sticky bottom bar MUST only appear on mobile (`md:hidden`).
- Content below MUST have sufficient `pb-24` (96px) to prevent the bar from covering content.
- Sticky bar MUST NOT contain more than 2 elements (price/info + CTA button).

### 9.4 Reduced Complexity on Mobile

| Desktop | Mobile Equivalent |
|---------|-------------------|
| Multi-column grid | Single column |
| Sidebar + content | Content only, filters in sheet |
| Data table | Stacked cards |
| Modal dialog | Full-screen sheet or bottom sheet |
| Hover tooltips | Tap to reveal / inline text |
| Complex date pickers | Native `<input type="date">` |

**Rules:**
- Sidebars MUST collapse on mobile — `hidden md:block`.
- Modals on mobile (< 768px) SHOULD convert to bottom sheets.
- Long forms on mobile MUST break into steps/sections with clear progress.

### 9.5 Mobile Modal Behavior

**Storefront dialogs on mobile:**
- Width: `w-full` (no max-width constraint)
- Position: `bottom-0` anchored, slides up
- Radius: `rounded-t-2xl` (top corners only)
- Max height: `max-h-[85vh]` with overflow scroll
- Close: swipe down gesture + X button + overlay tap

**Admin modals on mobile:**
- Maintain center positioning but reduce `maxWidth` to `calc(100vw - 32px)`
- `maxHeight: 90vh`
- Scrollable body

---

## 10. Accessibility Standards

### 10.1 Contrast Ratios

| Context | Minimum Ratio | Standard |
|---------|--------------|----------|
| Normal text on background | 4.5:1 | WCAG AA |
| Large text (18px+ or 14px+ bold) | 3:1 | WCAG AA |
| UI components and graphics | 3:1 | WCAG AA |
| Enhanced (optional target) | 7:1 / 4.5:1 | WCAG AAA |

**Verified ratios (Storefront):**
- `--foreground` (#f5efe6) on `--background` (#1c1915): 12.8:1 (passes AAA)
- `--primary` (#d4a54a) on `--background` (#1c1915): 6.8:1 (passes AA, nearly AAA)
- `--muted-foreground` (#a09888) on `--background` (#1c1915): 4.7:1 (passes AA)
- `--destructive` (#ef4444) on `--background` (#1c1915): 5.2:1 (passes AA)

**Rule:** Before introducing any new color combination, check contrast with WebAIM Contrast Checker. Combinations below 4.5:1 for normal text are forbidden.

### 10.2 Focus States

**Storefront:**
```css
a:focus-visible, button:focus-visible {
  outline: 2px solid #d4a54a;
  outline-offset: 2px;
  border-radius: 4px;
}
```

**Admin:**
```
Input focus: borderColor: C.gold
Button focus: Standard browser focus ring (outline)
```

**Rules:**
- Every interactive element MUST have a visible focus indicator.
- Focus indicators MUST use gold (`--ring` / `C.gold`) for brand consistency.
- Focus indicators MUST NOT be removed (`outline: none` without replacement is forbidden).
- Focus MUST be visible on both keyboard navigation (Tab) and programmatic focus.
- Use `:focus-visible` (not `:focus`) to avoid showing focus rings on mouse clicks.

### 10.3 Keyboard Navigation

| Action | Key | Expected Behavior |
|--------|-----|-------------------|
| Move focus forward | Tab | Next interactive element |
| Move focus backward | Shift+Tab | Previous interactive element |
| Activate button/link | Enter / Space | Trigger click |
| Close modal/dialog | Escape | Close and return focus to trigger |
| Navigate tabs | Arrow Left/Right | Switch tab |
| Navigate dropdown | Arrow Up/Down | Move selection |
| Submit form | Enter (in input) | Submit if single-field or explicit submit |

**Rules:**
- Tab order MUST follow visual order (top-to-bottom, left-to-right).
- Modals MUST trap focus — Tab should not escape the modal.
- After a modal closes, focus MUST return to the element that opened it.
- Skip-to-content link: MUST be the first focusable element, visible on focus.

### 10.4 Screen Reader Support

**Rules:**
- All images MUST have `alt` attributes. Product images: descriptive (`alt="Album cover: [title] by [artist]"`). Decorative images: `alt=""` with `aria-hidden="true"`.
- Icons used as buttons MUST have `aria-label` (e.g., `aria-label="Save to favorites"`).
- Status changes (bid placed, outbid, timer update) MUST use `aria-live="polite"` regions.
- Form errors MUST be associated with fields via `aria-describedby`.
- Loading states MUST use `aria-busy="true"` on the container.
- Page titles MUST be set via `<title>` element for every route.
- Landmark regions: `<header>`, `<nav>`, `<main>`, `<footer>` MUST be present.

### 10.5 Semantic HTML Structure

```html
<body>
  <header>        <!-- Site header -->
    <nav>         <!-- Primary navigation -->
  </header>
  <main>          <!-- Page content -->
    <h1>          <!-- Exactly one per page -->
    <section>     <!-- Logical content sections -->
      <h2>
      <article>   <!-- Repeating content items -->
  </main>
  <footer>        <!-- Site footer -->
    <nav>         <!-- Footer navigation -->
  </footer>
</body>
```

**Rules:**
- MUST use `<button>` for actions and `<a>` for navigation. `<div onClick>` is forbidden for interactive elements.
- MUST NOT use `<div>` or `<span>` where a semantic element exists (`<nav>`, `<article>`, `<section>`, `<aside>`, `<time>`).
- Lists of items MUST use `<ul>/<ol>` + `<li>`. Grid of cards = `<ul>` with `<li>` children.
- Time values MUST use `<time datetime="...">`.

### 10.6 Reduced Motion

Already implemented in `globals.css`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Rule:** This media query MUST remain in globals.css and MUST NOT be overridden. All Framer Motion animations SHOULD check `useReducedMotion()` hook and skip animations accordingly.

---

## 11. Tone of UI

### 11.1 General Voice

The platform speaks with the voice of a knowledgeable record dealer: confident, concise, professional, and passionate about the product. Not corporate, not casual.

- **Confident:** "Your bid has been placed" (not "We think your bid might have been placed")
- **Concise:** 3-5 words for actions, 1 sentence for descriptions
- **Professional:** No slang, no exclamation marks in system messages
- **Domain-aware:** Use "lot", "bid", "condition", "pressing" — not generic e-commerce terms

### 11.2 Button Labels

| Action | Label | NOT |
|--------|-------|-----|
| Submit a bid | "Place Bid" | "Submit", "OK", "Go" |
| Add to cart | "Add to Cart" | "Buy", "Purchase Now" |
| Save for later | (heart icon only) | "Save", "Bookmark" |
| Start checkout | "Checkout" | "Pay", "Buy Now" |
| Complete payment | "Pay Now" | "Submit Payment", "Complete Order" |
| Cancel action | "Cancel" | "Go Back", "Never mind" |
| Delete item | "Remove" (soft) / "Delete" (hard) | "Trash", "Kill" |
| Apply filter | "Apply" | "Search", "Go", "Filter" |
| Clear filters | "Clear All" | "Reset", "Remove Filters" |
| Load more items | "Load More" | "Show More", "See More" |
| Admin: Save settings | "Save Changes" | "Update", "Apply", "OK" |
| Admin: Create new | "Create [noun]" | "Add New", "New", "+" (alone) |

**Rule:** Button labels MUST be verb + noun (or verb alone for obvious context). Max 3 words. Capitalize each word (Title Case).

### 11.3 Help Text & Descriptions

- Placed below the label, above the input: `text-xs text-muted-foreground`.
- Phrased as instructions: "Enter the amount you are willing to pay" (not "This is where you enter...").
- No periods at the end of single-line help text.
- Max 1 sentence. If more explanation is needed, link to documentation.

### 11.4 Error Messages

| Error Type | Pattern | Example |
|------------|---------|---------|
| Required field | "[Field] is required" | "Email address is required" |
| Invalid format | "[Field] must be [format]" | "Email must be a valid email address" |
| Too short | "[Field] must be at least [N] characters" | "Password must be at least 8 characters" |
| Too long | "[Field] cannot exceed [N] characters" | "Name cannot exceed 100 characters" |
| Out of range | "[Field] must be between [min] and [max]" | "Bid must be between EUR 1.00 and EUR 10,000.00" |
| Network error | "Something went wrong. Please try again." | — |
| Conflict | "This [noun] already exists" | "This email is already registered" |
| Permission | "You must be signed in to [action]" | "You must be signed in to place a bid" |

**Rules:**
- Error messages MUST name the field they refer to.
- Error messages MUST explain what is wrong AND how to fix it.
- Error messages MUST NOT blame the user: "Invalid input" is forbidden. Say "Email must be a valid email address".
- Network errors MUST offer a retry option.

### 11.5 Empty States

| Context | Title | Description |
|---------|-------|-------------|
| No auction blocks | "No Active Auctions" | "Check back soon for new curated lots." |
| No search results | "No Results Found" | "Try different search terms or adjust your filters." |
| Empty cart | "Your Cart Is Empty" | "Browse the catalog to find something you like." |
| No saved items | "No Saved Items" | "Tap the heart icon on any item to save it here." |
| No orders | "No Orders Yet" | "Your completed purchases will appear here." |
| No bids | "No Bids Yet" | "Be the first to bid on this lot." |
| Admin: No data | "[Noun] will appear here" | "[Description of what triggers content]" |

**Rules:**
- Empty states MUST have a title and a description.
- Empty states SHOULD have a CTA that leads to the action that would populate the list.
- Empty states MUST NOT show raw "No data" or "0 results" without context.

**Compact vs. Full Empty States:**
- **Compact** (inline, on pages with other content): Single line or slim banner, max 150px height. MUST include CTA. Example: Homepage "no active auctions" → slim banner + "Browse 32,000+ Releases" button. *(Finding: GAP-1005)*
- **Full** (standalone, when the entire page is empty): Card with icon, title, description, CTA. May use illustration. Example: Empty cart page.
- **MUST NOT:** Use full-page empty state containers (200px+ height) for inline empty sections on otherwise populated pages.

### 11.6 Confirmation Dialogs

For destructive actions:

```
Title:       "Remove [item]?"
Description: "This will [consequence]. This action cannot be undone."
Cancel:      "Cancel" (outline/ghost)
Confirm:     "Remove" (destructive)
```

**Rules:**
- Confirmation dialog MUST name the specific item being affected.
- Confirmation dialog MUST state the consequence.
- The destructive action button MUST use `destructive` variant (red).
- The cancel button MUST be left, confirm MUST be right.

### 11.7 Loading States

| Duration | UI Treatment |
|----------|-------------|
| 0-100ms | No indicator (instant feel) |
| 100ms-1s | Button shows spinner, disables click |
| 1s-3s | Skeleton loaders for content areas |
| 3s+ | Progress bar or percentage indicator |

**Rule:** Loading indicators MUST NOT flash. Use `useTransition` or a minimum display time of 300ms.

---

## 12. Concrete Implementation Rules

### 12.1 Hard Standards (MUST)

These rules are non-negotiable. Violations MUST be fixed before merge.

#### Storefront

| # | Rule | How to Verify |
|---|------|---------------|
| S1 | Every page has exactly one `<h1>` with `heading-1 font-serif` or `heading-hero font-serif` | Inspect DOM |
| S2 | All buttons use `<Button>` from `components/ui/button.tsx` | Grep for raw `<button` with class= |
| S3 | All inputs use `<Input>` from `components/ui/input.tsx` | Grep for raw `<input` with class= |
| S4 | All colors reference CSS custom properties — no hardcoded hex in components | Grep for `#[0-9a-f]{3,8}` in component files |
| S5 | Container uses `max-w-6xl px-6 mx-auto` | Visual check |
| S6 | Touch targets are >= 44x44px on mobile | Browser DevTools mobile audit |
| S7 | All images have `alt` attributes | Accessibility audit |
| S8 | No `<div onClick>` for navigation or primary actions | Grep for `div.*onClick` |
| S9 | `prefers-reduced-motion` is respected (via globals.css) | Test with system setting |
| S10 | Focus indicators visible on all interactive elements | Tab through page |

#### Admin

| # | Rule | How to Verify |
|---|------|---------------|
| A1 | Every page uses `<PageShell>` wrapper | Grep for `PageShell` in page files |
| A2 | Every page uses `<PageHeader>` as first element | Grep for `PageHeader` in page files |
| A3 | All colors reference `C.*` — no hardcoded hex in page files | Grep for `#[0-9a-f]{3,8}` in route files |
| A4 | All typography uses `T.*` tokens | Grep for `fontSize:` not using T.* |
| A5 | Sub-pages do NOT have `defineRouteConfig` | Grep for `defineRouteConfig` in sub-page files |
| A6 | Sub-pages call `useAdminNav()` | Grep for `useAdminNav` in sub-page files |
| A7 | Empty lists show `<EmptyState>` component | Visual check |
| A8 | Mutating actions trigger `<Toast>` | Test create/update/delete flows |
| A9 | Tabs use `<Tabs>` component from `admin-layout.tsx` | Grep for custom tab implementations |
| A10 | Tables use `T.micro` for headers and `S.cellPadding` for cells | Visual check |

### 12.2 Forbidden Patterns (MUST NOT)

| # | Pattern | Why It's Forbidden | Fix |
|---|---------|-------------------|-----|
| F1 | `<div onClick>` for navigation | Not keyboard-accessible, no semantic meaning | Use `<a>` for links, `<button>` for actions |
| F2 | `outline: none` / `outline: 0` without replacement | Removes focus indicator for keyboard users | Use `:focus-visible` with gold outline |
| F3 | Hardcoded colors in storefront components | Breaks theming, causes inconsistency | Use CSS custom properties |
| F4 | Hardcoded colors in admin page files | Breaks design system, causes drift | Use `C.*` tokens |
| F5 | `defineRouteConfig` on admin sub-pages | Creates duplicate sidebar + hub-card entries | Remove from sub-pages |
| F6 | Custom header markup in admin pages | Inconsistent headers, visual drift | Use `<PageHeader>` component |
| F7 | `font-serif` on body text, labels, or buttons | Serif is reserved for headings only | Use `font-sans` (default) |
| F8 | `!important` in component styles | Overrides system styles unpredictably | Fix specificity properly |
| F9 | `type="number"` for money or IDs | Browser spinners cause input errors | Use `type="text"` with `inputMode` |
| F10 | Placeholder text as field label | Disappears on input, accessibility violation | Use visible `<label>` element |
| F11 | Inline CSS in storefront components | Breaks Tailwind system, unmaintainable | Use Tailwind classes |
| F12 | Tailwind classes in admin page files | Conflicts with Medusa shell, breaks inline system | Use inline CSS with tokens |
| F13 | Alert/confirm dialogs (browser native) | Inconsistent UX, blocks thread | Use `<Dialog>` or `<Modal>` components |
| F14 | `cursor: pointer` on non-interactive elements | Misleads users about interactivity | Only on buttons, links, clickable rows |
| F15 | Horizontal scroll on mobile | Content is inaccessible, frustrating | Reduce content or use alternative layout |

### 12.3 Red Flags (Review Triggers)

These patterns are not always wrong but MUST be reviewed and justified:

| Flag | Concern | Review Question |
|------|---------|----------------|
| Component file > 300 lines | Complexity | Can this be split into sub-components? |
| More than 2 `useEffect` hooks | Side effect complexity | Can effects be consolidated or moved to a custom hook? |
| Nested ternary in JSX | Readability | Should this be a separate component or helper function? |
| `z-index` > 50 (storefront) / > 10000 (admin) | Stacking context | Is this necessary? Does it conflict with existing layers? |
| Custom animation not in `motion.ts` | Animation sprawl | Should this be added to the shared presets? |
| Any component importing from `admin-tokens.ts` in storefront (or vice versa) | Cross-system leakage | Systems are separate. Use the correct token source. |
| `// TODO` or `// FIXME` | Deferred work | Is this tracked in Linear? |
| Magic numbers (pixel values without token reference) | Design system drift | Can this use an existing token? |

### 12.4 Priority Order for Fixes

When auditing or refactoring, fix issues in this order:

1. **Accessibility violations** — contrast failures, missing alt text, broken keyboard nav
2. **Functionality bugs** — broken interactions, missing states, dead buttons
3. **Consistency violations** — hardcoded colors, custom headers, non-standard spacing
4. **Mobile UX issues** — touch targets, thumb zone, horizontal scroll
5. **Performance issues** — large bundles, unnecessary re-renders, missing skeletons
6. **Visual polish** — alignment, spacing fine-tuning, animation timing

### 12.5 New Component Checklist

Before creating a new component, verify:

- [ ] No existing component can serve this purpose (with variants/props)
- [ ] Component uses tokens exclusively (no hardcoded values)
- [ ] Component defines all states: default, hover, focus, disabled, loading, error
- [ ] Component works at all relevant breakpoints (mobile/tablet/desktop)
- [ ] Component has accessible markup (semantic HTML, ARIA if needed)
- [ ] Component handles empty/null data gracefully
- [ ] Component is documented in this guide (if shared/reusable)

### 12.6 File References

#### Storefront Token Sources

| File | Content |
|------|---------|
| `storefront/src/app/globals.css` | CSS custom properties, typography classes, scrollbar, focus styles, reduced motion |
| `storefront/src/app/layout.tsx` | Font loading (DM Serif Display, DM Sans), global structure |
| `storefront/src/lib/motion.ts` | Framer Motion animation presets |
| `storefront/src/components/ui/` | shadcn/ui components (Button, Badge, Card, Input, Dialog, etc.) |
| `storefront/src/lib/utils.ts` | `cn()` utility for Tailwind class merging |

#### Admin Token Sources

| File | Content |
|------|---------|
| `backend/src/admin/components/admin-tokens.ts` | Colors (`C`), Typography (`T`), Spacing (`S`), Badge styles, Formatters |
| `backend/src/admin/components/admin-layout.tsx` | PageHeader, SectionHeader, PageShell, Tabs, StatsGrid, Divider |
| `backend/src/admin/components/admin-ui.tsx` | Badge, Toggle, Toast, Alert, EmptyState, Btn, ConfigRow, Input styles, Modal |
| `backend/src/admin/components/admin-nav.tsx` | Sidebar navigation, back-nav for sub-pages |

### 12.7 Email Design Tokens

Transactional emails use inline CSS with the Vinyl Culture palette:

| Element | Value |
|---------|-------|
| Background | `#0d0b08` |
| Container | `#1c1915` |
| Border | `#2a2520` |
| Gold CTA | `#d4a54a` |
| Text | `#e8e0d4` |
| Muted | `#a39d96` |
| Font | `'DM Sans', -apple-system, sans-serif` |
| Max Width | 600px |
| Layout | Outlook-safe table-based |

**Rule:** Emails MUST use inline CSS only. No CSS classes, no external stylesheets. Test in Litmus or Email on Acid before deploying new templates.

---

## Appendix A: Superseded Documents

This document supersedes:

- `docs/DESIGN_GUIDE_FRONTEND.md` (v1.0, 2026-04-02) — Storefront-only design reference
- `docs/DESIGN_GUIDE_BACKEND.md` (v2.0, 2026-04-02) — Admin-only design reference

Both documents remain in the repository for historical reference but are no longer authoritative. In case of conflict, this Unified UI/UX Style Guide takes precedence.

---

## Appendix B: Custom Scrollbar

Storefront custom scrollbar (pointer devices only):

```css
@media (pointer: fine) {
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(232, 224, 212, 0.12); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(232, 224, 212, 0.2); }
}
```

**Rule:** Scrollbar styling MUST only apply to pointer devices (`@media (pointer: fine)`). Touch devices use native scrollbars.

---

## Appendix C: Z-Index Scale

### Storefront

| Layer | Z-Index | Usage |
|-------|---------|-------|
| Base content | 0 | Default |
| Sticky elements | 10 | Sticky sidebar filters |
| Floating actions | 20 | FAB, sticky bottom bar |
| Dropdown/popover | 30 | Select dropdowns, tooltips |
| Mobile nav overlay | 40 | Sheet backdrop |
| Header | 50 | Sticky header |
| Modal overlay | 60 | Dialog backdrop |
| Modal content | 70 | Dialog content |
| Toast | 80 | Toast notifications |

### Admin

| Layer | Z-Index | Usage |
|-------|---------|-------|
| Base content | auto | Default |
| Toast | 9999 | Toast notifications |
| Modal overlay | 10000 | Modal backdrop |
| Modal content | 10001 | Modal dialog |

**Rule:** Z-index values MUST use this scale. No arbitrary z-index values. If a new layer is needed, add it to this table first.

---

---

## Appendix D: Visual Audit Reference

This style guide v2.0 was validated against 170+ live screenshots of the production platform:

| Source | Count | Viewport | Tool |
|--------|-------|----------|------|
| Desktop Storefront | 48 screenshots | 1440px (Safari) | Manual |
| Mobile Storefront | 60+ screenshots | 390px (iPhone) | Manual |
| Desktop Admin | 60 screenshots | 1440px (Safari) | Manual |
| Mobile Admin | 40 screenshots | 390px (iPhone) | Manual |

All findings documented in:
- `docs/UI_UX_GAP_ANALYSIS.md` — 53 findings (8 critical, 16 high, 24 medium, 5 low)
- `docs/UI_UX_OPTIMIZATION_PLAN.md` — Prioritized implementation roadmap

Screenshots archived in `/Screenshots/` directory (Desktop PNGs + Mobile PDFs + Backend Desktop folder).

---

*This document is the binding reference for all storefront and admin development. Every new component, page, and feature MUST comply with these standards. Deviations require explicit approval and documentation.*

*Version 2.0 — 2026-04-04 — Robin Seckler*
