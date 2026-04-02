# VOD Auctions — Backend Admin Design Guide

**Version:** 1.0  
**Erstellt:** 2026-04-02  
**Gilt für:** Alle Custom Admin Pages unter `backend/src/admin/routes/`

---

## 1. Grundprinzip

Das Medusa Admin-Panel nutzt eine **Light-Mode Shell** (weißer Hintergrund, helle Sidebar). Alle Custom-Seiten müssen dunklen Text auf hellem Grund zeigen. **Keine Dark-Mode-Farben.**

---

## 2. Farbpalette (verbindlich)

Jede Custom-Page MUSS diese exakte Palette als `const C` am Dateianfang definieren:

```typescript
const C = {
  bg: "transparent",           // erbt Medusa-Shell
  card: "#f8f7f6",             // Karten, Sections
  text: "#1a1714",             // Primärer Text
  muted: "#78716c",            // Sekundärer Text, Labels
  gold: "#b8860b",             // Primäre Akzentfarbe, CTAs
  border: "#e7e5e4",           // Borders, Trennlinien
  hover: "#f5f4f3",            // Hover-States
  success: "#16a34a",          // Erfolg, aktiv
  error: "#dc2626",            // Fehler, Löschen
  blue: "#2563eb",             // Info, Links
  purple: "#7c3aed",           // Spezial (Invited, etc.)
  warning: "#d97706",          // Warnung
}
```

### Status-Badge-Farben

Badges nutzen semi-transparente Hintergründe mit farbigen Texten:

```typescript
// Pattern: background + "12" für 12% Opacity, color direkt, border + "30"
{ background: C.success + "12", color: C.success, border: "1px solid " + C.success + "30" }
{ background: C.error + "12",   color: C.error,   border: "1px solid " + C.error + "30" }
{ background: C.warning + "12", color: C.warning,  border: "1px solid " + C.warning + "30" }
{ background: C.blue + "12",    color: C.blue,     border: "1px solid " + C.blue + "30" }
{ background: C.purple + "12",  color: C.purple,   border: "1px solid " + C.purple + "30" }
```

### Verbotene Farben

Diese dürfen **NICHT** in Custom-Pages verwendet werden:

| Farbe | Grund |
|-------|-------|
| `#f5f0eb`, `#e8e0d4`, `#d1d5db` | Heller Text — unsichtbar auf weißem Hintergrund |
| `#1c1915`, `#0d0b08` | Dunkle Hintergründe — kollidieren mit Light-Shell |
| `rgba(255,255,255,*)` | White-Alpha-Borders — unsichtbar auf weiß |
| `#9ca3af` | Zu helles Grau — zu wenig Kontrast |

---

## 3. Typografie

### Schriftgrößen-Skala (verbindlich)

| Token | Größe | Verwendung |
|-------|-------|-----------|
| `xs` | 10px | Tabellen-Header, Micro-Labels |
| `sm` | 12px | Labels, Badges, kleine Hinweise |
| `base` | 13px | Body-Text, Tabelleninhalt, Buttons |
| `md` | 14px | Beschreibungen, Inputs |
| `lg` | 17px | Section-Überschriften |
| `xl` | 22px | Seiten-Titel |
| `2xl` | 24px | Stat-Zahlen |

### Schriftstärken

| Gewicht | Verwendung |
|---------|-----------|
| 400 | Body-Text |
| 500 | Medium — Tabellenzellen, Labels |
| 600 | Semibold — Badges, Button-Text |
| 700 | Bold — Überschriften, Stat-Zahlen |

### Label-Stil (für Section-Headers und Tabellen-Header)

```typescript
{
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: C.muted,
}
```

---

## 4. Spacing-Skala

Alle Abstände basieren auf **Vielfachen von 4px**:

| Wert | Verwendung |
|------|-----------|
| 2px | Micro-Abstände (Badge padding vertical) |
| 4px | Icon-Text-Gap klein |
| 6px | Input padding, enge Gaps |
| 8px | Standard-Gap, Badge padding horizontal |
| 12px | Komponenten-Gap, Table-Cell-Padding |
| 14px | Card padding kompakt |
| 16px | Standard padding |
| 20px | Card padding standard |
| 24px | Section margin-bottom |
| 32px | Page padding |

---

## 5. Border Radius

| Token | Wert | Verwendung |
|-------|------|-----------|
| `sm` | 4px | Badges, kleine Buttons |
| `md` | 6px | Inputs, reguläre Buttons, Tabs |
| `lg` | 8px | Cards, Tabellen-Container, Toasts |
| `xl` | 10px | Hub-Cards, große Container |

---

## 6. Komponenten

### 6.1 Seiten-Header

```typescript
// Immer: Titel links, optionales Badge/Action rechts
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
  <div>
    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Seitentitel</h1>
    <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted }}>Beschreibung</p>
  </div>
  {/* Optional: Badge, Button, etc. */}
</div>
```

### 6.2 Stats-Karten (Grid)

```typescript
// 1px-Gap-Technik: gap als Border-Linien
<div style={{
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: 1,
  background: C.border,
  borderRadius: 8,
  overflow: "hidden",
  marginBottom: 20,
}}>
  <div style={{ background: "#fff", padding: "14px 16px" }}>
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.muted }}>LABEL</div>
    <div style={{ fontSize: 24, fontWeight: 700, color: C.text, marginTop: 2 }}>42</div>
    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>subtitle</div>
  </div>
</div>
```

### 6.3 Tabs

```typescript
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

### 6.4 Tabelle

```typescript
// Container
{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }

// Header
{ background: "#f3f2f1", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }

// Row
{ borderBottom: `1px solid ${C.border}80`, transition: "background 0.1s", cursor: "pointer" }
// Row Hover: background: C.hover

// Cell
{ padding: "10px 14px", fontSize: 13, color: C.text }
```

### 6.5 Badge / Pill

```typescript
{
  display: "inline-block",
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 4,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  background: statusColor + "12",
  color: statusColor,
  border: `1px solid ${statusColor}30`,
}
```

### 6.6 Toggle / Switch

```typescript
// Track
{ width: 38, height: 20, borderRadius: 10, background: active ? C.success : C.border, position: "relative", cursor: "pointer", border: "none", transition: "background 0.2s" }

// Knob
{ position: "absolute", top: 3, left: active ? 21 : 3, width: 14, height: 14, borderRadius: 7, background: "#fff", transition: "left 0.15s" }
```

### 6.7 Buttons

**Gold (Primär):**
```typescript
{ background: C.gold, color: "#fff", fontWeight: 700, fontSize: 13, padding: "8px 18px", borderRadius: 6, border: "none", cursor: "pointer" }
```

**Gold Gradient (Go Live / CTA):**
```typescript
{ background: "linear-gradient(135deg, #d4a54a, #b8883a)", color: "#0d0b08", fontWeight: 700, fontSize: 13, padding: "10px 24px", borderRadius: 7, border: "none" }
```

**Danger:**
```typescript
{ background: C.error + "15", border: `1px solid ${C.error}60`, color: C.error, fontWeight: 700 }
```

**Ghost:**
```typescript
{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted }
```

**Disabled:** `opacity: 0.4, cursor: "not-allowed"`

### 6.8 Input

```typescript
{
  width: "100%",
  maxWidth: 240,
  padding: "7px 11px",
  borderRadius: 6,
  border: `1px solid ${C.border}`,
  background: "#fff",
  color: C.text,
  fontSize: 13,
  outline: "none",
}
```

### 6.9 Section Header

```typescript
{
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: C.muted,
  marginBottom: 12,
  paddingBottom: 8,
  borderBottom: `1px solid ${C.border}`,
}
```

### 6.10 Toast

```typescript
{
  position: "fixed",
  bottom: 24,
  right: 24,
  background: "#fff",
  border: `1px solid ${isError ? C.error : C.success}`,
  color: isError ? C.error : C.success,
  padding: "10px 18px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  zIndex: 9999,
  boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
}
```

### 6.11 Alert / Warning Box

```typescript
// Error
{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px" }

// Warning
{ background: C.warning + "0a", border: `1px solid ${C.warning}30`, borderRadius: 6, padding: "10px 14px" }

// Success
{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px" }
```

### 6.12 Empty State

```typescript
<div style={{ padding: "48px 20px", textAlign: "center" }}>
  <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>📋</div>
  <div style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>No items yet</div>
  <p style={{ fontSize: 13, color: C.muted }}>Description text</p>
</div>
```

### 6.13 Modal

```typescript
// Overlay
{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000 }

// Dialog
{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, maxWidth: 540, boxShadow: "0 24px 80px rgba(0,0,0,0.15)" }

// Header
{ background: "#f3f2f1", borderBottom: `1px solid ${C.border}`, padding: "18px 24px" }
```

---

## 7. Icons

**Primär:** Emoji-Icons (konsistent, kein Import nötig)  
**Sekundär:** `@medusajs/icons` für Sidebar-Einträge (defineRouteConfig)  
**Verboten:** Gemischte Ansätze innerhalb einer Seite

---

## 8. Transitions

| Element | Transition |
|---------|-----------|
| Toggle | `background 0.2s`, knob `left 0.15s` |
| Table Row | `background 0.1s` |
| Card Hover | `border-color 0.15s, box-shadow 0.15s` |
| Button Hover | `opacity 0.15s` |

---

## 9. Pflicht-Imports

Jede Custom-Page MUSS enthalten:

```typescript
import { useAdminNav } from "../../components/admin-nav"
import { defineRouteConfig } from "@medusajs/admin-sdk"

// Im Component:
useAdminNav()

// Am Dateiende:
export const config = defineRouteConfig({ label: "PageName" })
export default PageComponent
```

---

## 10. Anti-Patterns (verboten)

- ❌ Tailwind-Klassen (Admin nutzt inline CSS)
- ❌ Dark-Mode-Farben (#f5f0eb Text, #1c1915 Background)
- ❌ `rgba(255,255,255,*)` Borders
- ❌ Medusa UI + Inline CSS mischen auf derselben Seite
- ❌ fontFamily als Farbwert (`fontFamily: "#d1d5db"`)
- ❌ Hardcoded Farben außerhalb von `const C`

---

*Dieses Dokument ist verbindlich für alle neuen und bestehenden Custom Admin Pages.*
