# POS UX Best Practices — Deep Research

**Erstellt:** 2026-04-12
**Zweck:** UX-Referenz fuer die Implementierung von `/app/pos` (Phase P0 ff.)
**Quellen:** Shopify POS, Square POS, Lightspeed, Toast, Clover, SumUp, Baymard Institute, Nielsen Norman Group, UXmatters, diverse UX Case Studies (vollstaendige Quellenliste am Ende)

---

## 1. Was die Besten gut machen

### Shopify POS
- **Split-Screen auf Tablets:** Produkt-Bereich links, immer sichtbarer Cart rechts. Kein Umschalten, kein Scrollen um den Cart zu sehen.
- **Smart Grid:** Anpassbare Kacheln fuer die haeufigsten Aktionen (Rabatt, Kundensuche, Versand). Mitarbeiter personalisieren ihren Workflow.
- **Unified Customer Profiles:** Kaufhistorie am Register abrufbar, Loyalty-Rabatte kanaeluebergreifend.
- **Niedrige Einarbeitungszeit:** Neue Mitarbeiter sind in Minuten produktiv.

### Square POS
- **Extreme Einfachheit:** Weniger tun, das aber richtig. Minimale UI-Elemente.
- **High-Contrast-Mode** und einstellbare Schriftgroessen.
- **Hardware + Software als Einheit:** Card Reader und App fuehlen sich wie ein Produkt an.

### Lightspeed POS
- **Starke Inventarverwaltung:** Am besten fuer komplexe, mehrkategorische Bestaende — direkt relevant fuer einen Plattenladen.
- **Suche nach Artist, SKU, Label, Release Date** mit Cover-Bildern.

### Gemeinsame Erfolgsmuster
1. **Immer sichtbarer Cart** — nie hinter einem Toggle versteckt
2. **Weniger als 3 Taps** fuer jede gaengige Aktion
3. **Einarbeitung unter 30 Minuten** moeglich

---

## 2. Die haeufigsten UX-Fehler

### Cognitive Overload
- Kassierer managen gleichzeitig Kunden, Produkte und Interface. **Jeder extra Button ist kognitive Last**, multipliziert mit hunderten taeglichen Interaktionen.
- Tiefe Kategorie-Hierarchien sind Gift: Wenn der Kassierer in der Navigation verloren geht, kann er sich nicht auf den Kunden konzentrieren. **Flache Navigation + Suche schlaegt verschachtelte Menues.**

### Confirmation-Dialog-Hoelle
- Routine-Aktionen (Item hinzufuegen, Zahlungsart waehlen) bestaetigen zu lassen erzeugt Reibung. **Confirmations nur fuer destruktive Aktionen** (Storno, Refund).
- Pop-ups und Modals fuer nicht-kritische Informationen stressen unter Zeitdruck.

### Produktnamen-Mismatch
- Wenn die Platte "Cabaret Voltaire - Red Mecca" heisst, aber das POS "CV-RedMecca-1981" zeigt, verschwendet der Kassierer Zeit mit Abgleich. **Anzeige muss dem physischen Produkt entsprechen.**

### Input-Feld-Fokus-Falle
- Systeme, die erfordern, dass der Cursor in einem bestimmten Feld ist bevor gescannt werden kann, kosten Zeit. **Scanner-Input muss global funktionieren**, egal wo der Fokus liegt.

### Echte Kassierer-Frustationen (aus Studien)
- Gefrorene Screens und Abstuerze zur Rush Hour
- 1-2 Sekunden Wartezeit fuer DB-Queries (im POS-Kontext inakzeptabel)
- Fehlerkorrektur die 10x laenger dauert als die urspruengliche Transaktion
- Produktbilder zu klein um sie zu erkennen
- Abgekuerzte Labels die nicht unterscheidbar sind

---

## 3. Speed-Optimierung

### Benchmarks
| Metrik | Wert |
|---|---|
| Industrie-Standard pro Transaktion | ~40-45 Sekunden |
| Pro gescanntem Item | ~3 Sekunden |
| Beste Payment-Verarbeitung | 4.4 Sekunden |
| Tap-to-Pay vs. Chip/PIN | bis zu 50% schneller |
| **Unser Ziel (5-Item Walk-in Sale)** | **unter 60 Sekunden** |

### Speed-Taktiken

**DO:**
- **Barcode-Scan als primaerer Input** — 3 Sek/Item vs. 10+ Sek fuer manuelle Suche
- **Auto-Add bei Scan** — Item geht direkt in den Cart mit Audio-Feedback, kein Extra-Tap
- **One-Tap Payment** — "Bezahlen"-Button immer sichtbar, ein Tap zur Zahlungsauswahl
- **Default-Zahlungsart** — haeufigste Methode vorausgewaehlt (bei Frank: SumUp Karte)
- **Keyboard-Shortcuts** fuer Power-User: Enter = Sale abschliessen, Esc = Abbrechen, Del = letztes Item entfernen
- **Smart Defaults** — Menge = 1, Rabatt = 0, Steuer = automatisch
- **Batch-Scanning** — schnelle Scans akkumulieren ohne Zwischenbestaetigung

**DON'T:**
- Loading-Spinner fuer Operationen unter 100ms
- Login zwischen jeder Transaktion (Idle-Timeout stattdessen)
- Kassenbon-Auswahl vor dem Zahlungsabschluss erzwingen
- Kundenauswahl vor dem Scannen erzwingen

### Die 3-Tap-Regel
Jede gaengige Funktion muss in maximal 3 Taps erreichbar sein. Core-Flow: **Scan (0 Taps) -> "Bezahlen" (1 Tap) -> Zahlungsart (1 Tap) -> Fertig.**

---

## 4. Layout-Patterns

### Split-Screen ist Industriestandard fuer Tablets

```
+----------------------------------+----------------------+
|                                  |                      |
|   PRODUKT-BEREICH (60-65%)       |   CART (35-40%)      |
|                                  |                      |
|   - Scan-Input oben              |   - Item-Liste       |
|   - Item-Preview / Suchergebnis  |   - Subtotal         |
|   - Oder: Smart Grid Kacheln     |   - Rabatt           |
|                                  |   - TOTAL (gross!)   |
|                                  |                      |
|                                  |   [==== BEZAHLEN ===]|
+----------------------------------+----------------------+
```

### Warum Cart rechts

- **Leserichtung** (links nach rechts): Produkte fliessen natuerlich in den Cart
- Total und "Bezahlen"-Button am unteren rechten Rand — das Letzte was das Auge sieht bevor die Aktion kommt
- Passt zum physischen Flow: Produkte kommen von links (Theke), Kasse ist rechts

### Konkrete Empfehlungen

| Element | Empfehlung |
|---|---|
| Cart-Breite | 35-40% der Screenbreite (iPad Landscape) |
| Produkt-Bereich | 60-65% |
| Touch-Targets (minimum) | 48x48px, primaere Aktionen 56-64px |
| "Bezahlen"-Button | Volle Cart-Breite, min. 56px hoch, Kontrastfarbe |
| Laufende Summe | 24px+ Font, instant Update bei Add/Remove |
| Produkt-Bilder | Minimum 44x44 Points, besser 60-80px |
| Button-Abstand | Minimum 8px zwischen Buttons |

### DON'T
- Vollbild-Modals fuer Item-Hinzufuegen (bricht den Kontext)
- Cart oben auf dem Screen (drueckt Produkte unter den Fold)
- Horizontales Scrollen im Cart
- Hamburger-Menu fuer primaere Navigation im POS

---

## 5. Barcode-Scanning UX

### Hardware-Scanner-Input (Inateck BCST-70)
- Scanner agiert als Keyboard-Input: tippt den Barcode-String gefolgt von Enter
- POS braucht einen **globalen Barcode-Listener**, der Input unabhaengig vom Fokus-State erfasst
- Scanner-Input ist unterscheidbar von Keyboard durch Geschwindigkeit: 50+ Zeichen in <100ms = Barcode-Scan

### Feedback bei Scan

| Event | Feedback |
|---|---|
| Erfolgreicher Scan | Kurzer, angenehmer Ton + gruenes Highlight auf neuem Cart-Item (300ms Fade) |
| Barcode nicht gefunden | Anderer Ton (tiefere Frequenz) + gelber Inline-Banner "Item nicht gefunden" + Option fuer manuelle Suche |
| Item bereits verkauft | Roter Inline-Banner "Bereits verkauft am {Datum}" |
| Item in Auction | Roter Inline-Banner "In aktivem Auction-Block '{Name}'" |
| Doppel-Scan gleicher Barcode | "Bump"-Animation auf der Mengen-Zahl zur Bestaetigung |

### DO
- **Continuous Scan Mode:** Kein Delay zwischen Scans, jeder Scan fuegt sofort hinzu
- **Scan-History im Cart sichtbar:** Items in Scan-Reihenfolge fuer einfache Verifizierung
- **Inline-Notifications** bei Fehlern, keine Modals

### DON'T
- Cursor muss in bestimmtem Feld sein bevor Scan funktioniert
- Modal-Dialog bei Scan-Error
- Gleicher Sound fuer Erfolg und Fehler
- Delay oder Animation zwischen Scans die den naechsten Scan blockiert
- Bestaetigung nach jedem Scan ("Dieses Item hinzufuegen? Ja/Nein")

---

## 6. Customer-Lookup UX

### Konsens der Top-Systeme: Kundensuche darf nie die Transaktion blockieren

**DO:**
- Transaktion ohne Kunde starten lassen (Anonymous = Default)
- "Kunde hinzufuegen"-Button im Cart-Bereich, nicht blockierend
- Suche nach: Name, Email, Telefon
- Kundenname im Cart-Header wenn zugewiesen, mit One-Tap-Remove
- **Inline-Suchpanel** (kein Modal): gleitet von der Seite ein oder expandiert im Cart-Bereich
- Haeufige Kunden als Quick-Select zeigen
- Kaufhistorie inline anzeigen (relevant: "Letzter Kauf: Throbbing Gristle - 20 Jazz Funk Greats")

**DON'T:**
- Kundenauswahl vor dem Scannen erzwingen
- Vollbild-Modal fuer Kundensuche (verliert Cart-Kontext)
- Neuen Kunden-Record als Pflicht fuer den Verkauf
- Extensive Kundendetails die den Checkout-Screen ueberladen

---

## 7. Payment-Flow UX

### Ideal: 2-3 Aktionen von "bereit" bis "fertig"

**Gold-Standard-Flow:**
1. Items im Cart, Total sichtbar -> Tap "Bezahlen"
2. Payment-Screen zeigt Total + Zahlungsoptionen (Karte vorausgewaehlt)
3. Kunde tappt/steckt Karte -> Transaktion abgeschlossen -> Bon automatisch

**= 2 Taps vom Kassierer + 1 Aktion vom Kunden**

### Payment-Screen Design

**DO:**
- **Total prominent** (groesste Zahl auf dem Screen, 32px+ Font)
- Haeufigste Zahlungsart vorausgewaehlt
- Zahlungsoptionen als **grosse Icon+Label-Buttons**
- Fuer Bar: **Quick-Amount-Grid** (5, 10, 20, 50 EUR) + Passend + Benutzerdefiniert
- Wechselgeld automatisch berechnen und prominent anzeigen
- **Kurze Erfolgs-Animation** (Haekchen, gruener Flash, 1-2 Sek max) dann Auto-Advance zum naechsten Verkauf
- Bon-Format (Digital/Print) als nicht-blockierende Option

**DON'T:**
- "Zahlung bestaetigen?" vor der Kartenverarbeitung (der Karten-Tap IST die Bestaetigung)
- Erfolgs-Screen der manuell geschlossen werden muss
- Bon-Format-Auswahl vor dem Zahlungsabschluss erzwingen
- Transaktion manuell schliessen nach erfolgreicher Zahlung
- Dekorative Animationen waehrend der Verarbeitung

### Bar-Zahlung
- Quick-Amount-Buttons basierend auf gaengigen Scheinen (5, 10, 20, 50 EUR)
- Wechselgeld automatisch berechnen mit grosser, klarer Anzeige
- "Passend"-Button wenn Kunde exakt zahlt

---

## 8. iPad/Tablet-spezifisches Design

### Touch-Targets
- Apple HIG Minimum: 44x44 Points
- **POS-Empfehlung: 48-64px** fuer primaere Aktionen (Armlange-Nutzung!)
- Groessere Targets verbessern Interaktionsraten um bis zu 40%

### Orientation
- **Landscape ist Standard** fuer POS (mehr horizontaler Platz fuer Split-Screen)
- Bei festem Counter-Mount: Landscape locken
- Bei Handheld (Frank im Laden unterwegs): beide Orientierungen unterstuetzen

### On-Screen-Keyboard vermeiden
- **Text-Input minimieren** — Barcode-Scan und Tap-to-Select reduzieren Keyboard-Bedarf
- Wenn Keyboard noetig (Suche, Custom Item): Input-Feld darf nicht verdeckt werden
- **Custom Numeric Keypad** in der App fuer Preis-Eingabe (schneller als System-Keyboard)

### Gesten
- **Swipe to Delete** fuer Cart-Items (mit Undo-Option)
- **Long-Press** fuer Item-Optionen (Menge, Rabatt, Notiz)
- **Pull-to-Refresh** fuer Inventar-Sync
- Pinch ist im POS nicht nuetzlich — vermeiden

---

## 9. Fehlerbehandlung und -korrektur

### Letztes Item entfernen
- Swipe-to-Remove auf dem letzten Item, oder dedizierter "Letztes entfernen"-Button
- Undo als **Toast-Notification** ("Item entfernt" + Undo-Link) fuer 5 Sekunden
- **Kein Bestaetigungs-Dialog** fuer einzelnes Item aus unbezahltem Cart

### Gesamte Transaktion stornieren
- Erfordert **explizite Aktion** (nicht versehentlich ausloesbar)
- Bestaetigung: "Alle X Items loeschen?" mit deutlichem destruktiven Button (rot)
- Storno loggen mit Zeitstempel und Operator-ID fuer Audit-Trail

### Preis-Override
- Tap auf Preis im Cart -> editierbares Feld erscheint
- Alle Overrides loggen mit Original-Preis, neuem Preis, Operator, Grund
- Visueller Indikator auf ueberschriebenen Items (andere Farbe, durchgestrichener Original-Preis)

### DO
- Undo als einfachste Fehlerkorrektur (ein Tap, reversibel)
- Audit-Trail fuer alle Korrekturen
- Suspend/Resume fuer Transaktionen (Kunde hat Geld vergessen)

### DON'T
- Manager-Freigabe fuer triviale Aenderungen (falsches Item aus unbezahltem Cart entfernen)
- Destruktive Aktionen ohne mindestens einen Bestaetigungs-Schritt
- Storno/Abbrechen-Option in Sub-Menues verstecken

---

## 10. Visuelles Feedback

### Farbkodierung
| Farbe | Bedeutung |
|---|---|
| Gruen | Erfolg, abgeschlossen, verfuegbar, Zahlung bestaetigt |
| Rot | Fehler, Storno, nicht verfuegbar, destruktive Aktionen |
| Gelb/Amber | Warnung, geringer Bestand, ausstehend, Aufmerksamkeit noetig |
| Blau/Markenfarbe | Informativ, neutrale Aktionen, Navigation |
| Grau | Deaktiviert, inaktiv, sekundaere Information |

### Animationen (sparsam einsetzen)
| Event | Animation |
|---|---|
| Item zum Cart hinzugefuegt | Kurzer gruener Highlight/Flash auf neuer Zeile (300ms) |
| Zahlung wird verarbeitet | Subtiler Spinner (nur wenn tatsaechlich gewartet wird) |
| Zahlung erfolgreich | Haekchen-Animation (1-2 Sek max), dann Auto-Clear |
| Zahlungsfehler | Shake-Animation auf dem Total, roter Flash |
| Mengen-Aenderung | Zahl "bumpt" (kurz vergroessern, dann zurueck) |

### Sounds
- **Scan-Erfolg:** Kurzer, angenehmer Beep (verschieden von Error)
- **Scan-Fehler:** Anderer Ton (tiefere Frequenz oder Doppel-Beep)
- **Zahlung erfolgreich:** Optionaler kurzer Chime
- Sounds sind fuer den Kassierer, nicht den Kunden — **subtil halten**
- **Mute-Option** anbieten

### DON'T
- Animationen laenger als 2 Sekunden
- Interaktion waehrend Animationen blockieren
- Sound als einzigen Feedback-Kanal nutzen (immer mit visuellem Feedback paaren)

---

## 11. Accessibility

### Schriftgroessen
| Element | Minimum |
|---|---|
| Body-Text | 16px (sichtbar aus 80cm Entfernung) |
| Preise/Totals | 24-32px |
| Button-Labels | 16-18px |

### Kontrast
- WCAG AA: 4.5:1 fuer normalen Text, 3:1 fuer grossen Text
- In hellen UND dunklen Laden-Beleuchtungen testen
- Helles und dunkles Theme mit 1-Tap-Toggle
- Kein hellgrauer Text auf weissem Hintergrund

### Einhand-Bedienung
- Primaere Aktionen mit einer Hand erreichbar (Daumen-Zone auf iPad)
- "Bezahlen"-Button und Scan-Trigger auf der gleichen Seite
- Keine Zwei-Hand-Gesten fuer kritische Operationen
- Bedenken: Eine Hand haelt das Produkt, die andere bedient das POS

---

## 12. Plattenladen-spezifische Empfehlungen

Diese Punkte sind spezifisch fuer VOD Records und den Walk-in-Sale-Usecase:

1. **Suche nach Artist, Label, Katalognummer, Format** — nicht nur Produktname. Die Discogs-Metadaten die wir schon haben sind Gold fuer POS-Suche.
2. **Condition Grading sichtbar im Cart** (VG+, NM, etc.) — gleiche Platte in verschiedenen Zustaenden hat verschiedene Preise.
3. **Cover-Bild im Cart** — Vinyl-Kaeufer wollen visuelle Bestaetigung dass sie die richtige Pressung haben.
4. **Barcode = primaerer Workflow** — die meisten Items haben einen VOD-Barcode aus der Inventur.
5. **"Kein Barcode"-Quick-Add-Flow** — fuer seltene Platten ohne Barcode: manuelle Suche nach Artist + Titel mit Autocomplete.
6. **Discogs-Preis-Referenz inline** (wenn verfuegbar) — hilft bei Preis-Verhandlungen fuer gebrauchte Platten.
7. **Inventar-Status sofort aktualisieren** — `sold` markieren damit Online-Overselling verhindert wird.

---

## 13. Konkrete Implikationen fuer unsere P0-Implementierung

Basierend auf dieser Recherche, diese Entscheidungen fuer `/app/pos`:

### Layout
- **Split-Screen:** Produkt-Bereich links (60%), Cart rechts (40%) — Shopify/Lightspeed-Pattern
- **Cart immer sichtbar**, nie hinter Toggle
- **"Bezahlen"-Button:** volle Cart-Breite, Gold-Akzent (#d4a54a), min. 56px hoch, immer am unteren Rand des Carts
- **Responsive Break:** unter 1024px einspaltiges Layout, Cart dann unter Scan-Bereich

### Scanner-Input
- **Globaler Keyboard-Listener** — erkennt schnelle Zeicheneingabe (>4 Zeichen in <100ms) als Barcode-Scan, egal wo der Fokus liegt
- **Auto-Add bei Scan** — kein "Hinzufuegen"-Button, Item geht direkt in Cart
- **Audio-Feedback:** Subtiler Erfolgs-Ton bei Add, anderer Ton bei Fehler
- **Visuelles Feedback:** Gruener Flash auf neuem Cart-Item (300ms)

### Customer-Panel
- **Default: Anonym** — Customer-Suche ist optional und blockiert nie den Flow
- **Inline**, kein Modal — expandiert im Cart-Bereich
- **Kein Pflicht-Schritt** vor dem Scannen

### Payment-Flow
- **SumUp Karte vorausgewaehlt** (Franks haeufigste Methode)
- **Maximal 2 Taps:** "Bezahlen" -> Zahlungsart bestaetigen/aendern -> fertig
- **Bei Bar:** Quick-Amount-Grid (5, 10, 20, 50 EUR) + Wechselgeld-Anzeige
- **Erfolg:** Kurze Haekchen-Animation (1 Sek), dann Auto-Advance zu neuem Verkauf mit Focus auf Scan-Input
- **Kein Bestaetigungs-Dialog** nach erfolgreicher Zahlung

### Fehlerbehandlung
- **Swipe-to-Remove** fuer Cart-Items + Undo-Toast (5 Sek)
- **"Alles loeschen"** erfordert Bestaetigung (roter Button)
- **Inline-Warnungen** bei Scan-Fehlern, keine Modals

### Touch/iPad
- **Minimum Touch-Target: 48px**, primaere Aktionen 56-64px
- **Landscape als Standard**, Portrait unterstuetzt
- **On-Screen-Keyboard vermeiden** wo moeglich — Custom Numeric Keypad fuer Preis/Rabatt

---

## Quellen

- Creative Navy / UX Journal: "The 16 UX Factors of POS Systems" (Medium)
- Creative Navy / UX Journal: "POS Design Principles Part 2" (Medium)
- Usability Geek: "User Experience Barriers in POS Systems"
- UXmatters: "Designing Point-of-Sale Systems" (2018)
- Agente Studio: "POS System Design: Principles and Examples"
- Shopify Blog: "POS System Design Principles" + "What Is POS UI?"
- Shopify Changelog: "Split-screen Home Layout for Tablet"
- Dev.Pro: "10 UX Tactics for POS Usability"
- Bright Inventions: "Payment in POS Design: UI/UX Best Practices"
- Final POS: "7 Key Principles of Effective POS System Design"
- Rossul: "Retail POS System UX Case Study"
- Square UX Case Studies (Lizzie Dunn, Christian Pugsley)
- POS Solutions AU: "POS Transaction Speed Benchmarks"
- Scandit: "Scanning at Scale: UX Insights"
- Microsoft Dynamics 365: "Suspend and Resume Transactions"
- web.dev: "PWA Offline Data"
