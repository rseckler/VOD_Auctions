# Brother QL-820NWB + Inateck BCST-70 — Setup & Print Pipeline

**Status:** ✅ Validiert am 2026-04-11 (Robin + Frank, Hardware-Test mit DK-22210 Endlosrolle)
**Zweck:** Label-Druck + Scanner-Input für Inventur-Workflow (§14 `INVENTUR_COHORT_A_KONZEPT.md`)
**Hardware:**
- **Drucker:** Brother QL-820NWBc (Bundle-Variante der QL-820NWB)
- **Rolle:** Brother DK-22210 (29mm × 30,48m weißes Endlosband)
- **Scanner:** Inateck BCST-70 (USB HID, 1D Barcodes)

**Silent-Print-Architektur (seit rc34, 2026-04-22, multi-printer seit rc52, 2026-04-27):** QZ Tray ist komplett raus. Silent-Druck läuft über die **VOD Print Bridge** — Python stdlib LaunchAgent auf `127.0.0.1:17891` HTTPS (mkcert-Cert), Backend `brother_ql` (TCP-Direct-Send auf Drucker-Port 9100). Admin-UI pollt `/health`, druckt per `POST /print?location=<CODE>`. Kein Browser-Dialog, kein Java, kein Signing-Theater. Multi-Printer-Routing seit rc52: Bridge hält eine Map `warehouse_location.code → IP`, Frontend setzt den aktiven Standort via Toolbar-Switcher (📍, persistent in localStorage). Siehe [`frank-macbook-setup/print-bridge/README.md`](../../frank-macbook-setup/print-bridge/README.md) und §0 unten.

---

## 0. Rollout auf neuem Mac (Einzeiler)

**Zielgruppe:** MacBook Air M5 / Mac Studio / Dev-Macs. Gleicher Ablauf egal ob Apple Silicon oder Intel (Architektur wird automatisch erkannt).

### Voraussetzungen (vor dem Einzeiler)

1. Brother QL-820NWB im gleichen WLAN wie der Mac, DK-22210 Rolle eingelegt, Drucker-IP am LCD ablesbar (Menu → WLAN → Info)
2. Drucker-Admin-Passwort von der Rückseite (Format `Pwd: xxxxxxxx`) griffbereit — wird für den Raster-Mode-Fix im Web-Interface gebraucht
3. Inateck BCST-70 USB-Empfänger im Mac, BCST-70 Handbuch PDF griffbereit (Setup-Barcodes aus §1.6)
4. **Brother-Treiber installiert:** [https://support.brother.com](https://support.brother.com/g/b/downloadlist.aspx?c=eu_ot&lang=en&prod=lpql820nwbeas&os=10064) → QL-820NWB → Downloads → macOS → „Full Driver & Software Package" (.pkg, ~60 MB). Ohne Brother-PPD verwirft der Drucker Raster-Jobs lautlos — IPP-Everywhere/AirPrint können das Brother-Protokoll nicht. Der Einzeiler checkt das in Step 2 und bricht mit Link zum Download ab, falls er fehlt.
5. Homebrew installiert (`which brew` → Pfad). Falls nicht: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`

### Der Einzeiler

Im Terminal auf dem Ziel-Mac:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-macbook-setup/bootstrap.sh)"
```

**Was passiert:** Bootstrap-Script (`frank-macbook-setup/bootstrap.sh`) prüft Xcode CLT + Homebrew, cloned/pulled `~/VOD_Auctions`, startet `frank-macbook-setup/install.sh`. Das Setup ist idempotent — der Einzeiler kann beliebig oft neu gestartet werden (aktualisiert per `git fetch && git reset --hard origin/main`).

### Die 7 Schritte von install.sh

| # | Was | Interaktiv? |
|---|---|---|
| 1/7 | System-Check (macOS-Version, Architektur, Homebrew) | nein |
| 2/7 | Brother-Treiber verifizieren (PPD vorhanden + nicht via AirPrint eingerichtet) + CUPS-Queue-Namen normalisieren | nein |
| 3/7 | **Altes QZ Tray entfernen** (falls vorhanden, braucht einmalig sudo für `/Applications/QZ Tray.app`) + **VOD Print Bridge installieren** (venv mit `brother_ql` + `Pillow` + `pypdfium2`, mkcert HTTPS-Cert, LaunchAgent im User-Scope, kein sudo) | ggf. sudo + Drucker-IP falls Bonjour fehlschlägt |
| 4/7 | CUPS-Default `PageSize=Custom.29x90mm` setzen (siehe §4) | nein |
| 5/7 | **Drucker Raster-Mode** umstellen — öffnet `https://<printer-ip>/` im Browser (siehe §3) | **ja** — Drucker-IP + Admin-Pwd |
| 6/7 | Safari Web-App für `admin.vod-auctions.com` erstellen | **ja** — Enter |
| 7/7 | Test-Label drucken (29×90mm Diagnose-Label) | **ja** — Enter |

### Scanner-Setup (nach install.sh)

Der Einzeiler kümmert sich nicht um den BCST-70 — das ist Hardware-intern (Setup-Barcodes aus dem Handbuch scannen, nicht via Software). Siehe §6 weiter unten, Ablauf in [`frank-macbook-setup/scanner/SCANNER_SETUP.md`](../../frank-macbook-setup/scanner/SCANNER_SETUP.md).

### Rollback / Uninstall

```bash
# Nur die Print Bridge entfernen (LaunchAgent + Script + Cert), Brother-Treiber/CUPS bleibt
bash ~/VOD_Auctions/frank-macbook-setup/print-bridge/install-bridge.sh --uninstall
```

### Re-Run gezielt nur für die Bridge (ohne volles install.sh)

Nützlich wenn Drucker getauscht wurde, IP sich geändert hat, oder nach Homebrew-Update:

```bash
cd ~/VOD_Auctions/frank-macbook-setup
bash print-bridge/install-bridge.sh --printer Brother_QL_820NWB
# Mit expliziter IP (überspringt Bonjour-Autodetect):
bash print-bridge/install-bridge.sh --printer Brother_QL_820NWB --printer-ip 10.1.1.136
# Dev-Mac ohne Brother (Robins Setup):
bash print-bridge/install-bridge.sh --dry-run
```

### Multi-Printer-Setup (rc52, seit 2026-04-27)

Wenn ein Mac zwischen mehreren Standorten pendelt und an jedem Standort ein eigener Brother QL-820NWB steht, kann die Bridge im **Multi-Printer-Mode** mehrere IPs gleichzeitig kennen. Beim Druck wählt sie anhand des aktiven Standorts (im Frontend: 📍-Switcher in der Toolbar) den richtigen Drucker.

```bash
cd ~/VOD_Auctions/frank-macbook-setup
bash print-bridge/install-bridge.sh \
  --printer-for ALPENSTRASSE=10.1.1.136 \
  --printer-for EUGENSTRASSE=192.168.1.124 \
  --default-location ALPENSTRASSE
```

**Wichtig:**
- Der `CODE` in `--printer-for CODE=IP` muss **exakt** dem `warehouse_location.code` aus der DB entsprechen (uppercase, ohne Sonderzeichen). Tippfehler routen falsch.
- `--default-location` muss eine der `--printer-for`-Codes sein. Ist sie nicht gesetzt, fällt die Bridge bei einem `/print` ohne `?location=` auf `--printer-ip` (single-printer fallback) zurück oder gibt einen Error.
- **Statische IP per DHCP-Reservation Pflicht** — die IP des Druckers landet hardcoded in der LaunchAgent-plist. Bei DHCP-Lease-Renew kann der Router eine andere Adresse vergeben, dann bricht der Druck mit `OSError: [Errno 65] No route to host` ab (rc52-Lesson-Learned: Eugenstraße-Drucker rotierte 192.168.1.140 → 192.168.1.124 binnen Stunden). Lösung: im Router (z.B. Fritz!Box) eine **DHCP-Reservation** für die Drucker-MAC-Adresse anlegen, ODER am Drucker-LCD direkt eine statische IP konfigurieren (Menu → WLAN → IP-Einstellungen → Statisch).
- Frontend setzt den aktiven Standort in localStorage (`vod.print.location`). Frank wechselt via Toolbar-Dropdown — Effekt ab dem nächsten Druck-Klick, kein Reload nötig.
- Bei nur einer konfigurierten Location wird der Switcher automatisch ausgeblendet (nichts zu schalten).
- Standort-Routing folgt **nicht** dem `warehouse_location_id` des Items — sondern dem physischen Standort des Macs. Wenn Frank in der Eugenstraße ein Item etikettiert das in der DB noch ALPENSTRASSE-Lager ist, geht das Label trotzdem auf den Eugenstrasse-Drucker (er hält das Item in der Hand).

**Verifikation:**

```bash
curl -sk https://127.0.0.1:17891/health | python3 -m json.tool
# Erwartet:
#   "default_location": "ALPENSTRASSE",
#   "locations": [
#     {"code":"ALPENSTRASSE","ip":"10.1.1.136","is_default":true},
#     {"code":"EUGENSTRASSE","ip":"192.168.1.124","is_default":false}
#   ]

# Test-Druck explizit gegen Eugenstraße (umgeht localStorage):
curl -sk -X POST 'https://127.0.0.1:17891/print?location=EUGENSTRASSE' \
  -H 'Content-Type: application/pdf' \
  --data-binary @/pfad/zum/test.pdf | python3 -m json.tool
# Erwartet: "resolved_from": "location=EUGENSTRASSE", "outcome": "sent"
```

**Backwards-compat:** Single-Printer-Setups (`--printer-ip` allein) laufen unverändert weiter. Die Bridge erkennt anhand der env-Vars ob sie im Single- oder Multi-Mode startet — kein Code-Pfad-Bruch.

### Health-Check nach der Installation

```bash
curl -sk https://127.0.0.1:17891/health
# Erwartet: {"ok":true,"printer_found":true,"backend":"brother_ql",...}

# Logs live
tail -f ~/Library/Logs/vod-print-bridge.log
```

Im Admin-UI (Safari Web-App): oben rechts muss Badge **„Silent Print"** stehen (nicht „Browser Print"). Falls „Browser Print": Bridge ist down — `curl` oben prüfen, ggf. `bash install-bridge.sh` erneut.

### Rollout-Log (Stand 2026-04-27)

| Mac | Status | Mode | Drucker(s) |
|---|---|---|---|
| Franks MacBook Air M5 | ✅ Installiert | production (multi-printer seit 2026-04-27) | ALPENSTRASSE@10.1.1.136, EUGENSTRASSE@192.168.1.124 |
| Franks Mac Studio | ⏳ Rollout ausstehend | production | (Alpenstrasse) |
| Robins MacBook (Dev) | ✅ Installiert | DRY_RUN (kein Brother angeschlossen) | — |

### Drucker-Inventar (Stand 2026-04-27)

| Standort | warehouse_location.code | Drucker-IP | Modell | Inbetriebnahme | Notizen |
|---|---|---|---|---|---|
| Alpenstraße | `ALPENSTRASSE` | 10.1.1.136 | Brother QL-820NWB | 2026-04-11 | Hauptlager, Default-Standort |
| Eugenstraße | `EUGENSTRASSE` | 192.168.1.124 | Brother QL-820NWB | 2026-04-27 | 2. Standort Frank, eigenes WLAN (192.168.1.0/24) |

**Wichtig:** Die zwei Drucker sind in unterschiedlichen WLANs — kein gemeinsames Subnetz. Frank's MBA muss bei Standortwechsel ins jeweilige WLAN eingebucht sein, damit der Direct-TCP-Send (Port 9100) den Drucker erreicht. Die Bridge selbst läuft nur lokal (127.0.0.1:17891) und routet beim `/print`-Call anhand des aktiven Standorts (📍-Switcher in der Toolbar).

---

## 1. Quick Reference — Das funktionierende Setup

**Drucker-seitig (einmalig, via Brother Web-Interface):**
- Command Mode auf **`Raster`** umstellen (ab Werk: `P-touch Template` ← falsch!)

**CUPS-seitig (einmalig, im macOS-User-Scope):**
```bash
lpoptions -p Brother_QL_820NWB -o PageSize=Custom.29x90mm
```

**Scanner-seitig (einmalig, durch Scannen von Setup-Barcodes aus Handbuch §1.6):**
- „Beginn der Einrichtung" → „MacOS/iOS Modus" → „Speichern und Beenden"
- „Beginn der Einrichtung" → „Deutsche Tastatur" → „Speichern und Beenden"

**Drucken aus Code:**

In Production (Admin-UI): HTTPS POST an die lokale Print Bridge — kein Browser-Dialog, keine CUPS-Fallstricke.

```bash
# Production: via VOD Print Bridge (brother_ql-Backend, TCP-direct an Drucker:9100)
curl -sk -X POST https://127.0.0.1:17891/print \
  -H 'Content-Type: application/pdf' \
  --data-binary @/pfad/zum/label.pdf

# Hardware-Debugging: direkt via CUPS (geht auch, bypasst Bridge)
lp -d Brother_QL_820NWB /pfad/zum/label.pdf
# oder explizit:
lp -d Brother_QL_820NWB -o PageSize=Custom.29x90mm /pfad/zum/label.pdf
```

**Wenn eines dieser drei Einstellungen fehlt:**
- **Kein Raster-Mode** → Drucker ignoriert CUPS-Längen und druckt auf ~29mm Default
- **Kein `Custom.` Prefix oder falsche PageSize** → Content wird auf ~12mm Default oder das nächste Die-Cut-Preset geclippt
- **Scanner auf Windows/Android + US-Keyboard** → `VOD-000001` kommt als `VODß000001` an (`-` → `ß` durch DE-Keyboard-Layout-Mismatch)

---

## 2. Hardware-Setup auf macOS

### 2.1 Drucker anschließen
- QL-820NWB via USB oder WiFi mit Mac verbinden **und** an Strom
- Rolle korrekt einlegen (DK-22210 Endlosband 29mm):
  - Rollenkern in beide Seitenhalter klicken
  - Papierende **unter** den schwarzen Papier-Führungs-Hebel durchschieben (nicht oben drüber)
  - Seitliche Papier-Führung rechts an die Rolle andrücken
  - Cover fest schließen → Drucker macht einen kurzen Kalibrierungs-Vorschub
  - LCD muss den Rollen-Typ anzeigen (sonst ist Deckel nicht richtig zu oder Rolle falsch eingelegt)

### 2.2 Treiber installieren
- **Brother-Treiber ist Pflicht** — macOS hat keine eingebauten PPDs für QL-Modelle, IPP-Everywhere funktioniert nicht über USB
- Download: `https://support.brother.com/` → QL-820NWB → Downloads → macOS → „Full Driver & Software Package" (.pkg, ~60 MB)
- Nach Installation: Drucker aus/an, macOS erkennt ihn automatisch
- Installierte PPD: `/etc/cups/ppd/Brother_QL_820NWB.ppd` (was CUPS tatsächlich benutzt)
- Referenz-PPD: `/Library/Printers/PPDs/Contents/Resources/Brother QL-820NWB CUPS.gz`

### 2.3 WiFi-Setup (empfohlen)
- Der Brother-Installer richtet den Drucker als **Bonjour/IPP-Drucker** ein (`ipp://Brother%20QL-820NWB._ipp._tcp.local./`)
- Ohne WLAN → Druckjobs hängen mit „Verbindung wird hergestellt" ohne Fortschritt
- QL-820NWB WiFi am Drucker-Display einrichten: Menu-Taste → WLAN → SSID wählen → Passwort
- Verifikation: `nc -zv <printer-ip> 631` (IPP) und `nc -zv <printer-ip> 9100` (Raw) müssen beide „succeeded" zurückgeben

---

## 3. Drucker-Mode: Raster (NICHT P-touch Template!)

**Das war der #1 Haupt-Bug im Hardware-Test 2026-04-11**: Der QL-820NWB wird ab Werk im **`P-touch Template`**-Mode ausgeliefert. In diesem Mode interpretiert der Drucker eingehende Druckdaten als Template-Füllung und druckt auf eine **fest einkodierte Default-Template-Länge** (~29mm), egal was CUPS oder die PDF-Seitengröße sagen.

### Fix — einmalig via Web-Interface setzen

1. Browser öffnen: `https://<printer-ip>/`
2. Zertifikatswarnung akzeptieren
3. „Open Secure Login" → Passwort eingeben (steht auf Drucker-Rückseite als „Pwd: xxxxxxxx")
4. Menü: **Printer Settings → Device Settings**
5. **Command Mode** (oben): `P-touch Template` → **`Raster`**
6. Scroll nach unten → **Submit**
7. Empfohlen: Drucker einmal aus/an nach dem Submit

### Verifikation via curl

```bash
curl -sk -L -c /tmp/cj -b /tmp/cj \
  -d "B14b=<password>" -d "loginurl=/printer/device_settings.html" \
  "https://<printer-ip>/home/status.html" -o /tmp/ds.html
grep -oE 'value="2[012]"[^>]*selected[^>]*' /tmp/ds.html
# Erwartet: value="21" selected="selected"
# value="20" = ESC/P, value="21" = Raster, value="22" = P-touch Template
```

**Warum Raster?** Der Raster-Mode nimmt eingehende Print-Daten als direkte 1:1 Bitmap-Rasterung (genau das, was CUPS mit dem PPD-Filter erzeugt) und druckt die Pixel-Größe der Bitmap aus. Keine Template-Interpretation, keine Template-Default-Länge — die Bitmap-Dimensionen bestimmen die Label-Größe.

---

## 4. PageSize: `Custom.29x90mm` — nicht `29x90mm`

Die installierte PPD (`/etc/cups/ppd/Brother_QL_820NWB.ppd`) hat folgende Liste von vordefinierten PageSizes:

```
12x12mm 17x54mm 17x87mm 23x23mm 24x24mm 29x42mm 29x52mm
29x54mm 29x62mm 29x90mm 38x90mm 39x48mm 58x58mm 60x86mm 62x100mm
Custom.WIDTHxHEIGHT
```

**ALLE vordefinierten Namen (`29x62mm`, `29x90mm`, etc.) entsprechen Brother DK-11xxx Die-Cut-Rollen** — nicht der continuous DK-22210!

Z.B.:
- `29x62mm` → DK-11209 (Return Address Label, die-cut)
- `29x90mm` → DK-11201 (Standard Address Label, die-cut)

Wenn man `-o PageSize=29x90mm` setzt, **erwartet der Brother-Treiber eine die-cut DK-11201 Rolle mit fest vorgestanzten 90mm-Labels**. Der Sensor detektiert aber die DK-22210 (endlos) → Konflikt → der Drucker fällt auf einen Default-Cut zurück.

**Richtig ist `Custom.29x90mm`**: Das sagt dem Treiber explizit „die Rolle ist continuous, schneide nach 90mm ab". Der Cut-Length-Wert stammt direkt aus der Bitmap-Höhe.

### Entscheidungs-Regel

| Rolle | PageSize-Syntax | Wann |
|---|---|---|
| DK-22210 (29mm Endlosband) | `Custom.29x<LENGTH>mm` | Für Inventur-Labels, beliebige Längen wählbar |
| DK-11209 (29×62mm die-cut) | `29x62mm` | Wenn tatsächlich die-cut Rolle eingelegt |
| DK-11201 (29×90mm die-cut) | `29x90mm` | Wenn tatsächlich die-cut Rolle eingelegt |

Für unseren Use-Case (Barcode-Labels im Inventur-Workflow) ist DK-22210 + `Custom.29x90mm` die Wahl: viel mehr Platz pro Label als DK-11209 (62mm), günstiger pro Meter als die-cut (keine Stanzung, weniger Verschnitt), und erlaubt später flexible Längen ohne Rollen-Wechsel.

### Queue-Default auf 29×90mm setzen

Damit nicht jeder Druckbefehl `-o PageSize=Custom.29x90mm` explizit mitgeben muss:

```bash
lpoptions -p Brother_QL_820NWB -o PageSize=Custom.29x90mm
```

Schreibt in `~/.cups/lpoptions` (user-level, kein `sudo` nötig). Danach reicht ein simples `lp -d Brother_QL_820NWB label.pdf`.

---

## 5. PDF-Layout: 29×90mm Portrait mit -90° rotiertem Content

### Die falsche Intuition

Naiv würde man ein 90mm × 29mm **Landscape**-PDF erzeugen, weil das Label „breiter als hoch" ist. Das klappt aber nicht:

- `Custom.29x90mm` sagt CUPS: Page ist **29mm breit × 90mm hoch** (PDF-Konvention: erstes Element = Width = Tape-Breite)
- Ein 90×29mm landscape PDF wird dann vom Brother-Treiber entweder auf 29mm runterskaliert (Content schrumpft ~3× → unleserlich) oder auf 29mm geclippt (Rechter Rand verloren)

### Die richtige Geometrie

- PDF-Size: **`[29 * MM, 90 * MM]`** = `[82.215, 255.15]` pt (29mm × 90mm portrait)
- Inhalt wird **mit `doc.rotate(-90, {origin:[0,0]})` + `doc.translate(-LABEL_LENGTH, 0)`** gedreht, sodass man in einem „virtuellen 90mm × 29mm landscape Frame" zeichnen kann
- Im rotierten Frame: Barcode oben, darunter zweispaltiges Layout (Text links, großer Preis rechts)

### Layout v6 (hardware-validiert 2026-04-11)

```
┌────────────────────────────────────────────────┐  29mm
│    |||||||||||||||||||||||||  (70% centered)  │  Barcode 9mm hoch
│           VOD-000001                           │
│                                                │
│  Cabaret Voltaire                 │            │  Artist 12pt bold
│  Red Mecca · Mute Records         │   €45      │  Title · Label 10pt
│  LP · UK · VG+ · 1981             │            │  Meta 8pt
└────────────────────────────────────────────────┘
                     90mm
```

### Font-Größen (validiert v6)

| Element | Font-Size | Begründung |
|---|---|---|
| Barcode | bwip-js `height: 7`, Bild-Höhe 9mm, 70% breit | Genug Bar-Höhe für Scanner, zentriert |
| Artist (fett) | 12pt Helvetica-Bold | Gut lesbar auf Armlänge; max ~28 Zeichen |
| Title · Label | 10pt Helvetica | Max 18 Zeichen pro Feld |
| Format · Country · Condition · Year | 8pt Helvetica | Vier Werte, gut lesbar |
| **Preis** | **22pt Helvetica-Bold**, rechts-aligned | Dominant, der wichtigste Hinweis am Label |

### Hardware-Margins (wichtig!)

Die Brother PPD hat `HWMargins: 4.32 8.4 4.32 8.4` (in pt = 1.5mm/3mm/1.5mm/3mm Left/Bottom/Right/Top). In der Feed-Richtung (90mm) verliert der Drucker ~3mm an beiden Enden. Deswegen:

- **Linker Margin**: 2mm (MARGIN-Konstante)
- **Preis-Spalte mit extra 3mm Padding rechts** (`PRICE_RIGHT_PAD`), damit der rechtsbündige Preis nicht ins Hardware-Clipping läuft

---

## 6. Scanner-Setup: Inateck BCST-70 für macOS + Deutsche Tastatur

Der BCST-70 ist ab Werk im **Windows/Android-Modus mit US-Tastaturlayout**. Für macOS-Verwendung mit deutschem Tastaturlayout (wie auf Franks Mac) müssen zwei Einstellungen angepasst werden, sonst kommt der Bindestrich in `VOD-000001` als `ß` an (Keycode `0x2D` → US `-` vs. DE `ß`).

Die Setup-Barcodes stehen im BCST-70 Handbuch (`BCST-70_Complete_Manual-V3_DE.pdf`, §1.6 Tastaturbelegung, Seite 27).

### Session 1 — macOS/iOS-Modus

1. Scan **„Beginn der Einrichtung"**
2. Scan **„MacOS/iOS Modus"**
3. Scan **„Speichern und Beenden"**

### Session 2 — Deutsche Tastatur

1. Scan **„Beginn der Einrichtung"**
2. Scan **„Deutsche Tastatur"**
3. Scan **„Speichern und Beenden"**

### Verifikation

TextEdit öffnen, in ein leeres Dokument klicken, ein gedrucktes Label scannen. Erwartung: `VOD-000001` mit korrektem Bindestrich, gefolgt von Zeilenumbruch.

Falls immer noch `ß` statt `-` kommt: Setup-Session wiederholen, auf korrektes Scannen aller 3 Barcodes pro Session achten (der Scanner bestätigt jeden Scan mit Piep + LED).

---

## 7. Debugging-Kompass: „Label kommt falsch raus — woran liegt's?"

Aus dem Hardware-Test 2026-04-11, als Referenz für die Zukunft:

| Symptom | Wahrscheinliche Ursache | Fix |
|---|---|---|
| Job hängt „Seite 1 abgeschlossen" ewig, kein physischer Druck | Drucker nicht im WLAN / Bonjour-Name nicht auflösbar | WiFi einrichten, `ping <printer>.local` testen |
| Job hängt, Mac-Queue zeigt „Druckerabdeckung ist offen" | Deckel nicht richtig zugedrückt | Deckel fest schließen, beide Seiten einrasten |
| LCD zeigt „keine Rolle" | Papier nicht korrekt unter Führungs-Hebel | Rolle neu einlegen, Cover zu, Kalibrier-Vorschub abwarten |
| Label kommt als **~29×30mm quadratisch**, Barcode geclippt, Text fast weg | Drucker im **P-touch Template Mode** | Web-Interface → Device Settings → Command Mode = Raster (§3) |
| Label ist korrekte 29mm breit, aber **Length ignoriert alle CUPS-Options** | `PageSize=29x90mm` (ohne Custom-Prefix) → wird als DK-11201 die-cut interpretiert | `-o PageSize=Custom.29x90mm` verwenden (§4) |
| Content um 90° rotiert / nur halb sichtbar / auf ~30% skaliert | PDF hat falsche Portrait/Landscape-Orientation relativ zur Rolle | PDF als `[29mm, 90mm]` portrait mit -90° rotiertem Content (§5) |
| Label ist richtig groß, aber Text zu klein | Font-Größen aus erstem Entwurf (5.5pt/4.5pt) | Fonts auf v6-Werte: 12pt Artist / 10pt Title / 8pt Meta / 22pt Preis (§5) |
| Preis rechts wird geclippt | Text liegt zu nah an Hardware-Margin (~3mm an den Tape-Enden) | `PRICE_RIGHT_PAD = 3 * MM` als Extra-Padding für rechtsbündigen Preis |
| Scanner tippt `VODß000001` statt `VOD-000001` | Scanner im Windows/Android + US-Keyboard Mode, Mac ist DE-QWERTZ | Setup-Barcodes aus BCST-70 Handbuch §1.6 scannen (§6) |

### Diagnose-Tools

```bash
# Drucker-Status & -URI
lpstat -p Brother_QL_820NWB -l
lpoptions -p Brother_QL_820NWB

# Aktuelle PPD-Optionen (echter Source-of-Truth, nicht die ref-PPD in /Library)
lpoptions -p Brother_QL_820NWB -l

# PPD-File der Queue
cat /etc/cups/ppd/Brother_QL_820NWB.ppd

# Druck-Queue
lpstat -o
cancel -a Brother_QL_820NWB

# Diagnose-Lineal drucken (29×100mm mit mm-Markierungen, zeigt wo der Drucker abschneidet)
# → siehe /tmp/ruler-label.mjs vom Hardware-Test
```

---

## 8. Standalone Test ohne Medusa-Runtime

Für Hardware-Tests ohne Backend/DB:

```javascript
// /tmp/test-label.mjs
import PDFDocument from "pdfkit"
import bwipjs from "bwip-js"
import fs from "node:fs"

const MM = 2.835
const doc = new PDFDocument({ size: [29*MM, 90*MM], margin: 0 })
doc.pipe(fs.createWriteStream("/tmp/test-label.pdf"))

doc.save()
doc.rotate(-90, { origin: [0, 0] })
doc.translate(-90*MM, 0)
// Jetzt im 90×29 landscape Frame zeichnen...
doc.restore()
doc.end()
```

Muss vom `backend/`-Verzeichnis aus ausgeführt werden, damit `node_modules` aufgelöst wird:

```bash
cp /tmp/test-label.mjs backend/
cd backend && node test-label.mjs
rm backend/test-label.mjs  # cleanup, nicht ins git
lp -d Brother_QL_820NWB /tmp/test-label.pdf
# (PageSize wird vom user-level lpoptions-Default gesetzt)
```

---

## 9. Production-Code — Integration

Hardware-validierter Code in `backend/src/lib/barcode-label.ts`:

- **Geometrie:** 29mm × 90mm portrait mit `rotate(-90)` + `translate(-LABEL_LENGTH, 0)`
- **LabelData-Felder:** `barcode, artistName, title, labelName, format, country, condition, year, price`
- **Layout:** Barcode oben zentriert (70% Breite), darunter Text-Spalte links + großer Preis rechts
- **Font-Größen:** 12pt Artist / 10pt Title·Label / 8pt Meta / 22pt Preis-Bold
- **Preis-Handling:** Wird nur gerendert wenn `price > 0` — Items ohne Preis (Missing-Status nach Franks F2) drucken das Label ohne Preis-Spalte

**API-Routes, die Label-Felder aus der DB joinen:**
- `backend/src/api/admin/erp/inventory/items/[id]/label/route.ts` (Einzel-Label)
- `backend/src/api/admin/erp/inventory/batch-labels/route.ts` (Batch-PDF)

Beide machen `LEFT JOIN Artist ON r.artistId` + `LEFT JOIN Label ON r.labelId` und selektieren `r.country, r.legacy_condition, r.legacy_price`.

---

## 10. Referenzen

- **Konzept:** `docs/optimizing/INVENTUR_COHORT_A_KONZEPT.md` §14 (Barcode-Labeling in der Inventur)
- **Production-Code:** `backend/src/lib/barcode-label.ts`
- **API-Routes:** `backend/src/api/admin/erp/inventory/items/[id]/label/route.ts`, `backend/src/api/admin/erp/inventory/batch-labels/route.ts`
- **Hardware-Test:** Durchgeführt 2026-04-11 von Robin + Frank, ~25 Test-Drucke bis zur funktionierenden Config
- **Brother Device-ID im System:** `usb://Brother/QL-820NWB?serial=000M5G763259` (Frank's Gerät, April 2026)
- **BCST-70 Handbuch:** `~/Downloads/BCST-70_Complete_Manual-V3_DE.pdf`, §1.6 Tastaturbelegung (S. 27)
