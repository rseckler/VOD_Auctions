# Inateck BCST-70 — Scanner Setup

**Hardware:** Inateck BCST-70 (USB 2.4GHz Wireless HID Barcode-Scanner)
**Ziel:** Scanner sendet sauber `VOD-000042` inkl. Bindestrich + Zeilenumbruch auf macOS mit deutscher Tastatur.

---

## Warum Setup nötig?

Ab Werk ist der BCST-70 im **Windows/Android-Modus mit US-Tastatur**. Wenn du einen Code wie `VOD-000042` auf Franks MacBook (DE-QWERTZ) scannst, kommt dort:

```
VODß000042
```

Der Bindestrich `-` liegt auf US-Keyboard auf der gleichen Position wie das `ß` auf DE-QWERTZ → Keycode-Mismatch. Fix: zwei Einstellungen am Scanner umstellen.

---

## Vorbereitung

1. **USB-Empfänger** (kleiner schwarzer Dongle, hängt in der Unterseite des Scanners) aus dem Scanner ziehen und in einen USB-A-Port am MacBook stecken. Das MacBook Air M5 (wie auch das alte MacBook Pro A2141) hat nur USB-C/Thunderbolt — einen **USB-C auf USB-A Adapter** verwenden.
2. **Scanner einschalten** (Power-Taste rechts, kurz drücken). Grüne LED blinkt.
3. Test: Irgendeinen Barcode scannen (auf einer Pfandflasche z.B.). Der Scanner piept, grüne LED blinkt. Ohne ein offenes Text-Feld siehst du den Output nicht — das ist ok, nur Hardware-Check.

---

## Setup-Barcodes scannen

Die Setup-Barcodes stehen im **Inateck-Handbuch** (`BCST-70_Complete_Manual-V3_DE.pdf`, §1.6 Tastaturbelegung, Seite 27). Es liegt bei Robin im Downloads-Ordner oder als Backup unter:

```
frank-macbook-setup/assets/BCST-70_Setup_Barcodes.pdf
```

(Falls nicht vorhanden: direkt aus dem Originalhandbuch die relevanten Codes fotografieren und groß ausdrucken, oder am Bildschirm anzeigen — der Scanner liest problemlos von Retina-Displays).

### Session 1 — macOS/iOS-Modus aktivieren

In dieser Reihenfolge scannen:

1. **„Beginn der Einrichtung"** (ein Piep, LED wechselt auf blau)
2. **„MacOS/iOS Modus"**
3. **„Speichern und Beenden"** (zwei Pieps, LED zurück auf grün)

### Session 2 — Deutsche Tastatur

Nochmal in dieser Reihenfolge:

1. **„Beginn der Einrichtung"**
2. **„Deutsche Tastatur"**
3. **„Speichern und Beenden"**

---

## Verifikation

1. **TextEdit** öffnen (Spotlight: Cmd+Space → "TextEdit") → neues leeres Dokument
2. Ein gedrucktes VOD-Label nehmen (z.B. das Test-Label vom `test-print.sh`)
3. Scanner darauf halten, Trigger drücken
4. Erwartetes Ergebnis:
   ```
   VOD-TESTLABEL
   ```
   mit korrektem Bindestrich und einem Zeilenumbruch am Ende (Cursor springt in neue Zeile).

**Falls immer noch `ß` statt `-`:** Setup-Session wiederholen, auf jeden Piep achten. Der Scanner bestätigt jeden erfolgreich gelesenen Setup-Barcode mit einem Piep + LED-Blink.

**Falls gar nichts kommt:**
- Batterie? → USB-C Kabel anstecken, zeigt Ladeanzeige
- Empfänger korrekt im MacBook? → System Information → USB → sollte "HID" oder "Inateck" zeigen
- Scanner ausgeschaltet? → Power-Taste 1s drücken

---

## Zusätzliche empfohlene Einstellungen (optional)

Für Franks Workflow empfohlen — alle aus dem Handbuch:

| Setting | Barcode | Effekt |
|---|---|---|
| **Auto-Off 30 min** | "Energiesparmodus 30 Minuten" | Scanner schaltet sich bei Nichtbenutzung aus (Batterie) |
| **Piep mittel** | "Piepton mittel" | Nicht zu laut im Büro |
| **Suffix = CR** | (Default) | Enter/Return nach jedem Scan → Formular-Auto-Submit |

---

## Admin-UI bedienen mit Scanner

Im Session-Screen (`/app/erp/inventory/session`):
- Suchfeld ist immer fokussiert (auto-focus nach jedem Verify)
- Scanner tippt `VOD-000042` + Enter → `onScan.js` erkennt das Pattern → direkter Lookup auf das Exemplar → Bewertungsformular öffnet sich ohne Maus
- Bei nicht-VOD-Barcodes (z.B. Discogs-Barcode auf Platten-Cover): Barcode landet im Such-Feld als Text → ILIKE-Suche auf `catalogNumber` + Barcode-Felder

---

## Troubleshooting-Tabelle

| Symptom | Ursache | Fix |
|---|---|---|
| `ß` statt `-` | US-Keyboard-Mode aktiv | Session 2 neu |
| Gar nichts wird eingegeben | Empfänger nicht erkannt | Empfänger rausziehen + wieder rein; anderes USB-Port |
| Piept 2×, LED rot | Low Battery | USB-C aufladen (Port am Scanner) |
| Scanner schaltet sich aus | Auto-Off aktiv (Default 2 min) | Entweder Power-Taste wieder, oder 30-min-Setting |
| Scan endet nicht mit Enter | Suffix falsch konfiguriert | Handbuch §3: "CR" Suffix-Barcode scannen |
