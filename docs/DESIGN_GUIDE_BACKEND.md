# VOD Auctions — Backend Admin Design Guide

**Version:** 2.0  
**Erstellt:** 2026-04-02  
**Aktualisiert:** 2026-04-02  
**Gilt für:** Alle Custom Admin Pages unter `backend/src/admin/routes/`

---

## 1. Architektur-Prinzipien

### 1.1 Shared Component Library

Jede visuelle Komponente wird **EINMAL** definiert und von allen Seiten importiert. Keine Seite definiert eigene Farben, Header, Tabellen oder Badges.

```
backend/src/admin/
  components/
    admin-nav.tsx              ← besteht bereits (Sidebar + Back-Nav)
    admin-tokens.ts            ← NEU: Farben, Spacing, Typography
    admin-layout.tsx           ← NEU: PageHeader, SectionHeader, PageShell
    admin-table.tsx            ← NEU: DataTable, TableHeader, Pagination
    admin-ui.tsx               ← NEU: Badge, Toggle, Toast, Alert, EmptyState, Modal
  routes/
    dashboard/page.tsx         ← importiert aus components/*
    ...
```

### 1.2 Kein Inline-Farbwert

**VERBOTEN:** `color: "#78716c"` irgendwo in einer page.tsx  
**RICHTIG:** `color: C.muted` (importiert aus admin-tokens.ts)

### 1.3 Medusa Shell Respektieren

Das Admin-Panel läuft in Medusa's **Light-Mode Shell** (weißer Hintergrund, helle Sidebar). Alle Custom-Seiten erben diesen Hintergrund. Kein Dark-Mode.

---

## 2. Farbpalette (`admin-tokens.ts`)

```typescript
// backend/src/admin/components/admin-tokens.ts
export const C = {
  bg: "transparent",           // erbt Medusa-Shell
  card: "#f8f7f6",             // Karten, Sections, Table-Header
  text: "#1a1714",             // Primärer Text
  muted: "#78716c",            // Sekundärer Text, Labels, Placeholders
  gold: "#b8860b",             // Primäre Akzentfarbe, aktive Tabs, CTAs
  border: "#e7e5e4",           // Borders, Trennlinien
  hover: "#f5f4f3",            // Hover-States, expandierte Rows
  success: "#16a34a",          // Erfolg, aktiv, Toggle ON
  error: "#dc2626",            // Fehler, Löschen, Danger
  blue: "#2563eb",             // Info, Links, Approved
  purple: "#7c3aed",           // Spezial, Invited
  warning: "#d97706",          // Warnung, Pending
} as const
```

### Status-Badge-Farben

```typescript
export const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  success:  { bg: C.success + "12", color: C.success, border: C.success + "30" },
  error:    { bg: C.error + "12",   color: C.error,   border: C.error + "30" },
  warning:  { bg: C.warning + "12", color: C.warning,  border: C.warning + "30" },
  info:     { bg: C.blue + "12",    color: C.blue,     border: C.blue + "30" },
  purple:   { bg: C.purple + "12",  color: C.purple,   border: C.purple + "30" },
  neutral:  { bg: C.border,         color: C.muted,    border: C.border },
}
```

### Verbotene Farben

| Farbe | Grund |
|-------|-------|
| `#f5f0eb`, `#e8e0d4`, `#d1d5db` | Heller Text — unsichtbar auf weiß |
| `#1c1915`, `#0d0b08` | Dunkle Hintergründe — kollidiert mit Shell |
| `rgba(255,255,255,*)` | White-Alpha-Borders — unsichtbar auf weiß |
| `#9ca3af` | Zu wenig Kontrast |
| Jeder hardcoded Hex-Wert in page.tsx | Muss über `C.*` referenziert werden |

---

## 3. Typografie

```typescript
export const T = {
  pageTitle:    { fontSize: 20, fontWeight: 700, color: C.text } as const,
  subtitle:     { fontSize: 13, color: C.muted, marginTop: 4 } as const,
  sectionHead:  { fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: C.muted } as const,
  body:         { fontSize: 13, color: C.text } as const,
  small:        { fontSize: 12, color: C.muted } as const,
  micro:        { fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: C.muted } as const,
  stat:         { fontSize: 22, fontWeight: 700, color: C.text } as const,
  mono:         { fontFamily: "monospace", fontSize: 12 } as const,
}
```

---

## 4. Spacing

```typescript
export const S = {
  pagePadding: "20px 24px 48px",    // Jede Seite, keine Abweichung
  pageMaxWidth: 960,                 // Max-Breite Content
  sectionGap: 28,                    // Abstand zwischen Sektionen
  cardPadding: "16px 18px",         // Standard Card
  cellPadding: "10px 14px",         // Tabellen-Zelle
  gap: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 4, md: 6, lg: 8, xl: 10 },
}
```

---

## 5. Navigation

### Sidebar-Struktur (5 Hub Items + direkte Einträge)

```
SIDEBAR
├── Dashboard (rank 0)       [House]
├── Auction Blocks (rank 1)  [ChatBubbleLeftRight]
├── Orders (rank 2)          [CurrencyDollar]
├── Catalog (rank 3)         [FolderOpen] ← Hub
│   ├── Media
│   ├── Musicians
│   └── Entity Content
├── Marketing (rank 4)       [EnvelopeSolid] ← Hub
│   ├── Newsletter
│   ├── Emails
│   ├── CRM
│   ├── Content
│   ├── Gallery
│   └── Waitlist
├── Operations (rank 5)      [CogSixTooth] ← Hub
│   ├── Live Monitor
│   ├── System Health
│   ├── Shipping
│   ├── Sync
│   ├── Test Runner
│   └── Configuration
└── AI Assistant (rank 6)    [Sparkles]
```

### Regeln

- **Hub Pages** (Catalog, Marketing, Operations): `defineRouteConfig` MIT rank + icon. Zeigen Sub-Pages als Karten.
- **Sub Pages** (Media, Emails, etc.): **KEIN** `defineRouteConfig`. Nur über Hub erreichbar. `useAdminNav()` erzeugt Back-Nav.
- **Standalone Pages** (Dashboard, Auction Blocks, Orders, AI Assistant): `defineRouteConfig` MIT rank + icon.
- **VERBOTEN:** Sub-Pages die auch `defineRouteConfig` haben → erscheinen doppelt (als Hub-Karte UND als Sidebar-Item).

### Aktuelle Violations (zu fixen)

| Seite | Problem | Fix |
|-------|---------|-----|
| CRM (`/app/crm`) | Hat `defineRouteConfig` mit label "Customers" → eigener Sidebar-Eintrag | `defineRouteConfig` entfernen (ist Sub-Page unter Marketing) |
| Configuration (`/app/config`) | Hat `defineRouteConfig` → eigener Sidebar-Eintrag | `defineRouteConfig` entfernen (ist Sub-Page unter Operations) |
| Waitlist (`/app/waitlist`) | Hat `defineRouteConfig` → eigener Sidebar-Eintrag | `defineRouteConfig` entfernen (ist Sub-Page unter Marketing) |

---

## 6. Universelles Seiten-Layout

### `PageHeader` Komponente (in `admin-layout.tsx`)

```typescript
interface PageHeaderProps {
  title: string
  subtitle?: string
  badge?: { label: string; color: string }
  actions?: React.ReactNode
}
```

**Rendering:**
```
┌─────────────────────────────────────────────────────────┐
│  Title (20px, 700)                        [Badge] [Btn] │
│  Subtitle (13px, muted)                                  │
└─────────────────────────────────────────────────────────┘
```

- Titel: `fontSize: 20, fontWeight: 700, color: C.text, margin: 0`
- Subtitle: `fontSize: 13, color: C.muted, marginTop: 4`
- Badge: rechts oben, semi-transparenter Hintergrund
- Actions: rechts oben, neben Badge
- Layout: `display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20`

**JEDE Seite nutzt PageHeader.** Keine Ausnahme.

### `SectionHeader` Komponente

```typescript
interface SectionHeaderProps {
  title: string
  count?: number
}
```

Rendering: `11px, 700, uppercase, letter-spacing 0.06em, color C.muted, borderBottom 1px C.border, paddingBottom 8, marginTop 28, marginBottom 10`

---

## 7. Tabelle (`admin-table.tsx`)

### Standard Table Container

```typescript
// Wrapper
{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }

// Header Row
{ background: C.card, padding: "10px 14px" }
// Header Cell: T.micro (10px, 700, uppercase, C.muted)

// Data Row
{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", transition: "background 0.1s" }
// Hover: background: C.hover

// Data Cell: padding: "10px 14px", fontSize: 13, color: C.text
```

### Pagination

```
┌──────────────────────────────────────────────┐
│  Showing 1-50 of 1,234          [Prev] [Next]│
└──────────────────────────────────────────────┘
```

---

## 8. UI-Komponenten (`admin-ui.tsx`)

### 8.1 Badge

```typescript
interface BadgeProps {
  label: string
  variant: "success" | "error" | "warning" | "info" | "purple" | "neutral"
}
```

Style: `display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.03em"`

### 8.2 Toggle

Track: `width: 38, height: 20, borderRadius: 10`  
Knob: `width: 14, height: 14, borderRadius: 7, background: "#fff"`  
ON: `background: C.success`, knob left: 21  
OFF: `background: C.border`, knob left: 3

### 8.3 Buttons

| Variante | Background | Color | Border |
|----------|-----------|-------|--------|
| primary | `C.text` | `#fff` | none |
| gold | `C.gold` | `#fff` | none |
| danger | `C.error + "12"` | `C.error` | `C.error + "40"` |
| ghost | transparent | `C.muted` | `C.border` |
| disabled | any + `opacity: 0.4` | — | `cursor: not-allowed` |

Standard: `fontSize: 12, fontWeight: 600, padding: "6px 16px", borderRadius: 6`

### 8.4 Toast

Position: `fixed, bottom: 24, right: 24, zIndex: 9999`  
Style: `background: "#fff", border: 1px solid color, padding: "10px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.1)"`  
Auto-dismiss: 2500ms

### 8.5 Alert Box

| Typ | Background | Border |
|-----|-----------|--------|
| error | `#fef2f2` | `#fca5a5` |
| warning | `C.warning + "08"` | `C.warning + "30"` |
| success | `#f0fdf4` | `#bbf7d0` |

### 8.6 Empty State

```
[40px emoji, opacity 0.4]
"No items yet" (fontWeight: 600, C.text)
"Description" (fontSize: 13, C.muted)
```

Padding: 48px 20px, textAlign: center

### 8.7 Input

```
width: "100%", padding: "7px 11px", borderRadius: 6,
border: `1px solid ${C.border}`, background: "#fff",
color: C.text, fontSize: 13, outline: "none"
```

Focus: `borderColor: C.gold`

### 8.8 Modal

Overlay: `rgba(0,0,0,0.4)`  
Dialog: `background: "#fff", borderRadius: 12, maxWidth: 540, boxShadow: "0 24px 80px rgba(0,0,0,0.15)"`  
Header: `background: C.card, borderBottom: 1px solid C.border, padding: "18px 24px"`

---

## 9. Hub-Seiten Pattern

Hub-Seiten (Catalog, Marketing, Operations) zeigen ihre Sub-Pages als Karten-Grid:

```typescript
// Hub Card
{
  background: "#fff",
  border: `1px solid ${C.border}`,
  borderRadius: S.radius.xl,
  padding: S.cardPadding,
  cursor: "pointer",
  transition: "border-color 0.15s, box-shadow 0.15s",
}
// Hover: borderColor: C.text, boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
```

Grid: `gridTemplateColumns: "repeat(3, 1fr)"`, gap: 16

---

## 10. Tabs

```typescript
// Tab Button
{
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: active ? 600 : 400,
  color: active ? C.gold : C.muted,
  borderBottom: active ? `2px solid ${C.gold}` : "2px solid transparent",
  background: "none",
  border: "none",
  cursor: "pointer",
}
```

Container: `borderBottom: 1px solid C.border, marginBottom: 20, display: "flex", gap: 0`

---

## 11. Stats-Karten

```typescript
// Grid Container (1px-gap technique)
{
  display: "grid",
  gridTemplateColumns: `repeat(${count}, 1fr)`,
  gap: 1,
  background: C.border,
  borderRadius: S.radius.lg,
  overflow: "hidden",
  marginBottom: 20,
}

// Each Card
{ background: "#fff", padding: "14px 16px" }
// Label: T.micro
// Value: T.stat
// Subtitle: T.small
```

---

## 12. Transitions

| Element | Transition |
|---------|-----------|
| Toggle | `background 0.2s`, knob `left 0.15s` |
| Table Row | `background 0.1s` |
| Card | `border-color 0.15s, box-shadow 0.15s` |
| Button | `opacity 0.15s` |

---

## 13. Pflicht-Imports (jede page.tsx)

```typescript
import { useAdminNav } from "../../components/admin-nav"
import { C, T, S } from "../../components/admin-tokens"
import { PageHeader, SectionHeader } from "../../components/admin-layout"
// Optional:
import { Badge, Toggle, Toast, Alert, EmptyState } from "../../components/admin-ui"
import { DataTable } from "../../components/admin-table"
```

---

## 14. Checkliste (vor jedem Deploy)

- [ ] Keine hardcoded Farben in page.tsx (alle über `C.*`)
- [ ] PageHeader Komponente verwendet (nicht eigener Header)
- [ ] Kein `defineRouteConfig` auf Sub-Pages
- [ ] `useAdminNav()` aufgerufen
- [ ] Tabs nutzen Standard-Pattern aus Section 10
- [ ] Tabellen nutzen Standard-Pattern aus Section 7
- [ ] Badges nutzen Standard-Pattern aus Section 8.1
- [ ] Leere Zustände zeigen EmptyState-Komponente
- [ ] Toast nach Speichern/Löschen

---

## 15. Anti-Patterns (verboten)

- ❌ `const C = { ... }` in page.tsx definieren (gehört in admin-tokens.ts)
- ❌ Hardcoded Farbwerte (`color: "#78716c"`)
- ❌ Eigene Header-Struktur (immer PageHeader verwenden)
- ❌ `defineRouteConfig` auf Sub-Pages
- ❌ Dark-Mode-Farben
- ❌ `rgba(255,255,255,*)` Borders
- ❌ Medusa UI + Inline CSS mischen auf derselben Seite
- ❌ Verschiedene fontSize für gleiche Elemente auf verschiedenen Seiten

---

## 16. Tracklist/Notes Rendering

Admin-Seiten die Release-Daten anzeigen (z.B. `/app/media/[id]`) MÜSSEN die gleiche Parsing-Logik wie das Storefront nutzen (`storefront/src/lib/utils.ts`).

### Datenquelle-Hierarchie (verbindlich)
1. `credits` → primäre Quelle via `extractTracklistFromText()` (HTML → strukturierte Tracks)
2. JSONB `tracklist` → Fallback via `parseUnstructuredTracklist()` (flache Einträge → gruppiert)
3. `description` → nur als Notes-Fallback (wenn keine Credits)

### Parsing-Anforderungen
- HTML-Tags vollständig strippen (`<table>`, `<span>`, `<br>`, etc.)
- HTML-Entities dekodieren: `&amp;`, `&ndash;`, `&mdash;`, `&#39;`, `&nbsp;`, `&auml;`/`&ouml;`/`&uuml;`/`&szlig;`
- Section-Headers (`-I-`, `-II-`, "Tracklist") überspringen
- Positionen erkennen: `A1`, `B2`, `1`, `12`, `1-1`, `2-3` (Bindestrich-Format)
- Credits-Rest als Notes anzeigen (keine Doppelung mit Tracklist)

### Referenz-Implementierung
`backend/src/admin/routes/media/[id]/page.tsx` — `NotesAndTracklist` Komponente

---

*Version 2.1 — Verbindlich für alle neuen und bestehenden Custom Admin Pages.*
