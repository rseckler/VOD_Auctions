# Social-Media UX/UI Reference — Input für das Visuelle-Optimierungs-Konzept

**Status:** Referenz · 2026-05-16
**Zweck:** Konkretes Material für Erweiterung 02 (visuelle Optimierung der VOD Community). Robin baut darauf ein Konzept für Desktop + Mobile. Dieses Dokument liefert die Patterns, Maße und Skalen der großen Social-Plattformen — keine Meinung, sondern beobachtbare Konvention.
**Bezug:** [`Erweiterungen.md`](./Erweiterungen.md) §02 · [`COMMUNITY_REBUILD_PLAN.md`](./COMMUNITY_REBUILD_PLAN.md)

> Hinweis: Screenshots der Plattformen konnte ich nicht selbst erstellen (kein Browser-/Screenshot-Tool in dieser Umgebung). Dieses Dokument ist die textuelle Entsprechung — Maße aus den öffentlich beobachtbaren Design-Systemen der Plattformen.

---

## 1. Das Kernprinzip: Dichte schlägt Großzügigkeit

Robins Befund — „Postboxen zu groß, Abstände zu groß, Schrift zu groß" — ist exakt die Diagnose, die jede moderne Social-Plattform für sich gelöst hat. Der Leitsatz:

**Ein Feed-Eintrag ist eine Zeile im Gespräch, kein Plakat.** Der Nutzer scannt 20–40 Einträge pro Minute. Jeder Pixel vertikaler Whitespace, den eine Card nicht braucht, kostet einen halben weiteren Eintrag „above the fold". Plattformen optimieren gnadenlos auf **Einträge pro Bildschirm**.

Faustregel der Branche: Auf einem Mobile-Screen (≈812 pt Höhe) sollen **2–3 Feed-Einträge** gleichzeitig sichtbar sein, nicht 1. Auf Desktop **3–4**.

---

## 2. Typografie-Skala

Social-Feeds sind erstaunlich kleinteilig. Niemand setzt Body-Text auf 16–17px im Feed.

| Element | Mobile | Desktop | Anmerkung |
|---|---|---|---|
| Post-Body / Fließtext | **14–15px** | 14–15px | Instagram Caption 14, X 15, Reddit 14 |
| Sekundär (Handle, Zeit, Meta) | **12–13px** | 12–13px | bewusst leiser |
| Mikro (Counts, Labels) | 11–12px | 11–12px | |
| Post-Titel im Feed | 15–17px | 16–18px | nur wo es Titel gibt (Reddit, Letterboxd) |
| Detail-/Artikel-Headline | 20–26px | 24–34px | nur die Einzel-Ansicht darf groß sein |
| Zeilenhöhe Body | 1.4–1.5 | 1.4–1.5 | nicht 1.7 |

**Konsequenz für VOD:** Editorial-Detailseiten dürfen die große DM-Serif-Headline behalten — das ist die Lese-Ansicht. **Im Feed** aber gehört alles eine Stufe kleiner: Body 14–15px, Titel ~16px, Meta 12px.

---

## 3. Spacing-Skala

Plattformen arbeiten mit einer **4-pt-Basis** und kleinen Schritten: `4 · 8 · 12 · 16`. `24` und `32` kommen im Feed praktisch nicht vor — die sind für Sektions-Trenner.

| Stelle | Branchen-Norm | Typischer VOD-Fehler |
|---|---|---|
| Card-Innenabstand (padding) | **12–16px** | 20–24px ist zu viel |
| Abstand zwischen Cards | **8–12px** | großzügige 20–28px-Lücken |
| Avatar ↔ Text-Gap | 8–10px | |
| Zeilen-Gap in der Meta-Zeile | 2–4px | |
| Sektions-Trenner (Feed ↔ Sidebar-Block) | 24–32px | hier ist Luft OK |

**Trennung statt Polster:** Plattformen trennen Cards mit einer **1px-Linie oder 8px-Lücke**, nicht mit 24px Luft. Die Linie kostet 1px, die Luft kostet einen halben Eintrag.

---

## 4. Anatomie einer Feed-Card

Die kompakte, überall gleiche Struktur:

```
┌─────────────────────────────────────────────┐
│ [Avatar 32–40px]  Name · Handle · 2h    [⋯]  │  ← Header-Zeile, ~40px hoch
│ Post-Text, 14–15px, 2–4 Zeilen, dann "more"  │  ← Body, geklemmt
│ [   Bild / Release-Cover — volle Breite   ]  │  ← Media, falls vorhanden
│ ♡ 14   💬 3   ↗            [bookmark]         │  ← Action-Zeile, ~36px
└─────────────────────────────────────────────┘
```

**Maße, die zählen:**
- **Avatar im Feed: 32–40px.** Nicht 48px. (Instagram 32, X 40, Reddit 32.) 48px+ nur auf der Profilseite/Detail.
- **Card-Höhe ohne Media: ~96–130px.** Wenn eine textlose Card höher ist, ist Padding/Font zu groß.
- **Text-Clamp:** Feed-Text wird nach **3–4 Zeilen** abgeschnitten („… mehr"). Der ganze Post lebt auf der Detailseite. Ein Feed zeigt nie den vollen Body.
- **Action-Zeile:** eine kompakte Reihe, ~32–36px hoch, Icons 16–18px.
- **Keine doppelten Ränder:** Card hat *entweder* einen Border *oder* eine Trennlinie zum Nachbarn — nicht beides plus Schatten plus Lücke.

**Editorial-/Curator-Cards** dürfen sich abheben (Goldlinie, etwas größerer Titel) — aber auch sie bleiben im selben Dichte-Raster, nur mit Akzent.

---

## 5. Navigation

### Mobile — Bottom-Tab-Bar ist Pflicht
Instagram, TikTok, X, Reddit: **alle** haben unten eine fixe Tab-Bar.
- Höhe **48–56px** + Safe-Area-Inset unten.
- 4–5 Slots, Icon ~24px, Label 10–11px (oder nur Icon).
- **Fix, immer sichtbar** (oder „hide on scroll down / show on scroll up" wie Instagram).
- Compose ist oft der hervorgehobene mittlere Slot (TikTok-`+`).

### Mobile — Top-Bar
- Schlank, **44–52px**, sticky.
- Logo/Titel links, 1–2 Aktionen rechts (Suche, Notifications mit Dot).
- Sekundär-Navigation (Feed/Explore/…): als **horizontal scrollbare Tab-Leiste** *direkt darunter*, sticky. Das ist legitim — der einzige erlaubte horizontale Scroll.

### Desktop
- Sticky Top-Header.
- Sekundär-Tabs als normale Leiste.
- Content **zentriert mit fixer Max-Breite** (siehe §7).

---

## 6. Bild-zuerst denken (Instagram/TikTok-Logik)

Robins Punkt aus Erweiterung 01 — „Bilder sind wichtig wie bei Instagram" — ist hier verankert:

- **Media füllt die Card-Breite randlos** (edge-to-edge), kein Innenabstand um das Bild.
- Einheitliches **Seitenverhältnis** für Feed-Media (Instagram: 4:5 Portrait bzw. 1:1; ein Feed mit gemischten Ratios wirkt unruhig). Für VOD bietet sich **1:1** an (Cover sind quadratisch).
- **Release-Cover als Inline-Card:** kleines Cover (48–64px) + Titel/Artist + Link — kompakt, eine Zeile hoch, nicht ein großer Block.
- Posts *ohne* jegliches Visual wirken im Bild-Feed schwach — daher der Composer-Hinweis (Erweiterung 01, gebaut): nudge zu Bild/Video/Release.

---

## 7. Layout-Breite & kein horizontaler Scroll

Robins Anforderung „Seite darf sich nicht nach links/rechts bewegen":

- **Body/Root: `overflow-x: clip`** (nicht `hidden` — `hidden` macht den Container zum Scroll-Container und bricht `position: sticky`). *(In der VOD Community bereits umgesetzt: `.cm-root { overflow-x: clip }`.)*
- **Feste, zentrierte Content-Spalte:**
  - Single-Column-Feed (Mobile-Stil auch auf Desktop, wie X/Threads): **600–680px** Feed-Breite.
  - Mit Sidebar (wie VOD-Hub): Feed **≈640px** + Sidebar **300–320px**.
- Auf Mobile: **`width: 100%`, `max-width: 100vw`, alles `box-sizing: border-box`** — kein Element darf breiter als der Viewport werden.
- Lange unumbrochene Strings (URLs, Catalog-Nummern, Handles) → **`overflow-wrap: anywhere`** auf allen Text-Containern. *(In VOD bereits gesetzt.)*
- Grids mit `minmax(0, 1fr)` statt `minmax(220px, 1fr)` als erste Spalte — `minmax(0,…)` verhindert das Aufblähen.

---

## 8. Touch-Targets & Interaktion

- **Tap-Target mindestens 44×44px** (Apple HIG) — auch wenn das Icon nur 18px ist, die klickbare Fläche ist 44px (Padding).
- Reaktionen: ein Tap = Default-Reaktion, Long-Press = Picker (Mobile). Desktop: Hover-Picker.
- Optimistische UI: der Like-Count springt sofort, nicht nach dem Roundtrip.
- Infinite Scroll mit Skeleton-Loadern, nicht „Seite 2"-Buttons.

---

## 9. Plattform-Kurzprofile

| Plattform | Was man konkret übernimmt |
|---|---|
| **Instagram** | Edge-to-edge-Media, 1:1/4:5-Ratio, schlanke Action-Zeile, Bottom-Nav mit Compose-Mitte, Caption geklemmt |
| **TikTok** | Compose als hervorgehobener mittlerer Tab; radikale Reduktion von Chrome |
| **Twitter/X** | Single-Column ~600px, hohe Dichte, 15px Body, 1px-Trennlinien statt Lücken, sticky Tabs |
| **Reddit (neu)** | Kompakte Card mit Titel + Mini-Thumbnail, Vote/Comment-Zeile sehr flach; „compact view"-Option |
| **Letterboxd** | Vorbild für die VOD-Tonalität: dicht, ruhig, bildbetont, kleine Typo — beweist, dass „dicht" nicht „billig" heißt |

---

## 10. Konkrete Ableitung für die VOD Community

Gegen den aktuellen Stand (rc67) — was das Konzept adressieren sollte:

| Bereich | Aktuell (zu großzügig) | Ziel-Richtung |
|---|---|---|
| Feed-Card-Padding | großzügig | 12–16px |
| Card-zu-Card-Abstand | große `gap`-Werte | 8–12px oder 1px-Linie |
| Feed-Avatar | 48px | 32–40px |
| Post-Body-Schrift | groß | 14–15px |
| Meta-Zeile | groß | 12px, leiser |
| Editorial-Hero | sehr groß | im Feed kompakt, groß nur auf der Detailseite |
| Mobile-Nav | kein Bottom-Tab in der Community-Surface | fixe Bottom-Tab-Bar |
| Mobile Sub-Nav | vorhanden, scrollbar | beibehalten, das ist korrekt |
| Horizontaler Scroll | gefixt (`overflow-x: clip`) ✓ | bleibt |
| Media | Cover teils als großer Block | edge-to-edge, einheitliches Ratio |

**Reihenfolge-Empfehlung fürs Konzept:** zuerst die Typo- + Spacing-Skala global festziehen (eine zentrale Stelle in `community.css` — das wirkt überall sofort), dann die Card-Anatomie, dann die Mobile-Bottom-Nav. Die ersten beiden Schritte holen den größten Teil von Robins „kompakter"-Wunsch ohne strukturellen Umbau.

---

**Ende der Referenz.** Sobald Robins Konzept steht, wird daraus die konkrete Umsetzung (Erweiterung 02).
