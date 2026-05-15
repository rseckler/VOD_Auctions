# Konzept — Inventory: Erfassung als Landing-Page

**Status:** Entwurf zur Review · **Datum:** 2026-05-15 · **Auslöser:** Frank/Robin-Feedback
**Bezug:** Workstream §1 (Inventur Workflow v2), [`INVENTUR_WORKFLOW_V2_KONZEPT.md`](INVENTUR_WORKFLOW_V2_KONZEPT.md)

---

## 1. Problem

Heute liegt der Inventory-Bereich auf zwei getrennten Seiten:

- **`/app/erp/inventory`** — Dashboard: Statistik-Karten, Fortschritt, HEUTE, Format-Fortschritt, Pro Person, Verlauf, Artikel-Tabelle.
- **`/app/erp/inventory/session`** — Erfassungs-Arbeitsplatz: Suche + Bewertungs-Formular + Label-Druck.

Dazwischen sitzt eine Karte **„Stocktake Session"** mit Button **„Session starten"**. Robin-Feedback: dieser Zwischenschritt ergibt keinen Sinn — man will einfach erfassen.

### Befund: „Session" ist kein echtes Objekt

Im Code verifiziert (2026-05-15):

- **„Session starten"** = eine Zeile `window.location.href = "/app/erp/inventory/session"`. Reine Navigation, kein Backend-Call.
- **Keine** DB-Tabelle `stocktake_session`, **kein** Session-Endpoint, **keine** Session-ID. `verify`/`add-copy` arbeiten rein **pro Artikel** und kennen kein Session-Konzept.
- **„Exit Session"** löscht nur ein Browser-`sessionStorage`-Flag und navigiert zurück.
- Einziger realer Zweck des Konstrukts: das `sessionStorage`-Flag `vod.inventory_session_active`, damit die Catalog-Detail-Seite einen „← Zurück zur Inventur-Session"-Button zeigen kann, wenn Frank zum Recherchieren wegspringt.

**Fazit:** Das Wort „Session" suggeriert eine Zeremonie (starten/beenden, Zustand), die es nicht gibt. Es ist ein verkleideter „Geh-zur-Erfassungs-Seite"-Button. Die Trennung *Dashboard ↔ Arbeitsplatz* ist legitim — nur die „Session"-Verpackung ist überflüssig.

---

## 2. Ziel

> „Mit Klick auf Inventory sollte idealerweise sofort die Erfassung möglich sein. Parallel soll in einem zweiten Tab das erscheinen, was wir jetzt als Einstiegsseite haben — Statistik oben, Liste aller erfassten Artikel unten. … unter der Voraussetzung, dass wir es nicht zu dicht machen." — Robin, 2026-05-15

**Kernanforderung:**
1. `/app/erp/inventory` öffnet **direkt den Erfassungs-Arbeitsplatz** — Suchfeld fokussiert, sofort scan-/tippbereit.
2. Das heutige Dashboard wandert in einen **zweiten Tab** (Statistik + Artikel-Liste).
3. Das Wort **„Session"** verschwindet komplett.
4. Auf der Erfassungs-Ansicht darf **ein schlanker Teil** der Statistik mitlaufen — aber **nicht überladen**, die Statistik muss erkennbar bleiben.

---

## 3. Soll-Konzept

### 3.1 Eine Seite, zwei Tabs

`/app/erp/inventory` wird eine **Tab-Seite**:

```
┌─ Inventory ───────────────────────────────── [33%] ┐
│  ( Erfassung )   ( Übersicht )                       │   ← Tab-Switcher
├──────────────────────────────────────────────────────┤
│  TAB „Erfassung" (Default beim Öffnen)               │
│  ┌────────────────────────────────────────────────┐ │
│  │ 5.447 / 16.756 verifiziert · heute 230 · 14/h   │ │   ← schlanker Fortschritts-Streifen
│  └────────────────────────────────────────────────┘ │
│  [ Suche / Barcode ............................. ]  │   ← auto-fokussiert
│  → Suchergebnisse / Bewertungs-Formular / Label      │
│  → Zuletzt erfasst (recent activity)                 │
└──────────────────────────────────────────────────────┘
```

- **Tab „Erfassung"** = heutiger Inhalt von `session/page.tsx` (Suche, Bewertungs-Formular, Label-Druck, „Zuletzt erfasst"). **Default-Tab** — beim Öffnen aktiv, Suchfeld fokussiert.
- **Tab „Übersicht"** = heutiger Inhalt von `inventory/page.tsx` (4 Statistik-Karten, Fortschrittsbalken, HEUTE, Format-Fortschritt, Pro Person, Verlauf heute, Artikel-Tabelle mit Filtern + CSV, Bulk-Price-Tools, Fehlbestands-Check).

### 3.2 Die Dichte-Frage — schlanker Fortschritts-Streifen

Empfehlung: Die **volle** Analytik (4 große Karten, Format-Fortschritt, Pro Person, Verlauf-Charts) bleibt **ausschließlich im Übersicht-Tab**. Auf dem Erfassungs-Tab läuft nur ein **einzeiliger Fortschritts-Streifen** mit den 3 Kennzahlen, die *während* des Erfassens echten Wert haben:

- **Verifiziert-Fortschritt** — `5.447 / 16.756 (33 %)` + dünner Balken
- **Heute** — `230 verifiziert`
- **Tempo** — `14 Items/h jetzt`

Das gibt Frank Live-Feedback am Arbeitsplatz, ohne die Erfassung visuell zuzustellen. Alles Weitere ist einen Tab-Klick entfernt. (Der Erfassungs-Arbeitsplatz hat heute schon eine kleine Stats-Anzeige — die wird auf diesen Streifen reduziert/vereinheitlicht.)

> **Offene Entscheidung A:** Reicht der 3-Kennzahlen-Streifen, oder soll z. B. der Format-Fortschritt (Vinyl/Tape/Print) auch mit auf den Erfassungs-Tab? Risiko: macht es dichter. Empfehlung: erst mit dem schlanken Streifen live gehen, bei Bedarf nachlegen.

### 3.3 „Session"-Vokabular raus

| Heute | Neu |
|---|---|
| Karte „Stocktake Session" + Button „Session starten" | entfällt — Erfassung ist der Default-Tab |
| Button „Exit Session" | entfällt — man wechselt einfach den Tab |
| Button „Dashboard" (auf der Session-Seite) | entfällt — Tab „Übersicht" |
| `sessionStorage`-Flag `vod.inventory_session_active` | bleibt als internes Plumbing (s. 3.4), aber nie im UI sichtbar |

### 3.4 Routing & Catalog-Cross-Link

- **`/app/erp/inventory`** — Tab-Seite, Default `?tab=erfassung`.
- **`?tab=`-Query-Param** für Deep-Links — `?tab=uebersicht` öffnet direkt die Übersicht. Notwendig, damit der Catalog-Detail-Back-Link weiter funktioniert.
- **`/app/erp/inventory/session`** (alte Route) — wird ein **Redirect** auf `/app/erp/inventory?tab=erfassung` (alte Bookmarks/Links brechen nicht), oder ersatzlos entfernt. → Offene Entscheidung B.
- **Catalog-Detail-Back-Button:** „← Zurück zur Inventur-Session" → umbenennen in „← Zurück zur Erfassung", Ziel `/app/erp/inventory?tab=erfassung`. Das `sessionStorage`-Flag steuert weiterhin, *ob* der Button erscheint (wird gesetzt wenn der Erfassungs-Tab aktiv war).

### 3.5 Technische Struktur

Beide Dateien sind groß (`inventory/page.tsx` 999 LOC, `session/page.tsx` 1.487 LOC). **Nicht** in eine 2.500-LOC-Datei mergen. Stattdessen:

- `erp/inventory/page.tsx` → schlanke **Tab-Shell**: Tab-State (aus `?tab=`), rendert `<ErfassungTab/>` oder `<UebersichtTab/>`.
- Heutiger `session/page.tsx`-Inhalt → Komponente `ErfassungTab` (in `admin/components/inventory/` oder als lokale Komponente).
- Heutiger `inventory/page.tsx`-Inhalt → Komponente `UebersichtTab`.
- `erp/inventory/session/page.tsx` → Redirect oder Löschung (Entscheidung B).

Kein `defineRouteConfig` betroffen — beide Seiten sind heute schon Sub-Pages des ERP-Hubs (Aufruf über die ERP-Hub-Karte).

**Lazy-Mount:** Nur der aktive Tab rendert seinen Inhalt. Vorteil: Beim Öffnen von Inventory laufen **nicht mehr** die 9 schweren Aggregat-Queries des Dashboards (1–10 s) — die feuern erst, wenn Frank den Übersicht-Tab öffnet. Das macht den Einstieg spürbar schneller. Der Erfassungs-Tab muss beim Aktivieren das Suchfeld fokussieren (heutiges Mount-Verhalten an Tab-Aktivierung koppeln).

---

## 4. Bewertung — ist das sinnvoll?

**Ja.** Begründung:

- ✅ Entspricht 1:1 dem tatsächlichen Arbeitsablauf — Frank/David öffnen Inventory, um zu erfassen, nicht um Dashboards zu lesen.
- ✅ Entfernt einen Schritt + ein irreführendes Konzept („Session") ohne irgendeine Funktion zu verlieren — es gibt nichts zu „beenden".
- ✅ Keine Daten-/Backend-Änderung, keine Migration — rein Frontend-Restrukturierung.
- ✅ Performance-Nebengewinn: schwere Dashboard-Queries erst auf Tab-Wechsel.
- ✅ Kein Concurrency-Risiko: Es gab nie eine Session-Isolation — Frank + David arbeiten heute schon gleichzeitig unter demselben Login, `verify` ist pro Artikel atomar.

**Gegenargument / Risiko:** Wer heute gezielt das Dashboard sehen will, hat einen Klick mehr (Tab „Übersicht"). Bewertung: akzeptabel — die Erfassung ist der 10×-häufigere Vorgang.

---

## 5. Entscheidungen (abgezeichnet 2026-05-15)

| # | Frage | Entscheidung |
|---|---|---|
| **A** | Fortschritts-Streifen auf Erfassungs-Tab: nur 3 Kennzahlen, oder + Format-Fortschritt? | ✅ **Nur 3 Kennzahlen** (verifiziert-Fortschritt · heute · Items/h), schlank |
| **B** | Alte Route `/app/erp/inventory/session`: Redirect behalten oder hart entfernen? | ✅ **Redirect** auf `/app/erp/inventory?tab=erfassung` |
| **C** | Tab-Beschriftung | ✅ **„Erfassung" / „Übersicht"** |
| **D** | Default-Tab immer „Erfassung" | ✅ **Ja** |

---

## 6. Implementierungs-Skizze & Aufwand

1. Tab-Shell in `erp/inventory/page.tsx` (Tab-State aus `?tab=`, Default `erfassung`).
2. `session/page.tsx`-Inhalt → `ErfassungTab`-Komponente; Mount-Logik (Suchfeld-Fokus, `sessionStorage`-Flag) an Tab-Aktivierung koppeln.
3. `inventory/page.tsx`-Inhalt → `UebersichtTab`-Komponente; Deep-Stats-Load erst bei Tab-Aktivierung.
4. Schlanker Fortschritts-Streifen oben im `ErfassungTab` (3 Kennzahlen aus `/stats/quick`).
5. „Session"-Vokabular entfernen (Karte, 3 Buttons).
6. Catalog-Detail-Back-Link umbenennen + Ziel auf `?tab=erfassung`.
7. `session/page.tsx` → Redirect (Entscheidung B).
8. Smoke-Test: Keyboard-Shortcuts der Erfassung, Label-Druck, Tab-Wechsel, Deep-Link `?tab=uebersicht`, Catalog-Rücksprung.

**Aufwand:** mittel, ~3–5 h. Kein Backend, keine DB. Risiko niedrig — überwiegend Code-Verschiebung; Sorgfalt nötig bei der Mount-/Fokus-/Shortcut-Logik des Erfassungs-Tabs.

---

## 7. Nächster Schritt

Robin reviewt das Konzept + entscheidet A–D. Danach Umsetzung als ein rc-Release (Frontend-only).
