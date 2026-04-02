# VOD Auctions — Frontend Storefront Design Guide

**Version:** 1.0  
**Erstellt:** 2026-04-02  
**Gilt für:** `storefront/` — Next.js 16 + React 19 + Tailwind CSS 4

---

## 1. Design-Philosophie: "Vinyl Culture"

Dark, warm, premium. Inspiriert von Vinyl-Plattenläden und Sammlerkultur — nicht von generischen E-Commerce-Templates. Die Ästhetik vermittelt Kuration und Exklusivität.

---

## 2. Farbpalette

### Primärfarben (CSS Custom Properties in `globals.css`)

| Token | Wert | Verwendung |
|-------|------|-----------|
| `--primary` | `#d4a54a` | Gold — CTAs, Akzente, aktive States |
| `--primary-foreground` | `#1c1915` | Text auf Gold-Buttons |
| `--background` | `#1c1915` | Seiten-Hintergrund (dunkel warm) |
| `--foreground` | `#f5efe6` | Standard-Text (Creme/Off-White) |
| `--card` | `#241f1a` | Karten-Hintergrund |
| `--card-foreground` | `#f5efe6` | Text in Karten |
| `--secondary` | `#2a2520` | Sekundäre Buttons, gedämpfte Bereiche |
| `--muted` | `#2a2520` | Hintergrund für deaktivierte Bereiche |
| `--muted-foreground` | `#a09888` | Sekundärer Text |
| `--border` | `rgba(232,224,212,0.08)` | Subtile Borders |
| `--input` | `#302a22` | Input-Hintergrund |
| `--ring` | `#d4a54a` | Focus-Outline |
| `--destructive` | `#ef4444` | Fehler, Löschen |

### Status-Farben

| Token | Wert | Verwendung |
|-------|------|-----------|
| `--status-active` | `#4ade80` | Live-Auktionen, Winning Bids |
| `--status-scheduled` | `#a09888` | Geplante Auktionen |
| `--status-ended` | `#71717a` | Beendete Auktionen |
| `--status-preview` | `#f97316` | Preview-Modus |
| `--bid-winning` | `#4ade80` | Eigenes Gebot führt |
| `--bid-outbid` | `#f97316` | Überboten |

### Format-Farben

| Format | Farbe | Verwendung |
|--------|-------|-----------|
| Vinyl | `#d4a54a` (Gold) | Format-Badge |
| CD | `#38bdf8` (Sky Blue) | Format-Badge |
| Cassette | `#a855f7` (Purple) | Format-Badge |

---

## 3. Typografie

### Schriftarten

| Font | Variable | Verwendung |
|------|----------|-----------|
| **DM Serif Display** | `--font-dm-serif` / `font-serif` | Headlines, prominente Titel |
| **DM Sans** | `--font-dm-sans` / `font-sans` | Body, UI, Labels |

Geladen via `next/font/google` in `layout.tsx`.

### Hierarchie

| Element | Tailwind-Klasse | Schrift |
|---------|----------------|---------|
| Page Heading | `text-3xl font-serif` | DM Serif Display, 30px |
| Block Title | `text-xl font-serif` | DM Serif Display, 20px |
| Card Title | `text-lg font-semibold` | DM Sans, 18px, 600 |
| Body Text | `text-sm` | DM Sans, 14px |
| Small / Labels | `text-xs` | DM Sans, 12px |
| Micro / Badges | `text-[10px]` or `text-[11px]` | DM Sans |

---

## 4. Spacing & Layout

### Container

```
max-w-6xl px-6 mx-auto
```

### Spacing-Skala

Tailwind-Defaults: `gap-2` (8px), `gap-3` (12px), `gap-4` (16px), `gap-6` (24px), `gap-8` (32px)

### Breakpoints

| Breakpoint | Pixel | Verwendung |
|-----------|-------|-----------|
| `sm` | 640px | Mobile → Tablet |
| `md` | 768px | Header-Nav erscheint |
| `lg` | 1024px | Desktop-Layout |
| `xl` | 1280px | Breite Layouts |

### Border Radius

| Token | Wert | Verwendung |
|-------|------|-----------|
| `rounded` | 6px (`--radius-sm`) | Inputs, kleine Buttons |
| `rounded-md` | 8px | Standard Buttons |
| `rounded-lg` | 10px (`--radius`) | Cards |
| `rounded-xl` | 14px | Große Cards |
| `rounded-2xl` | 18px | Hero-Cards, Block Cards |
| `rounded-full` | 9999px | Badges, Avatare |

---

## 5. Kern-Komponenten

### 5.1 Header

```
sticky top-0 z-50
bg-[rgba(28,25,21,0.95)] backdrop-blur-xl
border-b border-[rgba(232,224,212,0.1)]
h-16
```

- Logo: Disc3-Icon mit Gradient `from-primary to-[#b8860b]`
- Nav-Links: `text-muted-foreground` → `text-foreground` bei aktiv
- Badge-Counter: Gold `bg-[#d4a54a]` mit weißem Text

### 5.2 Button (shadcn/ui)

| Variant | Klassen |
|---------|---------|
| `default` (Gold) | `bg-primary text-primary-foreground hover:bg-primary/90` |
| `destructive` | `bg-destructive text-white hover:bg-destructive/90` |
| `outline` | `border bg-background shadow-xs hover:bg-accent` |
| `secondary` | `bg-secondary hover:bg-secondary/80` |
| `ghost` | `hover:bg-accent hover:text-accent-foreground` |
| `link` | `text-primary underline-offset-4 hover:underline` |

| Size | Klassen |
|------|---------|
| `xs` | `h-6 gap-1 px-2 text-xs` |
| `sm` | `h-8 gap-1.5 px-3` |
| `default` | `h-9 px-4 py-2` |
| `lg` | `h-10 px-6` |

### 5.3 Input

```
h-9 bg-input border border-primary/25 rounded-md px-3 py-1
focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50
placeholder:text-muted-foreground
```

### 5.4 Badge

```
inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium
```

Variants: `default` (Gold), `secondary`, `destructive`, `outline`

### 5.5 Card

```
rounded-xl border bg-card py-6 gap-6 shadow-sm
```

- Header: `px-6`, Title: `font-semibold`, Description: `text-sm text-muted-foreground`
- Content: `px-6`
- Footer: `flex items-center px-6`

### 5.6 Block Card (Auktions-Karte)

```
rounded-2xl border border-[rgba(232,224,212,0.08)]
bg-[rgba(232,224,212,0.04)]
hover:border-[rgba(212,165,74,0.4)] hover:-translate-y-1
```

- Image: `aspect-[16/10]`, hover: `group-hover:scale-105 transition-transform duration-500`
- Status-Overlay: `top-3 left-3 bg-[rgba(28,25,21,0.85)] backdrop-blur-sm`
- Text-Padding: `p-5`

### 5.7 Condition Badge

| Zustand | Farbe |
|---------|-------|
| M / NM (Mint) | `bg-green-500/15 text-green-400 border-green-500/20` |
| VG+ / VG | `bg-amber-500/15 text-amber-400 border-amber-500/20` |
| G+ / G | `bg-orange-500/15 text-orange-400 border-orange-500/20` |
| F / P | `bg-red-500/15 text-red-400 border-red-500/20` |

Style: `inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded border`

### 5.8 Save for Later Button

```
w-11 h-11 rounded-[10px] border
bg-primary/8 border-primary/25
hover:bg-primary/15 hover:border-primary/40
Saved: bg-primary/20 border-primary/50
```

### 5.9 Direct Purchase Button

```
Container: bg-primary/10 border border-primary/30 rounded-lg p-4
Price: text-2xl font-bold font-mono text-primary
Button: bg-primary hover:bg-primary/90 text-[#1c1915]
Added: bg-green-600
```

---

## 6. Animation & Motion

### Framer Motion Presets (`lib/motion.ts`)

| Preset | Beschreibung |
|--------|-------------|
| `fadeIn` | Opacity 0→1, 0.4s |
| `fadeInUp` | Opacity + Y-Translation, 0.5s easeOut |
| `staggerContainer` | Stagger-Delay 0.04s |
| `staggerItem` | Opacity + Y(8px), 0.2s easeOut |
| `scaleIn` | Scale 0.95→1 + Opacity, 0.3s |

### CSS Transitions

| Element | Transition |
|---------|-----------|
| Image Hover | `group-hover:scale-105 transition-transform duration-500` |
| Card Hover | `hover:-translate-y-1 transition-transform` |
| Button Hover | `hover:bg-primary/90` |
| Nav Link | Farbe animiert über CSS |

### Pulse-Animation

```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
```

Verwendet für Live-Auction-Indikator.

---

## 7. Responsive Design

**Mobile-First-Ansatz.** Standard-Layout ist vertikal/gestackt.

| Pattern | Mobile | Desktop |
|---------|--------|---------|
| Navigation | Hamburger-Menü | `hidden md:flex` |
| Card Grid | 1 Spalte | 2-3 Spalten `md:grid-cols-2 lg:grid-cols-3` |
| Block Card | Vertikal | Horizontal `sm:flex-row` |
| Footer | Gestackt | 4-Spalten Grid |

---

## 8. Custom Scrollbar

```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(232, 224, 212, 0.12);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(232, 224, 212, 0.2);
}
```

---

## 9. Focus & Accessibility

```css
a:focus-visible, button:focus-visible {
  outline: 2px solid #d4a54a;
  outline-offset: 2px;
  border-radius: 4px;
}
```

`prefers-reduced-motion: reduce` wird respektiert.

---

## 10. E-Mail-Design

E-Mails nutzen inline CSS (kein Tailwind) mit dem gleichen Farbschema:

| Element | Farbe |
|---------|-------|
| Background | `#0d0b08` |
| Container | `#1c1915` |
| Border | `#2a2520` |
| Gold CTA | `#d4a54a` |
| Text | `#e8e0d4` |
| Muted | `#a39d96` |
| Font | `'DM Sans', -apple-system, sans-serif` |

Max-Width: 600px, Outlook-safe Table-Layout.

---

## 11. Datei-Referenzen

| Datei | Inhalt |
|-------|--------|
| `storefront/src/app/globals.css` | CSS Variables, Custom Properties |
| `storefront/src/app/layout.tsx` | Font-Loading, globale Struktur |
| `storefront/src/lib/motion.ts` | Framer Motion Presets |
| `storefront/src/components/ui/` | shadcn/ui Komponenten (Button, Badge, Card, Input) |
| `storefront/src/components/Header.tsx` | Header-Komponente |
| `storefront/src/components/Footer.tsx` | Footer-Komponente |
| `storefront/src/components/BlockCard.tsx` | Auktions-Block-Karte |
| `backend/src/emails/layout.ts` | E-Mail-Layout-Helper |

---

*Dieses Dokument ist verbindlich für alle neuen und bestehenden Storefront-Seiten und -Komponenten.*
