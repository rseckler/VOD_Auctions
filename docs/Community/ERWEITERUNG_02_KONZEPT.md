# Erweiterung 02 — Visuelle Optimierung (Density + Mobile)

**Status:** Umgesetzt · 2026-05-16 — die Density-Revision wurde über Claude Design visuell ausgearbeitet (Bundle `7xW0G8VG…`) und anschließend in `community.css` + Community-Komponenten implementiert. Build grün. Noch nicht deployed.
**Zweck:** Ursprünglicher Umsetzungsplan (Vorher→Nachher-Werte pro Komponente). Der finale, gebaute Stand folgt dem Claude-Design-Output: dichter Hairline-Feed statt Cards, 72px Cover-Thumbnail rechts an jedem Post mit Release/Bild, Release-Referenz als kompaktes Pill, Editorial als dichte Zeile mit Gold-Topline, fixe Mobile-Bottom-Tab-Bar (5 Slots), kompaktes Profil. Post-Detail bewusst unverändert (Leseansicht).
**Bezug:** [`Erweiterungen.md`](./Erweiterungen.md) §02 (Robins Anforderung) · [`SOCIAL_UX_REFERENCE.md`](./SOCIAL_UX_REFERENCE.md) (Plattform-Patterns) · [`COMMUNITY_SYSTEM_STATE.md`](./COMMUNITY_SYSTEM_STATE.md) §12
**Betroffene Datei (Kern):** `storefront/src/app/community/community.css` (1.976 Zeilen) + 3–4 Komponenten.

---

## 1. Anforderung (Robin, Erweiterungen.md §02)

> „Mir ist die gesamte Darstellung zu großzügig — Postboxen zu groß, Abstände/Höhen zu groß, Schrift zu groß. Kompakter bauen, mehr Inhalte auf die Fläche. Mobile View im Stil moderner Social-Media-Plattformen (Instagram, TikTok). Die Seite darf sich nicht nach links/rechts bewegen."

Übersetzt in messbare Ziele:

| Ziel | Heute (rc68) | Nachher |
|---|---|---|
| Feed-Einträge sichtbar (Desktop, 1080p) | ~1,5 | **3–4** |
| Feed-Einträge sichtbar (Mobile, ≈812 pt) | ~1 | **2–3** |
| Mobile-Navigation | scrollbare Sub-Nav, FAB | **fixe Bottom-Tab-Bar** |
| Horizontaler Scroll | bereits gefixt (`overflow-x: clip`) ✓ | bleibt |

---

## 2. Leitprinzip

**Ein Feed-Eintrag ist eine Zeile im Gespräch, kein Plakat** (SOCIAL_UX_REFERENCE §1). Der Großteil von Robins „kompakter"-Wunsch wird durch zwei zentrale Stellschrauben erreicht — Typo-Skala und Spacing-Skala — *bevor* irgendeine Komponente strukturell umgebaut wird. Reihenfolge daher streng:

**Phase 1 (Tokens) → Phase 2 (Card-Anatomie) → Phase 3 (Mobile-Nav).**

Phase 1+2 holen ~80 % des Effekts ohne strukturelle Risiken. Phase 3 ist additiv (neue Komponente).

Was **nicht** schrumpft: die **Leseansicht** — Post-Detailseite (`/community/post/[slug]`) und Editorial-Detail dürfen ihre große DM-Serif-Headline + 17px-Prose behalten. „Im Feed klein, im Detail groß" ist die Branchenregel (SOCIAL_UX_REFERENCE §2).

---

## 3. Phase 1 — Typo- & Spacing-Skala (global)

**Eine zentrale Stelle** in `community.css` — ein neuer `:root`-Block direkt nach `.cm-screen`. Alle Komponenten-Regeln referenzieren danach diese Variablen statt Hardcodes. Das ist der Hebel mit der größten Flächenwirkung.

### 3.1 Neue CSS-Variablen

```css
.cm-root {
  /* Typografie — Feed-Skala (SOCIAL_UX_REFERENCE §2) */
  --cm-fs-body:   14px;   /* Post-Fließtext im Feed */
  --cm-fs-meta:   12px;   /* Handle, Zeit, Counts */
  --cm-fs-micro:  11px;   /* Labels, Tag-Counts */
  --cm-fs-title:  16px;   /* Post-/Editorial-Titel im Feed */
  --cm-lh-body:   1.45;   /* nicht 1.6 */

  /* Spacing — 4-pt-Basis (SOCIAL_UX_REFERENCE §3) */
  --cm-sp-1: 4px;
  --cm-sp-2: 8px;
  --cm-sp-3: 12px;
  --cm-sp-4: 16px;

  /* Card-Tokens */
  --cm-card-pad:   14px;  /* war 24px 26px */
  --cm-card-gap:   10px;  /* Abstand Card↔Card, war 32px */
  --cm-radius:     10px;  /* war 14–18px */
  --cm-feed-avatar: 36px; /* war 48px */
}
```

### 3.2 Globale Anwendung

| Regel | Vorher | Nachher |
|---|---|---|
| `.cm-screen.is-mobile` font-size | `14px` | bleibt — gilt global |
| `.cm-post-body` | `400 15px/1.6` | `400 var(--cm-fs-body)/var(--cm-lh-body)` → 14/1.45 |
| `.cm-post-name` | `600 14px` | `600 14px` (bleibt — Name darf führen) |
| `.cm-post-time` / `.cm-post-loc` | `12px` | `var(--cm-fs-meta)` = 12px (bleibt, ggf. Farbe leiser) |
| `.cm-feed` gap | `32px` | `var(--cm-card-gap)` = 10px |
| `.cm-feed.is-spacious / is-medium / is-dense` | 40 / 24 / 14px | **entfernen** — der tote Density-Schalter wird durch die neue Default-Dichte ersetzt (siehe §6 Offene Frage A) |
| `.cm-hub-grid` gap / padding | `64px` / `40px 0 80px` | `32px` / `24px 0 64px` |

---

## 4. Phase 2 — Card-Anatomie kompakt

Zielstruktur einer Feed-Card (SOCIAL_UX_REFERENCE §4): Header-Zeile ~40px → Body (3–4 Zeilen, geklemmt) → optional Media → Action-Zeile ~34px. Card-Höhe ohne Media: ~96–130px.

### 4.1 `.cm-post` (Discussion-Card)

| Eigenschaft | Vorher | Nachher |
|---|---|---|
| `padding` | `24px 26px` | `var(--cm-card-pad)` = 14px |
| `border-radius` | `14px` | `var(--cm-radius)` = 10px |
| `.cm-post-head` margin-bottom | `16px` | `var(--cm-sp-2)` = 8px |
| `.cm-post-head` gap | `12px` | `10px` |
| Byline-Avatar (`PostCard` → `Byline size=`) | `48` | **`36`** (Komponenten-Edit in `CommunityUI.tsx:171`) |
| `.cm-post-body` | `15px/1.6` | `14px/1.45` + **`-webkit-line-clamp: 4`** (Clamp auf 4 Zeilen, „… more" führt auf Detail) |
| `.cm-post-tags` margin-top | `16px` | `10px` |
| `.cm-post-actions` margin-top / padding-top | `18px` / `16px` | `8px` / `8px` |
| `.cm-react` height | `30px` | `28px` (Icon 16–18px, klickbare Fläche bleibt ≥44px durch Padding — §5.3) |

### 4.2 Editorial-Card im Feed (`.cm-editorial.is-feed`)

Editorial-Cards dürfen sich abheben (Goldlinie behält sie), aber im selben Dichteraster:

| Eigenschaft | Vorher | Nachher |
|---|---|---|
| `.cm-editorial` border-radius | `18px` | `var(--cm-radius)` = 10px |
| `.cm-editorial-eyebrow` padding | `22px 32px 0` | `12px 16px 0` |
| `.cm-editorial-body` padding | `14px 32px 26px` | `8px 16px 14px` |
| `.cm-editorial.is-feed .cm-editorial-title` | `26px` | `18px` (Serif bleibt) |
| `.cm-editorial-lede` | groß | `var(--cm-fs-body)` + 3-Zeilen-Clamp |
| `.cm-editorial-foot` padding | `18px 32px 24px` | `12px 16px 14px` |

> Die **Detail**-Editorial-Ansicht (`/community/dispatch`-Eintrag, Post-Detail) bleibt groß — nur `.is-feed` schrumpft.

### 4.3 Inline-Release-Card (`.cm-release-inline`)

Das ist die Verknüpfung aus Erweiterung 01 — soll kompakt eine Zeile sein, kein Block:

| Eigenschaft | Vorher | Nachher |
|---|---|---|
| `padding` | `14px` | `10px` |
| `gap` | `16px` | `12px` |
| `.cm-release-cover` | `64×64px` | `52×52px` |
| `.cm-release-title` | `600 14px` | `600 13px` |

### 4.4 Media

- `.cm-post-card-cover` / `.cm-editorial-cover`: `max-height` 240/300px → **edge-to-edge** (negativer Margin gegen `--cm-card-pad`, randlos) + einheitliches Ratio. **Empfehlung 1:1** (Cover sind quadratisch — SOCIAL_UX_REFERENCE §6). Offene Frage B.
- `border-radius` der Media innerhalb der Card: oben 0 (sitzt an der Card-Kante), kein doppelter Rahmen.

---

## 5. Phase 3 — Mobile

### 5.1 Bottom-Tab-Bar (neu, Pflicht)

Aktuell existiert `.cm-bottom-tab` in `community.css` (Z. 772) — aber **nur** für den Device-Frame-Previewer (`.is-mobile`-Klasse), nicht für echte Viewports. Echte Mobile-Geräte sehen heute nur die scrollbare Sub-Nav + den Compose-FAB.

**Neu:** Komponente `CommunityBottomNav.tsx`, gerendert im `community/layout.tsx`, sichtbar via Media-Query `@media (max-width: 900px)`:

```
position: fixed; bottom: 0; left/right: 0; z-index: 30;
height: 52px + env(safe-area-inset-bottom);
```

**5 Slots** (SOCIAL_UX_REFERENCE §5):

| Slot | Icon | Ziel |
|---|---|---|
| Feed | Home | `/community` |
| Explore | Suche | `/community/explore` |
| **Compose** | `+` (hervorgehoben, gold, mittig) | `/community/compose` |
| Members | People | `/community/members` |
| Notifications | Glocke + Unread-Dot | `/community/notifications` |

- Active-Slot: Gold (`--primary`), Icon ~24px, Label 10–11px.
- **Compose-FAB wird auf Mobile ausgeblendet** (`@media (max-width:900px) { .cm-fab { display:none } }`) — Compose lebt im mittleren Tab.
- Feed-Padding-bottom muss die Bar einkalkulieren: `padding-bottom: calc(52px + env(safe-area-inset-bottom) + 16px)` auf der Mobile-Scroll-Spalte.
- Unread-Dot speist sich aus derselben Quelle wie `CommunityNavDot` (vorhanden).

### 5.2 Fixe Breite / kein H-Scroll

| Maßnahme | Status |
|---|---|
| `.cm-root { overflow-x: clip }` | ✓ erledigt (rc68) |
| `overflow-wrap: anywhere` auf Text-Containern | ✓ größtenteils gesetzt — Sweep zur Kontrolle |
| Mobile-Container: `width:100%; max-width:100vw; box-sizing:border-box` | `box-sizing` global ✓; `max-width:100vw` ergänzen |
| Grids mit `minmax(0,1fr)` statt fixer Min-Werte | Hub-Grid ✓; restliche Grids prüfen |
| Sub-Nav horizontal scrollbar | ✓ korrekt — bleibt (einziger erlaubter H-Scroll) |

### 5.3 Touch-Targets

- Alle Tap-Targets ≥ 44×44px klickbare Fläche, auch wenn das Icon kleiner ist (Padding). Betrifft `.cm-react`, `.cm-icon-btn`, Bottom-Tab-Slots.

### 5.4 `.is-mobile` Device-Frame-System

Das `.is-mobile`-Klassen-System (Z. 1200-Kommentar: „device-frame previewer") bleibt unangetastet — es betrifft den Clickdummy, nicht echte Viewports. Alle echten Mobile-Regeln laufen über Media-Queries (`@media max-width: 900px / 768px / 640px / 560px`). **Kein Vermischen.**

---

## 6. Offene Entscheidungen (für Robins Review)

**A — Density-Schalter:** `community.css` hat einen ungenutzten `.cm-feed.is-spacious|is-medium|is-dense`-Schalter. Optionen: (1) ersatzlos entfernen, neue Default-Dichte ist „dense" (Empfehlung — eine Wahrheit), oder (2) als nutzerseitige „Compact view"-Option behalten wie Reddit. Empfehlung: **(1)**.

**B — Feed-Media-Ratio:** 1:1 (quadratisch, passt zu Cover) vs. 4:5 (Instagram-Portrait, mehr vertikale Präsenz). Empfehlung: **1:1**.

**C — Umsetzung in einem Release oder drei:** Phase 1+2 sind ein zusammenhängender CSS-Pass (1 Release, `rc69.0`). Phase 3 Mobile-Nav ist additiv (`rc69.1`). Empfehlung: **2 Releases** — Density zuerst, Mobile-Nav danach, damit jeder Schritt einzeln auf Prod verifizierbar ist.

**D — Bottom-Nav 5. Slot:** Notifications vs. Profil/Settings. Empfehlung: **Notifications** (höhere Frequenz; Profil über Header erreichbar).

---

## 7. Umsetzungs-Reihenfolge (nach Freigabe)

| Schritt | Inhalt | Datei(en) | Release |
|---|---|---|---|
| 1 | `:root`-Token-Block + globale Skala (§3) | `community.css` | rc69.0 |
| 2 | Card-Anatomie kompakt (§4), Byline-Avatar 48→36 | `community.css`, `CommunityUI.tsx` | rc69.0 |
| 3 | Edge-to-edge-Media + Ratio (§4.4) | `community.css`, `CommunityUI.tsx` | rc69.0 |
| 4 | `CommunityBottomNav` + Media-Query-Einbindung (§5.1) | neu `CommunityBottomNav.tsx`, `layout.tsx`, `community.css` | rc69.1 |
| 5 | H-Scroll-/Touch-Target-Sweep (§5.2/5.3) | `community.css` | rc69.1 |

Nach jedem Release: Prod-Verifikation auf echtem Mobilgerät + Desktop, CHANGELOG-Entry + GitHub-Release (CLAUDE.md-Pflicht).

---

## 8. Risiken & Non-Goals

- **Risiko:** `--cm-radius`/Padding-Tokens werden nicht überall referenziert → uneinheitliche Cards. Gegenmittel: nach dem Token-Block alle Hardcodes von `padding`/`border-radius` im Community-Block per Grep abklopfen.
- **Risiko:** `position: sticky`-Elemente (Sidebar, Sub-Nav) brechen, falls jemand `overflow-x` von `clip` auf `hidden` ändert. Bleibt `clip`.
- **Non-Goal:** Funktionale Änderungen — keine neuen Features, keine Backend-Routes, keine DB-Migration. Reine CSS-/Komponenten-Arbeit.
- **Non-Goal:** Post-Detail-/Editorial-Detail-Leseansicht schrumpfen. Bleibt großzügig.

---

**Nächster Schritt:** Robin reviewt §3–§6, entscheidet A–D, gibt frei → dann Umsetzung nach §7.
