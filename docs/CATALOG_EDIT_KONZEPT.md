# Catalog-Editieren — was als Nächstes kommt

**Stand:** 2026-04-30 · **Für:** Frank · **Status:** 5 von 6 Tasks LIVE (rc52.6 → rc52.6.3)

## Umsetzungs-Status

| # | Task | Status | RC |
|---|---|---|---|
| 1 | Bild-Galerie (Upload · Reorder · Cover-Set · Delete) | ✅ LIVE | rc52.6 |
| 2 | Credits-Field editierbar | ✅ LIVE | rc52.6 |
| 3 | Contributing Artists CRUD | ✅ LIVE | rc52.6.1 |
| 4 | Tracklist Tape-Mag-Migration | ✅ LIVE (19.137 Releases / 188.505 Track-Rows) | rc52.6.2 |
| 5 | Schnell-Edit pro Exemplar | ✅ LIVE | rc52.6.3 |
| 6 | Reviews/Comments Admin-UI | ⏸ pendend (war „bei Bedarf") | — |

**Worklist** für Tracklist-Edge-Cases aus dem 1000-Release-Vorlauf: [`docs/operations/suspicious_tracks_post_rc52.6.2.csv`](operations/suspicious_tracks_post_rc52.6.2.csv) — 139 Releases / 493 Issues, Top-Issue ist `duration_in_title` (Tracks deren Title aussieht wie eine Duration). Im Track-Management-UI manuell fixbar.

---

---

## Was bisher schon geht

Du kannst eine Platte im Backend öffnen (`/app/media/<id>`) und folgendes selbst ändern:

- **Stammdaten:** Titel · Künstler · Label · Jahr · Land · Catalog-Nr. · Barcode · Beschreibung · Format (71-Wert-Picker) · Format-Descriptors · Genres · Styles
- **Tracklist** (bei Discogs-importierten Releases): Tracks anlegen, umsortieren, ändern, löschen
- **Discogs-ID** ändern → öffnet Vorschau, du kannst pro Feld entscheiden ob du übernimmst
- **Cover-Bild** wechseln über den Discogs-Apply-Pfad (nicht direkt)
- **Preise / Verkaufseinstellungen** (Shop-Preis, Zustand, Lager, Versand-Kategorie)
- **Edit-History** — jede Änderung ist nachvollziehbar, einzelne Felder sind per Klick rückgängig machbar
- **Per-Feld-Lock:** sobald du ein Stammdaten-Feld editierst, wird es vor dem nächtlichen Tape-Mag-Sync geschützt (Schloss-Symbol)

## Was noch fehlt — und der Plan

| Priorität | Was wird neu | Was du dann kannst |
|---|---|---|
| **1 — zuerst** | **Bild-Galerie** | Mehrere Fotos pro Platte hochladen (auch vom iPhone), Reihenfolge per Drag&Drop ändern, einzelne Bilder löschen, Cover bestimmen ohne über Discogs zu gehen |
| **2 — schnell mit dabei** | **Credits-Feld** editierbar | Mitwirkende, Produzenten, „Recorded at …" usw. direkt im Edit-Card eingeben statt aus Discogs übernehmen zu müssen |
| **3 — danach** | **Contributing Artists** (Mitwirkende mit Rolle) | Bei Compilations / Various-Artist-Platten: einzelne Künstler mit Rolle hinzufügen oder rausnehmen |
| **4 — bei Bedarf** | **Tracklist bei Tape-Mag-Platten** | Aktuell ist die Tracklist bei den Tape-Mag-Importen ein Freitext-Block, der nicht direkt editierbar ist — wir machen das genauso bedienbar wie bei Discogs-Importen |
| **5 — bei Bedarf** | **Schnell-Edit pro Exemplar** | Kleiner Stift-Button am Exemplar in der Detail-Page → Preis / Zustand / Lagerort ändern, ohne eine ganze Stocktake-Session aufzumachen |
| **6 — später** | **Reviews & Kommentare** | Falls wir Kunden-Reviews freischalten: Liste mit Approve / Verstecken / Löschen |

## Was sich für dich praktisch ändert

**Wenn #1 + #2 fertig sind:**
Du klickst auf eine Platte → siehst alle Bilder als Galerie mit Drag-Handles → kannst direkt ein neues Foto hochladen (z.B. Rückseite, Innenhülle, Beilage). Daneben das normale Edit-Card mit allen Stammdaten-Feldern inkl. **Credits**. Kein Umweg mehr über Discogs-Apply nur um ein Bild zu wechseln.

**Wenn #3 fertig ist:**
Bei Various-Artists-Platten siehst du die Liste der Mitwirkenden mit ihrer Rolle und kannst sie pflegen — heute ist das nur lesbar.

**Wenn #5 fertig ist:**
Beim Edit-View einer Platte kannst du pro Exemplar (also pro Lager-Stück, das du im Inventory verifiziert hast) den Preis oder Zustand schnell anpassen, ohne nochmal in den Stocktake-Workflow zu gehen.

## Was nicht angetastet wird

- Der Stocktake-Workflow bleibt wie er ist (Mac Studio wie MacBook Air, jeweils mit Brother-Drucker)
- Die Sync-Lock-Logik (Schloss-Icons) bleibt — Felder die du editierst bleiben auch nach dem Tape-Mag-Sync deine
- Die Storefront-Anzeige ändert sich nicht durch diese Edit-Funktionen — nur die Werte die da angezeigt werden, kommen jetzt aus deinen Edits

## Geschätzte Reihenfolge

- **#1 Bilder** — etwa 1–2 Tage Entwicklung, danach live
- **#2 Credits** — wenige Stunden, kann mit #1 zusammen kommen
- **#3 Contributing Artists** — halber Tag
- **#4–6** — je halber Tag, ziehen wir nach Bedarf

Robin entscheidet wann es losgeht und ob alles auf einmal oder in mehreren Schritten kommt.
