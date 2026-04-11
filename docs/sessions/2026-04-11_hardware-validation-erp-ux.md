# Session 2026-04-11 — Hardware Validation + ERP UX Enhancements

**Dauer:** ganzer Tag (11.04.2026)
**Teilnehmer:** Robin + Frank (mit Hardware im Laden)
**Fokus:** Brother QL-820NWBc + DK-22210 + Inateck BCST-70 Hardware-Test, Production-Code-Fixes für Barcode-Labels, Scanner-Integration im Stocktake-Workflow, Inventur-Audit-Trail auf Media Detail Page, POS Walk-in Sale Design-Dokument

---

## TL;DR

- **Hardware komplett validiert** — Brother QL-820NWBc + Inateck BCST-70 + DK-22210 drucken und scannen wie geplant, nach ~25 Testdrucken und 3 gefundenen Hardware-Bugs. Die komplette Inventur-Pipeline ist damit **scanner-ready für die 4–6 Wochen Stocktake-Phase**.
- **3 Releases veröffentlicht**: rc19 (Label-Hardware-Fix), rc21 (Session-Scanner-Integration), rc22 (Media Detail Inventory Section).
- **Neues POS Walk-in Sale Konzept** (Draft) nach Franks Frage nach dem Laden-Verkaufsprozess. Architektur steht, 8 offene §10-Entscheidungen müssen mit Steuerberater geklärt werden.
- **Sync-Schutz-Review**: `legacy_sync_v2.py` läuft seit 6 Tagen stabil (143 Runs, 0 failed), aber die V5-Validation ist noch nie unter Last getestet worden, weil es keine `price_locked`-Items gibt. Vor Bulk +15% braucht es einen Scratch-Test mit einem Einzel-Item, um den Schutz real zu verifizieren.

---

## 1. Hardware-Test Brother QL-820NWBc — das 3-Ebenen-Problem

Der Hardware-Stack kam heute morgen in Betrieb (Drucker + Scanner am Mac angeschlossen). Der erste Test-Druck aus der bestehenden `backend/src/lib/barcode-label.ts` produzierte ein **~29×30mm quadratisches Label** mit verstümmeltem Content — etwa ein Drittel des geplanten 62mm langen Labels. Was wie ein simpler Bug aussah, war in Wahrheit eine Verkettung aus **drei eigenständigen Fehlern**, die jeder einzeln zum gleichen Symptom geführt hätten.

### Bug 1: Command Mode „P-touch Template" statt „Raster"

Der QL-820NWBc wird ab Werk im **`P-touch Template`**-Mode ausgeliefert. In diesem Mode interpretiert der Drucker eingehende CUPS-Daten als Template-Füllung und druckt auf eine intern einkodierte Default-Template-Länge (~29mm) — **egal** was CUPS oder die PDF-Seitengröße sagen.

**Diagnose-Zeit:** Mehrere Stunden Debugging, bis wir das Brother Web-Interface (`https://<printer-ip>/`) entdeckten. Passwort steht auf dem Drucker-Rückseite als „Pwd". Unter **Printer Settings → Device Settings → Command Mode** umschaltbar auf `Raster`.

**Verifikation:**
```bash
curl -sk -L -c /tmp/cj -b /tmp/cj \
  -d "B14b=<password>" -d "loginurl=/printer/device_settings.html" \
  "https://<printer-ip>/home/status.html" -o /tmp/ds.html
grep -oE 'value="2[012]"[^>]*selected[^>]*' /tmp/ds.html
# value="21" selected = Raster ✓
```

### Bug 2: PageSize ohne `Custom.`-Prefix

Die installierte PPD (`/etc/cups/ppd/Brother_QL_820NWB.ppd`) hat vordefinierte PageSize-Namen wie `29x62mm`, `29x90mm` — **alle entsprechen DK-11xxx Die-Cut-Rollen**, nicht der DK-22210 Continuous-Rolle. Wenn man `-o PageSize=29x90mm` setzt, erwartet der Brother-Treiber fest vorgestanzte 90mm-Labels → Konflikt mit der Endlos-Rolle → Fallback auf Default-Cut.

**Lösung:** `-o PageSize=Custom.29x90mm` (mit `Custom.`-Prefix). Das zwingt den Treiber in den Continuous-Tape-Mode und nimmt die Höhe als echte Cut-Länge.

**Queue-Default auf user-level setzen**, damit `lp` ohne explizite `-o`-Option reicht:
```bash
lpoptions -p Brother_QL_820NWB -o PageSize=Custom.29x90mm
```
(Schreibt in `~/.cups/lpoptions`, kein sudo nötig.)

### Bug 3: PDF in Landscape statt Portrait mit Rotation

Die intuitive Annahme war: Ein Label das „breiter als hoch" ist, baut man als Landscape-PDF `[90mm, 29mm]`. **Falsch** — der Brother-Treiber erwartet Portrait `[29mm, 90mm]`, wobei die erste Dimension = Tape-Breite. Der Content muss via **`doc.rotate(-90, {origin:[0,0]}) + doc.translate(-LABEL_LENGTH, 0)`** in einen virtuellen 90×29 Landscape-Frame gezeichnet werden.

Ohne diese Transformation wird der Content entweder auf 29mm skaliert (schrumpft um Faktor 3) oder rechts geclippt.

### Bug 4 (Scanner): Inateck BCST-70 mit US-Keyboard auf DE-QWERTZ

Der Scanner lieferte beim Test in TextEdit `VODß000001` statt `VOD-000001`. Klassisches Keyboard-Layout-Mismatch: Der US-Keycode `0x2D` (für `-`) liegt auf deutschem QWERTZ an der Position `ß`.

**Fix via Setup-Barcodes** aus dem BCST-70 Handbuch §1.6 (Seite 27): Zwei Sessions, je 3 Barcodes scannen:
1. **„Beginn der Einrichtung" → „MacOS/iOS Modus" → „Speichern und Beenden"**
2. **„Beginn der Einrichtung" → „Deutsche Tastatur" → „Speichern und Beenden"**

Persistent gespeichert, funktioniert auch für zukünftige externe Barcodes mit Sonderzeichen.

### Das finale funktionierende Setup

```bash
lp -d Brother_QL_820NWB /pfad/zum/label.pdf
```
mit:
1. Drucker im Raster-Mode (einmalig via Web-EWS)
2. Queue-Default `Custom.29x90mm` (einmalig via lpoptions)
3. PDF als `[29mm, 90mm]` portrait mit `doc.rotate(-90) + doc.translate(-LABEL_LENGTH, 0)`

Alle drei Einstellungen zusammen ergeben das hardware-validierte Label aus v6:

```
┌────────────────────────────────────────────────┐  29mm
│    |||||||||||||||||||||||||  (70% centered)  │  Barcode 9mm
│           VOD-000001                           │
│                                                │
│  Cabaret Voltaire                 │            │  Artist 12pt bold
│  Red Mecca · Mute Records         │   €45      │  Title · Label 10pt
│  LP · UK · VG+ · 1981             │            │  Meta 8pt / Preis 22pt
└────────────────────────────────────────────────┘
                     90mm
```

**→ Alle Details + Debugging-Kompass:** `docs/hardware/BROTHER_QL_820NWB_SETUP.md`

---

## 2. POS Walk-in Sale Konzept v1.0 (Draft)

Frank fragte mitten in der Session nach dem **Verkaufsprozess im Laden**: „Frank steht im Laden und möchte eine Platte verkaufen. Auf welcher Oberfläche macht er das?" — ein Thema, das bisher nirgends durchdacht war und einen klaren blinden Fleck im bestehenden System darstellt. Das Storefront (`vod-auctions.com`) kennt nur Online-Käufer, das Admin kennt keine POS-Funktion.

### Franks 4 Antworten (im Konzept §2 festgehalten)

| Frage | Antwort | Konsequenz |
|---|---|---|
| Frequenz? | 5+/Tag | Option B (dedizierte POS-Page mit Cart) |
| Quittungen + TSE? | Ja, brauchen wir | Cloud-TSE + Bon-Druck Pflicht |
| Payment? | SumUp | Phase 1 extern, Phase 2 optional REST API |
| Kunden? | Beides (bestehend + anlegen + anonym) | 3 Modi im Customer-Panel |

### Architektur-Entscheidungen

- **Keine separaten POS-Tabellen** — Erweiterung der bestehenden `transaction`-Tabelle mit neuem `item_type='walk_in_sale'`, neuen `payment_provider`-Werten (`sumup`, `cash`), neuen TSE-Spalten (`tse_signature`, `tse_transaction_number`, `tse_signed_at`, `tse_serial_number`)
- **Cart ephemer im Client-State** (Zustand), nicht in der DB — POS-Sessions dauern <2 Min, Persistierung wäre Overkill
- **fiskaly als TSE-Anbieter** (Empfehlung, ~15€/Monat + Cent-Bruchteile pro Bon) — Cloud-TSE statt Hardware-TSE für Flexibilität und keine Hardware-Investition
- **Bon-Druck auf bestehendem Brother QL-820NWB** mit neuer Rolle **DK-22205 (62mm)** — Hardware ist schon validiert, nur Rollen-Wechsel nötig

### Implementierungs-Phasen

| Phase | Inhalt | Aufwand |
|---|---|---|
| **P1** | Core POS-UI mit Cart, ohne TSE, Mock-Bon | ~2 Tage |
| **P2** | fiskaly TSE-Integration | ~2 Tage |
| **P3** | Bon-Druck auf Brother 62mm Rolle | ~1 Tag |
| **P4** | SumUp REST API (optional) | ~2-3 Tage |

**Gesamt P1–P3 ~5 Arbeitstage** für produktiven Mindest-Funktionsumfang.

### 8 offene §10-Entscheidungen (blockieren Implementierung)

1. TSE-Anbieter final (fiskaly vs. efsta vs. andere) — Kosten konkret vergleichen
2. **Kleinunternehmer-Status nach §19 UStG** — Steuerberater fragen, ändert Bon-Layout signifikant
3. Bon-Hardware: Brother QL + 62mm Rolle vs. dedizierter POS-Thermo (~150-250€)
4. Retoure-Workflow (TSE-Storno)
5. Storefront-Conflict bei Live-Auktionen: hard-block oder soft-warning?
6. Kassensturz-Report nötig?
7. iPad vs. Mac-only Support
8. SumUp-Integration-Level (extern vs. REST API)

**→ Volles Konzept:** `docs/optimizing/POS_WALK_IN_KONZEPT.md` (405 Zeilen)

---

## 3. Scanner-Integration im Session-Screen — Race-Condition-Fix

Nach erfolgreicher Hardware-Validation kam der Test: Der Scanner sollte im Admin-Session-Screen funktionieren, damit Frank mitten in einer laufenden Stocktake-Session ein beliebiges Item scannen und direkt dazu springen kann. Beim Code-Review der bestehenden `session/page.tsx` fiel ein **kritischer Race-Condition-Bug** auf.

### Der Bug

Der Session-Screen hatte zwei separate `keydown`-Handler:
1. **Scanner-Detection** (Capture-Phase, `useScannerDetection`-Hook) — puffert Scanner-Chars, fires `onScan` bei Enter
2. **Shortcut-Handler** (Bubble-Phase) — V/P/M/S/N/L/U und Arrow-Keys

Wenn der Scanner `VOD-000001\n` tippt (10 Chars @ ~5ms pro Char), erreicht der **erste** `V`-Keystroke BEIDE Handler. Der Shortcut-Handler sieht `V` → feuert sofort `handleVerify()` **bevor** der Scanner-Buffer komplett ist. Ergebnis: Ein Scan würde ungewollt das aktuelle Item verifizieren, bevor überhaupt der Scan-Lookup läuft.

### Der Fix — Unified Handler mit 40ms Debounce

Beide Handler in einen einzigen `useEffect` konsolidiert. Das Muster:

- Jeder printable-Key startet einen **40ms-`setTimeout`** für die Shortcut-Action
- Jeder nachfolgende Key **cancelt den vorherigen Timer**
- Scanner-Chars kommen alle 5–15ms → Timer permanent gecancelt → Shortcut feuert **nie** während eines Scans
- Human-Key hat >80ms Abstand zum nächsten Keystroke → Timer läuft durch → Shortcut feuert mit 40ms Latenz (imperceptibel)

Der Scanner-Buffer akkumuliert wie bisher, `Enter` triggert `handleScanBarcode` und cancelt gleichzeitig den pendingen Shortcut-Timer explizit (doppelt sicher). Arrow-Keys und Escape umgehen den Debounce für sofortige Reaktion.

Damit ist **Phase B6** aus `INVENTUR_COHORT_A_KONZEPT.md §14.11` abgeschlossen.

---

## 4. Media Detail Inventory Status Section — Audit-Trail pro Release

Franks nächste Frage, direkt nach dem Scanner-Fix: „Im Backend müssen wir auch die Info haben, was dann bei dem Inventur-Schritt eingegeben wurde und dass auch der Inventur-Schritt final gemacht wurde." — ein klarer Bedarf nach einer zentralen Audit-Trail-Ansicht für ein einzelnes Release.

### Neue Sektion auf `/app/media/:id`

Zwischen „Edit Valuation" und „Discogs Data", nur gerendert wenn das Release ein `erp_inventory_item` hat (= Cohort A).

- **Status-Badges**: Verifiziert / Nicht verifiziert / Missing / Verkauft / Beschädigt / 🔒 Preis gesperrt
- **Metadata-Grid**: Barcode, Barcode gedruckt, Letzter Stocktake, Lagerbestand, Status, Quelle, Lagerort (JOIN auf `warehouse_location.name`), Preis-Lock-Zeitpunkt
- **Inventur-Notizen** (wenn vorhanden)
- **2 Action-Buttons**:
  - 📋 „In Stocktake-Session laden" → `?item_id=X` Deep-Link
  - 🏷️ „Label drucken" → direkt `/admin/erp/inventory/items/:id/label`
- **Movement-Timeline**: bis zu 30 Einträge aus `erp_inventory_movement` mit Datum, Typ (farbige Badges), Grund, Menge, Actor, Reference

### Neuer Endpoint `GET /admin/erp/inventory/items/:id`

Der bestehende `/scan/:barcode`-Endpoint funktioniert nur für Items mit bereits zugewiesenem Barcode. Für den „In Session laden"-Button brauchte es einen zweiten Lookup-Pfad für Items **ohne** Barcode (noch nie verifiziert). Der neue Endpoint nimmt `erp_inventory_item.id` als Path-Parameter und returniert **exakt das gleiche QueueItem-Format** wie `/scan/:barcode`, damit die Session-Page den gleichen State-Handler für beide Pfade nutzen kann.

Die Session-Page hat einen neuen `useEffect` der `?item_id=X` aus der URL parst, den Endpoint aufruft, das Item an Position 0 im Cart einfügt, und den Query-Param via `history.replaceState` wegräumt, damit ein Refresh nicht endlos lädt.

---

## 5. Sync-Schutz-Review & Pre-Bulk-Strategie

Bei der Frage „Ist der Sync-Schutz ready für Bulk +15%?" haben wir einen genauen Check der `sync_log`-Historie über Supabase MCP gemacht.

### Was wir gefunden haben (Data snapshot vom 2026-04-11)

- **143 Sync-Runs über 6 Tage** (seit 2026-04-05, also seit dem `legacy_sync_v2.py v2.0.0`-Deploy)
- **0 Runs mit `phase='failed'`**
- **0 Runs mit `validation_status='failed'`**
- **143 Runs mit `validation_status='warnings'`** — aber: die Warnings sind alle V3 orphan_labels (216 Releases, die auf einen nicht-existierenden `Label`-Eintrag verweisen), ein **vorbestehendes Datenqualitätsproblem** das den Sync nicht blockiert und nicht mit V5 zusammenhängt
- `erp_inventory_item`: **13.107 Items, davon 0 mit `price_locked=true`**
- `bulk_price_adjustment_log`: **leer** (Bulk nie ausgeführt)

### Die Erkenntnis

Die 24h-Stabilitäts-Regel aus `INVENTUR_COHORT_A_KONZEPT.md §13` ist **formal erfüllt**, ABER: die V5-Validation **testet technisch nichts**, solange es keine `price_locked`-Items gibt. V5 prüft in `sync_change_log` ob ein `legacy_price`-Update für ein price_locked-Item eingetragen wurde — mit 0 solchen Items ist der Check trivial passend.

Das bedeutet: **Der Sync-Schutz ist zwar seit 6 Tagen deployed, aber wurde nie unter Last getestet.** Wenn der Bulk +15% jetzt über alle 13.107 Items rausjagt und V5 einen Bug hätte, wüssten wir es erst nach dem ersten Sync-Run — mit einem halb verpufften Bulk.

### Der empfohlene Pre-Bulk-Scratch-Test

**Ablauf** (~1–2h inklusive Sync-Wartezeit):

1. **ERP_INVENTORY Flag auf ON** im Admin (`/app/config` → Feature Flags)
2. **Stocktake-Session öffnen**, ein **einzelnes Test-Item verifizieren** (Taste `V` ohne Preisänderung). Das setzt `price_locked=true` auf genau diesem einen Item.
3. **Warten auf den nächsten stündlichen Sync-Run** (läuft zur vollen Stunde, ≤60 Min)
4. **V5-Ergebnis prüfen** in der DB:
   ```sql
   -- In sync_log: darf keinen V5-Eintrag in validation_errors haben
   SELECT validation_errors FROM sync_log
   WHERE started_at = (SELECT MAX(started_at) FROM sync_log WHERE phase='success');

   -- In sync_change_log: das Test-Item darf keinen legacy_price-Change haben
   SELECT * FROM sync_change_log
   WHERE release_id = '<test-release-id>'
   AND field = 'legacy_price'
   AND run_id = '<letzter-run-id>';
   -- Erwartung: 0 Rows
   ```
5. **Wenn V5 passed** → Bulk +15% ausführen (Sync-Schutz in Echtzeit bewiesen)
6. **Wenn V5 failed** → STOPP, Bug im Sync-Schutz, erst fixen

Damit ist das Risiko praktisch null: Wir verifizieren den Schutz an **einem** Item, bevor wir ihn auf 13.107 Items scharf stellen.

---

## 6. Releases

| Release | Titel | Commits |
|---|---|---|
| [v1.0.0-rc19](https://github.com/rseckler/VOD_Auctions/releases/tag/v1.0.0-rc19) | Barcode-Label Hardware Validation + v6 Layout | `b6a4ea4` |
| [v1.0.0-rc21](https://github.com/rseckler/VOD_Auctions/releases/tag/v1.0.0-rc21) | Scanner Integration in Stocktake Session + POS Konzept Draft | `0f2511b`, `1977744`, `e1d8be2` |
| [v1.0.0-rc22](https://github.com/rseckler/VOD_Auctions/releases/tag/v1.0.0-rc22) | Media Detail Inventory Status Section + Deep-Link | `78c98c5`, `7e91e1e` |

(rc20 ist parallel aus anderer Arbeit entstanden: „Discogs Import: Full Decoupling + Post-Import CTA + Media Import History")

---

## 7. Offene Entscheidungen & Next Actions

### Kurzfristig (diese Woche)

- [ ] **Bulk +15% Scratch-Test** — ERP_INVENTORY Flag ON, 1 Test-Item verifizieren, Sync-Run abwarten, V5 prüfen, dann Bulk. Voraussetzung für Inventur-Start.
- [ ] **Bulk +15% auf 13.107 Cohort-A Items** ausführen (nach erfolgreichem Scratch-Test)
- [ ] **Inventur-Session starten** (Frank, 4–6 Wochen)

### Mittelfristig

- [ ] **POS §10 mit Steuerberater klären**:
  - Kleinunternehmer-Status (§19 UStG) — ändert Bon-Layout
  - TSE-Anbieter final (fiskaly/efsta/andere)
  - Bon-Hardware: Brother QL + 62mm Rolle oder dedizierter POS-Thermo?
- [ ] **POS P1 Implementierung** (~2 Arbeitstage, sobald §10 geklärt)
- [ ] **POS P2 TSE-Integration** (~2 Arbeitstage, nach P1)
- [ ] **POS P3 Bon-Druck** (~1 Arbeitstag, nach P2)

### Nice-to-have / Later

- [ ] **Phase B7 — QZ Tray Silent-Print** für Admin-Session (aktuell Browser-Print-Dialog als Fallback, funktioniert)
- [ ] **POS P4 SumUp REST API** (falls Volumen das rechtfertigt)
- [ ] **End-to-End-Test via Admin-UI** mit ERP_INVENTORY Flag ON — der volle Medusa-API-Stack-Test, bisher nur via `lp` direkt validiert
- [ ] **POS Retoure-Workflow** (TSE-Storno, Phase 2)

---

## 8. Key Learnings für Future-Reference

### Die drei Ebenen der Brother-QL-Konfiguration

Merke: Jeder dieser drei Einstellungen muss stimmen, sonst quadratisches ~29×30mm Label:
1. **Drucker-Command-Mode**: `Raster` (nicht `P-touch Template`) → einmalig via Brother Web-Interface
2. **CUPS PageSize**: `Custom.29x90mm` (mit `Custom.`-Prefix) → per `lpoptions` oder `-o` Flag
3. **PDF-Orientation**: `[29mm, 90mm]` portrait mit `doc.rotate(-90, {origin:[0,0]}) + doc.translate(-LABEL_LENGTH, 0)` für Content

### Scanner-Race-Condition Pattern

Wenn du zwei Event-Listener auf `keydown` hast — einer für schnellen HID-Scanner-Input und einer für Single-Key-Shortcuts — verhindere die Race-Condition via **Debounce auf dem Shortcut-Handler**, nicht via `stopPropagation` im Scanner-Handler. Grund: `stopPropagation` im Capture-Phase blockt nicht andere Listener auf demselben Target, man braucht `stopImmediatePropagation` — und das macht den ersten Char trotzdem nicht verschluckbar. Debounce ist robuster:

```tsx
// Ein Handler, beide Zwecke
const handleKey = (e: KeyboardEvent) => {
  // ... buffer scanner char ...

  // Schedule shortcut with 40ms debounce
  if (shortcutTimer) clearTimeout(shortcutTimer)
  shortcutTimer = setTimeout(() => {
    // Execute shortcut action
  }, 40)
}
```

Scanner-Chars kommen alle <15ms → cancellieren ständig → Shortcut feuert nie. Human-Chars haben >80ms Abstand → Timer läuft durch.

### V5-Sync-Schutz Semantik

Ein Validation-Check der **nur feuert wenn Bedingung X zutrifft** (hier: price_locked Items existieren) gibt keine Sicherheit wenn X nie zutrifft. Das 24h-Stabilitätsfenster aus dem Konzept (§13) ist eine notwendige, aber **nicht hinreichende** Bedingung — der Check muss mindestens einmal real getestet werden. Lesson: Bei Schutz-Validierungen immer einen Scratch-Test mit einem Einzel-Element durchführen, bevor der Schutz auf alle Elemente angewendet wird.

### Deep-Link Pattern für Workflow-Switching

Wenn eine Detail-Page (hier: Media Detail) in eine Workflow-Page (hier: Stocktake Session) springen soll mit Preselection eines Items, nutze einen Query-Param (`?item_id=X`) plus einen `useEffect` der ihn parst und nach Load via `history.replaceState` wegräumt. So funktioniert ein Refresh des Workflows nicht endlos, und die Workflow-Page behält ihren normalen State.

---

## 9. Metriken

| Metrik | Wert |
|---|---|
| Releases heute | 3 (rc19, rc21, rc22) |
| Test-Drucke bis Hardware funktionierte | ~25 |
| Hardware-Bugs gefunden + gefixt | 4 (3× Drucker, 1× Scanner) |
| Commits auf main | 7 |
| Neue Dateien | 3 (`BROTHER_QL_820NWB_SETUP.md`, `POS_WALK_IN_KONZEPT.md`, `items/[id]/route.ts`) |
| Neue API-Endpoints | 1 (`GET /admin/erp/inventory/items/:id`) |
| Code-Änderungen | +975 / -95 Zeilen |
| Sync-Runs in der analysierten Historie | 143 (6 Tage) |
| Sync failed runs | 0 |
| Memory-Einträge aktualisiert | 1 neu (`project_pos_walk_in.md`) |

---

## 10. Referenzen

**Konzepte & Dokumentation:**
- [`docs/hardware/BROTHER_QL_820NWB_SETUP.md`](../hardware/BROTHER_QL_820NWB_SETUP.md) — Setup-Handbuch + Debugging-Kompass
- [`docs/optimizing/INVENTUR_COHORT_A_KONZEPT.md`](../optimizing/INVENTUR_COHORT_A_KONZEPT.md) §14.13 — Hardware-Test-Ergebnisse
- [`docs/optimizing/POS_WALK_IN_KONZEPT.md`](../optimizing/POS_WALK_IN_KONZEPT.md) — POS Walk-in Sale Design (Draft)
- [`docs/architecture/CHANGELOG.md`](../architecture/CHANGELOG.md) — rc19, rc21, rc22 Einträge

**Hardware-IDs (Frank's Setup):**
- Drucker: Brother QL-820NWBc, Serial `000M5G763259`, USB+WiFi
- Rolle: Brother DK-22210 (29mm × 30,48m Endlosband, weiß)
- Scanner: Inateck BCST-70 (USB HID, 1D Barcodes, MacOS/iOS-Modus + Deutsche Tastatur nach Setup-Barcodes)

**Test-Credentials:**
- Brother Web-Interface: `https://<printer-ip>/`, Passwort auf Drucker-Rückseite als „Pwd"
- BCST-70 Handbuch: `~/Downloads/BCST-70_Complete_Manual-V3_DE.pdf` §1.6 Tastaturbelegung (S. 27)
