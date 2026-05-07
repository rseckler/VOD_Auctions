# VOD Auctions — Design Briefing (Compact)

**Purpose:** Paste-ready Kurz-Briefing für Claude Design / Stitch / einmalige UI-Sessions.
Destilliert aus `UI_UX_STYLE_GUIDE.md` v2.0 (1.888 Zeilen). Bei Konflikten gewinnt der Style Guide.
**Updated:** 2026-05-05

---

## 1. Brand & Vibe

**Name:** VOD Auctions (vod-auctions.com) — Auktionsplattform für ~41.500 Industrial-Music-Tonträger + Literatur/Merch.
**Owner-Persona:** Frank, 30 Jahre Industrial-Records-Label, kuratiert. Sammler-Publikum, kein Massenmarkt.
**Design-Sprache:** "Vinyl Culture" — warm-dunkel, sophisticated, ruhig, premium, kein Tech-Glanz. Eher *Independent-Label-Backstage* als *Etsy* oder *Discogs*.

**Tonal anchors:**
- restrained, credible, mature, product-grade
- nicht: improvisiert, dekorativ, template-haft, laut

**Stack (verbindlich):** Next.js 16 App Router · React 19 · Tailwind CSS 4 · shadcn/ui · Framer Motion · TypeScript 5.

---

## 2. Design Principles (Priorität top → bottom)

1. **Consistency** — Gleiche Funktion = gleiches Aussehen. Tokens sind die einzige Wahrheitsquelle. Hardcoded Werte verboten.
2. **Simplicity** — Eine primäre Aktion pro Screen. Max 3 Hierarchie-Ebenen pro View. Vor neuer Komponente prüfen, ob bestehende reicht.
3. **Visual Hierarchy** — Wichtigstes Element in 2 s erkennbar. Hierarchie via Größe → Gewicht → Farbe → Spacing (in dieser Reihenfolge). **Genau ein Gold-CTA pro Viewport.**
4. **Accessibility** — WCAG 2.1 AA. Mind. 4.5:1 Kontrast. Sichtbare Focus-States. Vollständig keyboard-bedienbar. A11y ist non-negotiable.
5. **Responsiveness** — Storefront 320 – 2560 px (mobile-first). Admin desktop-only ≥ 1024 px.
6. **Feedback** — Jede User-Aktion bekommt sichtbare Reaktion ≤ 100 ms. "Nichts passiert" ist die schlechteste UX.
7. **Touch Optimization** — Auktions-Bidding läuft auf Smartphones. Primäre Aktionen in den unteren 60 % des Viewports. Touch-Targets ≥ 44×44 px. Keine hover-only Interaktionen.

---

## 3. Color Tokens (Storefront — Dark Theme)

**Core Palette (CSS Custom Properties in `globals.css`):**

| Token | Hex | Zweck |
|---|---|---|
| `--background` | `#1c1915` | Page-Hintergrund (warm-dunkel, nicht schwarz) |
| `--foreground` | `#f5efe6` | Primär-Text (cremig, nicht weiß) |
| `--card` | `#241f1a` | Card-Hintergrund |
| `--secondary` / `--muted` | `#2a2520` | Buttons sekundär, gedämpfte Bereiche |
| `--muted-foreground` | `#a09888` | Sekundär-Text, Platzhalter, Timestamps |
| `--input` | `#302a22` | Input-Hintergrund |
| `--border` | `rgba(232,224,212,0.08)` | Subtle Borders |
| `--primary` (Gold) | `#d4a54a` | CTAs, Links, Active-States, Focus-Ring |
| `--primary-foreground` | `#1c1915` | Text auf Gold |
| `--destructive` | `#ef4444` | Errors, Delete-Actions |
| `--ring` | `#d4a54a` | Focus-Ring (Gold) |

**Status / Bid:**

| Token | Hex | Zweck |
|---|---|---|
| `--status-active` / `--bid-winning` | `#4ade80` | Live, Winning Bid |
| `--status-scheduled` | `#a09888` | Upcoming |
| `--status-ended` | `#71717a` | Archived |
| `--status-preview` / `--bid-outbid` | `#f97316` | Outbid, Warning |

**Format-Badges:** Vinyl `#d4a54a` · CD `#38bdf8` · Cassette `#a855f7`.

**Condition-Badges (Vinyl Grading):** 3-Layer-Approach (semi-transparent bg + opaque text + semi-transparent border).

| Condition | Klassen |
|---|---|
| M / NM | `bg-green-500/15 text-green-400 border-green-500/20` |
| VG+ / VG | `bg-amber-500/15 text-amber-400 border-amber-500/20` |
| G+ / G | `bg-orange-500/15 text-orange-400 border-orange-500/20` |
| F / P | `bg-red-500/15 text-red-400 border-red-500/20` |

**Forbidden:**
- Reines `#fff` für Text (zu hart auf dark) → `--foreground`
- Reines `#000` als Background (zu kalt) → `--background`
- Jede Farbe < 4.5:1 Kontrast auf `--background`

**Color-Use-Rules:**
- 1 Gold-CTA pro Viewport. Zweite Aktion = secondary/ghost.
- Rot = nur destructive. Niemals für Preise oder Emphasis.
- Grün = nur success/active.
- Orange = nur warning/attention.
- Farbe trägt nie alleine Bedeutung — immer mit Label oder Icon.

---

## 4. Typography

**Fonts (via `next/font/google`):**

| Font | CSS-Var | Tailwind | Usage |
|---|---|---|---|
| **DM Serif Display** | `--font-dm-serif` | `font-serif` | Hero, H1, H2 (NUR diese 3) |
| **DM Sans** | `--font-dm-sans` | `font-sans` | Alles andere — Body, Labels, Buttons, H3 |

**Scale (Perfect Fourth, fluid via `clamp()`):**

| Klasse | Größe | Weight | Line-Height | Font |
|---|---|---|---|---|
| `.heading-hero` | 40 – 60 px | 400 | 1.1 | DM Serif |
| `.heading-1` | 30 – 36 px | 400 | 1.2 | DM Serif |
| `.heading-2` | 24 – 30 px | 400 | 1.25 | DM Serif |
| `.heading-3` | 18 – 20 px | 600 | 1.3 | DM Sans |
| Body | 14 px | 400 | 1.5 | DM Sans |
| Small | 12 px | 400 | 1.5 | DM Sans |
| Micro | 10 px | 700 | 1.4 | DM Sans (uppercase, 0.06em tracking) |

**Hard rules:**
- Genau **1 H1 pro Page** (`heading-1 font-serif` oder `heading-hero font-serif`).
- Heading-Reihenfolge semantisch (H1 → H2 → H3, nie überspringen).
- Serif **niemals** auf Body, Labels, Buttons.
- Serif-Headings immer Weight 400 (kein `font-bold`).
- Keine arbitrary text sizes (`text-[17px]` etc.) — nur die Scale.

---

## 5. Spacing & Layout

**Container (Storefront):** `max-w-6xl px-6 mx-auto` → Max 1280 px, 24 px Side-Padding. Keine Ausnahmen.

**Spacing-Scale (4px-Grid, CSS-Vars):**

| Token | px | Tailwind | Usage |
|---|---|---|---|
| `--space-xs` | 4 | `gap-1` | Inline-Gaps, Badge-Padding |
| `--space-sm` | 8 | `gap-2` | Tight zwischen verwandten Items |
| `--space-md` | 16 | `gap-4` | Standard |
| `--space-lg` | 24 | `gap-6` | Section-Padding, Card-Padding |
| `--space-xl` | 32 | `gap-8` | Zwischen Major-Sections |
| `--space-2xl` | 48 | `py-12` | Page-Section-Gaps |
| `--space-3xl` | 64 | `py-16` | Hero |

→ Werte außerhalb der Scale sind verboten. **`gap-*` für flex/grid, niemals `space-y-*`** (Tailwind v4 collapsed margins).

**Radius-Scale (Storefront):**

| Token | Tailwind | Usage |
|---|---|---|
| 6 px | `rounded` | Inputs, kleine Buttons |
| 8 px | `rounded-md` | Standard-Buttons |
| 10 px | `rounded-lg` | Standard-Cards |
| 14 px | `rounded-xl` | Große Cards |
| 18 px | `rounded-2xl` | Hero-Cards, Block-Cards |
| 9999 px | `rounded-full` | Badges, Avatars, Pills |

**Shadow-Scale (kalibriert für Dark-Theme — keine Tailwind-Defaults nutzen):**

| Token | Wert | Usage |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` | Cards at rest |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` | Elevated, Dropdowns |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.5)` | Modals, Overlays |
| `--shadow-gold` | `0 0 40px rgba(212,165,74,0.08)` | Featured Items |

**Breakpoints:**

| Name | px | Zweck |
|---|---|---|
| (base) | 0 – 639 | Phone Portrait — single column |
| `sm` | 640 | Phone Landscape |
| `md` | 768 | **Primary breakpoint** — Tablet, 2-col Grids |
| `lg` | 1024 | Desktop, 3-col Grids, Sidebar-Layouts |
| `xl` | 1280 | Wide Desktop, 4-col Catalog |

**Grid:**
- Product-Grid: `grid gap-6` · 1 col mobile · `md:grid-cols-2` · `lg:grid-cols-3` · `xl:grid-cols-4` (Catalog only)
- Auction-Block-Grid: 1 col mobile · `md:grid-cols-2`
- **Card-Grids immer CSS-Grid**, niemals `flex-wrap`. Flex nur für Inline/Toolbar.

**Page-Struktur (Storefront):**

```
Header (h-16, sticky top-0 z-50, backdrop-blur)
└── <main> max-w-6xl px-6 mx-auto pt-8 pb-16
    ├── Page Heading (heading-1 oder heading-hero)
    └── Content Sections (gap-8 dazwischen)
Footer (py-12, border-t border-border)
```

---

## 6. Komponenten — Pflicht-Set

**Verbindlich:** shadcn/ui-Komponenten in `components/ui/` nutzen. Keine raw `<button>`, `<input>`, `<select>` mit Custom-Klassen.

### Button (`components/ui/button.tsx`)

| Variant | Wofür |
|---|---|
| `default` (Gold) | Primary CTA — "Place Bid", "Add to Cart", "Pay Now" |
| `outline` | Secondary — "View Details", "See All" |
| `secondary` | Tertiary, Filter-Toggles |
| `ghost` | Minimal — Icon-Buttons, Nav-Links |
| `destructive` | Delete, Cancel, Remove |
| `link` | Inline-Text als Button |

Sizes: `xs` (24 px), `sm` (32 px), `default` (36 px), `lg` (40 px), `icon` (36×36 px) + Icon-Varianten.
**Mobile-CTA mind. `size="lg"`** für 44 px Touch-Target. Button-Labels max 2 – 3 Wörter.

### Input

- 36 px Höhe (`h-9`), `--input` Background, Border `--primary/25` (Gold 25 %)
- Focus: Gold-Ring `border-ring ring-[3px] ring-ring/50`
- Error: `aria-invalid="true"` → `border-destructive ring-destructive/20`
- **Mobile-Font 16 px** (verhindert iOS-Zoom), Desktop 14 px (`md:text-sm`)
- Money-Inputs: `type="text" inputMode="decimal"` + `parseAmount()`-Helper (Komma → Punkt, EU tippt Komma). **Niemals `type="number"` für Geld.**

### Card (`components/ui/card.tsx`)

- `rounded-xl border bg-card shadow-sm py-6 gap-6`
- Header `px-6` mit `font-semibold` Title (NIE `font-serif`) + `text-sm text-muted-foreground` Description
- Content `px-6`
- Footer `flex items-center px-6`
- **Cards nicht in Cards verschachteln. Cards haben kein Margin** — Spacing über Parent-Grid-Gap.

### Block-Card (Auktions-Block-Hauptelement)

- `rounded-2xl border bg-[rgba(232,224,212,0.04)]`
- Hover: `border-[rgba(212,165,74,0.4)] -translate-y-1`
- Image: `aspect-[16/10]`, hover `scale-105 transition-transform duration-500`
- Overlay-Badge: `top-3 left-3`, `bg-[rgba(28,25,21,0.85)] backdrop-blur-sm`
- Pflicht-Inhalt: Cover, Block-Title (serif), Item-Count, Status-Badge, Restzeit (wenn aktiv).

### Badge

- `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium`
- **Niemals klickbar** — Buttons benutzen wenn klickbar
- Max 1 – 2 Wörter
- Status-Badges immer mit Text-Label, nie Farbe alleine

### Dialog / Modal

- Overlay `bg-black/80`, max-w-lg zentriert, fade+zoom 0.2 s
- **Mobile (< 768 px) → Bottom-Sheet** (`bottom-0 w-full rounded-t-2xl`)
- Sichtbarer Close-Mechanismus (X oder Cancel)
- Keine scrollbaren Tabellen in Dialogen — separater Page

### Skeleton

- `bg-secondary` (`--muted: #2a2520`), `animate-pulse` (2 s, custom)
- Form approximiert geladenen Content
- Min-Display 300 ms (kein Flash)

### Save-for-Later (Heart-Button)

- 44×44 px (Touch-Compliance), `rounded-[10px]`
- Default `bg-primary/8 border-primary/25`, Hover `bg-primary/15 border-primary/40`, Saved `bg-primary/20 border-primary/50`
- Icon Heart outline → filled bei saved
- Optimistic UI auf Tap

### Direct-Purchase-Section (Sofortkauf — neben Bidding)

- `bg-primary/10 border border-primary/30 rounded-lg p-4`
- Preis: `text-2xl font-bold font-mono text-primary` (Mono für Alignment)
- Button → "Added"-State (grün, Checkmark) für 2 s, dann revert
- Visuell distinct von Bid-UI

---

## 7. Header & Footer

**Header (sticky, h-16, z-50):**
- BG `rgba(28,25,21,0.95) backdrop-blur-xl`, Border-Bottom `border-[rgba(232,224,212,0.1)]`
- Desktop: Logo links, Nav-Links zentriert (max 5), Search/Cart/Account rechts
- Mobile: Logo links, Hamburger rechts → Right-Side-Sheet `w-72`
- Logo: `Disc3` Icon mit Gradient `from-primary to-[#b8860b]`
- Active Link `text-foreground`, inactive `text-muted-foreground`
- Badge-Counter (Cart/Saved): `bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px]`, max "9+"

**Footer:**
- `py-12 border-t border-border`
- 3-Spalten Links Desktop, stacked Mobile
- Copyright unten, `text-xs text-muted-foreground`

---

## 8. Forms

**Storefront-Struktur:**
```
<form>                              (noValidate, eigene JS-Validation)
  <fieldset>
    <legend class="heading-3">      (optional Group-Title)
    <div class="space-y-4">         (16 px Gap zwischen Feldern)
      <Label>                       (sichtbar, text-sm font-medium)
      <Input>
      <p class="text-xs text-destructive mt-1">  (Error)
    </div>
  </fieldset>
  <div class="flex justify-end gap-3 mt-6">
    <Button variant="outline">Cancel</Button>
    <Button>Submit</Button>          (einziger Gold-Button im Form)
  </div>
</form>
```

**Validation-Timing:**
- On-Blur: Erstprüfung
- On-Change (nach erstem Error): live re-validate
- On-Submit: Alle Felder, Focus auf erstes invalid

**Hard rules:**
- Jedes Feld **sichtbares Text-Label** — Placeholder ist KEIN Label-Ersatz
- Mobile **immer Single-Column** (`grid-cols-1 md:grid-cols-3` für PLZ/City/Country, niemals 3 Inputs nebeneinander auf 375 px)
- Error-Messages spezifisch ("Email address is required", nicht "This field is required")
- Form-Level-Errors als `<Alert type="error">` über dem Form
- Kein roter Asterisk für Required → entweder "(optional)" oder default-required + "(optional)"-Marker

**Input-Types:**

| Datentyp | type | inputMode |
|---|---|---|
| Email | `email` | `email` |
| Phone | `tel` | `tel` |
| Money | `text` | `decimal` (format on blur) |
| Quantity | `text` | `numeric` + `pattern="[0-9]*"` |
| Search | `search` | `search` |

---

## 9. Navigation

**Storefront Primary (Header):** max 5 Items Desktop, mobile als Right-Sheet. Mobile-Sheet schließt auf Route-Change und Overlay-Tap.

**Breadcrumbs:** `text-sm text-muted-foreground` mit `>` Separator. Letztes Item `text-foreground` (nicht klickbar).
- Pflicht auf: Detail-Pages (Release, Artist, Label, Block-Detail)
- Verboten auf: Top-Level-Pages (Catalog-Listing, Auctions-Listing, Homepage)
- Position: zwischen Header und Page-Heading, `mb-4`

**Account-Mobile:** Sidebar (Overview, My Bids, Won, Saved, Cart, Checkout, Orders, Archive, Feedback, Settings, Profile, Addresses) MUSS auf Mobile collapsen → horizontale Tabs oder Dropdown. Niemals vertikale Liste auf Mobile.

---

## 10. Animation

**Framer Motion (`lib/motion.ts`):**

| Preset | Effekt | Duration | Usage |
|---|---|---|---|
| `fadeIn` | Opacity 0→1 | 0.4 s | Page-Fade |
| `fadeInUp` | Opacity + Y(20px)→0 | 0.5 s easeOut | Section-Entrance |
| `staggerContainer` | Stagger Children | 0.04 s/child | Grid/List-Container |
| `staggerItem` | Opacity + Y(8px)→0 | 0.2 s easeOut | Grid-Items |
| `scaleIn` | Scale 0.95→1 + Opacity | 0.3 s | Modal/Dialog |

**Hard rules:**
- Animation-Duration **niemals > 500 ms**
- Keine Custom-Spring-Physics — nur die Presets
- `prefers-reduced-motion` MUSS alle Animationen abschalten (in `globals.css` bereits drin)
- Pulse-Animation nur für Live-Auction-Indicator-Dot, sonst nichts

**CSS-Transitions (Token-Durations):**
- `--transition-fast` 150 ms (Micro-Interactions)
- `--transition-normal` 250 ms (State-Changes)
- `--transition-slow` 400 ms (Emphasis)

---

## 11. Mobile-First UX (Storefront)

- **Touch-Targets ≥ 44×44 px** (Apple HIG / WCAG 2.5.5), Gap zwischen Targets ≥ 8 px
- Primäre Aktionen in unteren 60 % des Viewports (Daumen-Zone)
- Kein horizontaler Scroll auf irgendeiner Viewport-Breite
- Sticky Mobile-Bid-CTA auf Release-Detail-Pages
- Catalog-Cards < 375 px: Year + Condition-Badge ausblenden, Title max 2 Zeilen, Artist 1 Zeile
- Inputs `inputMode` korrekt setzen (siehe oben)
- Keine hover-only Interaktionen — jeder Hover braucht Tap-Equivalent

---

## 12. Accessibility (WCAG 2.1 AA — Floor)

- Kontrast Text mind. 4.5:1, Large-Text (18 px / 14 px bold) mind. 3:1
- Sichtbare Focus-Indicators auf allen interaktiven Elementen (`focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`)
- Alt-Text auf allen Bildern; dekorative `alt=""` + `aria-hidden="true"`
- Skip-to-Content-Link
- ARIA-Live-Regions für dynamische Updates (Bid-Counter, Toast)
- Dialoge: Focus-Trap, Escape schließt, Focus-Return on close
- Heading-Hierarchie semantisch (H1→H2→H3, nie überspringen)
- Vollständig keyboard-bedienbar
- A11y wird **nicht** gegen visuelle Politur eingetauscht

---

## 13. Tone of UI (Microcopy)

- Sachlich, kuratiert, Sammler-Sprache. Kein Marketing-Lärm, keine Caps-Lock-CTA.
- Primary CTAs: kurz und konkret — "Place Bid", "Add to Cart", "Pay Now". Niemals "Click here", "Buy now!!!".
- Empty-States erklären Inhalt + nächsten Schritt — kein Blank-Screen.
- Error-Messages spezifisch + lösungsorientiert.
- Currency in EUR, immer mit Symbol `€`, Tausender-Format `€1,234.56` (DE-Variante in CMS-Bereichen).
- Daten via `fmtDate()` / `fmtDatetime()` aus Helpers — niemals raw ISO-Strings.

---

## 14. Implementation Anchors (Code)

Wenn Claude Design Code-Anker braucht:

- **Tokens:** `storefront/src/app/globals.css` (CSS Custom Properties + `@theme inline`)
- **Komponenten-Library:** `storefront/src/components/ui/` (shadcn/ui)
- **Motion-Presets:** `storefront/src/lib/motion.ts`
- **Referenz-Page (Hero + Grid + Block-Cards):** `storefront/src/app/auctions/[slug]/page.tsx`
- **Referenz-Detail-Page (Bid-UI + Direct-Purchase + Save):** `storefront/src/app/releases/[id]/page.tsx`
- **Layout / Header / Footer:** `storefront/src/app/layout.tsx`, `storefront/src/components/Header.tsx`, `storefront/src/components/Footer.tsx`

---

## 15. Hard NO's (häufige Verstöße)

- ❌ Hardcoded Hex-Werte irgendwo außer `globals.css` / `admin-tokens.ts`
- ❌ Raw `<button>` / `<input>` / `<select>` mit Custom-Klassen
- ❌ `space-y-*` für Card-Listen (Tailwind v4 collapsed margins) → `flex flex-col gap-N`
- ❌ `font-serif` auf Body, Labels, Buttons, H3
- ❌ `font-bold` auf DM-Serif-Headings (visuelle Artefakte)
- ❌ Mehr als 1 Gold-CTA pro Viewport
- ❌ Rot für Preise oder Emphasis (nur destructive)
- ❌ Farbe alleine für Bedeutung (immer Label/Icon dazu)
- ❌ `type="number"` für Money / IDs (Spinner verursacht Errors)
- ❌ Karten-Verschachtelung (Card in Card)
- ❌ 3 Form-Inputs nebeneinander auf < 768 px
- ❌ Pure `#fff` als Text auf Dark, pure `#000` als Background
- ❌ Animation > 500 ms
- ❌ Tailwind-Default-Shadows auf Storefront (nicht für Dark-Theme kalibriert)
- ❌ `text-[17px]` und andere arbitrary text-sizes außerhalb der Scale

---

## 16. Admin (Kurz — meist nicht relevant für Claude Design)

Falls die Erweiterung den Admin betrifft (Medusa-Shell, desktop-only ≥ 1024 px, Light-Theme):

- **Tokens:** `backend/src/admin/components/admin-tokens.ts` (`C.*` Colors, `T.*` Typography, `S.*` Spacing)
- **Layout-Primitives:** `admin-layout.tsx` (`<PageShell>`, `<PageHeader>`, `<SectionHeader>`, `<Tabs>`, `<StatsGrid>`)
- **UI-Primitives:** `admin-ui.tsx` (`<Btn>`, `<Badge>`, `<Toggle>`, `<Toast>`, `<Modal>`, `<EmptyState>`, `<Alert>`, `<ConfigRow>`)
- Inline-Style mit Token-Referenzen — **kein Tailwind im Admin**
- Pflicht-Wrapper: jede Page in `<PageShell>` → erstes Element `<PageHeader>`
- Sidebar: 7 Hub-Items, Sub-Pages über Hub-Card-Grids, niemals beides gleichzeitig
- Dark-Mode: keine hardcoded `#fff` / `"white"` — `C.card` aus admin-tokens nutzen (CSS-Var flippt auf `.dark`)
- Volle Admin-Doku: `docs/DESIGN_GUIDE_BACKEND.md` v2.0

---

## 17. Wenn etwas im Briefing fehlt

→ `docs/UI_UX/UI_UX_STYLE_GUIDE.md` (Single Source of Truth, 1.888 Zeilen, 12 Sektionen)
→ `docs/UI_UX/CLAUDE.md` (Governance + Execution-Playbook für UI-Arbeit)

Bei Konflikt zwischen diesem Briefing und Style Guide: **Style Guide wins.**
