# Troubleshooting — Frank's MacBook Setup

Symptom → Ursache → Fix. Aus dem Hardware-Marathon vom 2026-04-11 extrahiert.

---

## Drucker

### Label kommt als ~29×30mm quadratisch, Text abgeschnitten
**Ursache:** Drucker im P-touch Template Mode (Werks-Default).
**Fix:** [`docs/PRINTER_WEB_CONFIG.md`](PRINTER_WEB_CONFIG.md) — Command Mode auf `Raster` umstellen.

### Label ist 29mm breit, aber Länge ist falsch (alle Labels zu kurz, oder zu lang)
**Ursache:** PageSize nicht auf `Custom.29x90mm` gesetzt, oder als `29x90mm` (ohne Custom-Prefix) → wird als DK-11201 die-cut interpretiert.
**Fix:**
```bash
lpoptions -p Brother_QL_820NWB -o PageSize=Custom.29x90mm
```
Danach mit `lpoptions -p Brother_QL_820NWB` prüfen dass `PageSize=Custom.29x90mm` drin ist.

### Druckjob hängt „Verbindung wird hergestellt" oder „Seite 1 abgeschlossen"
**Ursachen:**
1. Drucker nicht im WLAN
2. Bonjour-Name nicht auflösbar
3. Drucker aus

**Fix:**
```bash
# IP-Adresse prüfen
dns-sd -B _ipp._tcp local. | grep -i brother
# Ping
ping -c 3 <printer-ip>
# Wenn ping OK, Queue resetten:
cancel -a Brother_QL_820NWB
cupsdisable Brother_QL_820NWB && cupsenable Brother_QL_820NWB
```

### Drucker-LCD: „Keine Rolle eingelegt"
**Fix:** Cover auf, Rolle rausnehmen und neu einlegen. Papierende unter den schwarzen Führungs-Hebel durchschieben (nicht oben drüber). Cover **fest** zudrücken, bis es beidseitig einrastet. Drucker macht einen kurzen Kalibrierungs-Vorschub.

### Druckjob "bleibt in Queue hängen", kein Feedback
```bash
lpstat -o   # Zeigt offene Jobs
cancel -a Brother_QL_820NWB  # Alle Jobs löschen
# Dann Drucker aus/an, neu versuchen
```

### Queue-Name stimmt nicht (z.B. `Brother QL-820NWB` mit Leerzeichen)
Brother installiert manchmal mit Leerzeichen oder anderem Namen. Queue-Name neu erfassen:
```bash
lpstat -p
# Alle weiteren Befehle mit dem echten Namen:
lpoptions -p "Brother QL-820NWB" -o PageSize=Custom.29x90mm
```

---

## Scanner

### Scanner tippt `VODß000001` statt `VOD-000001`
**Ursache:** Scanner im Windows/US-Keyboard-Mode, Mac ist DE-QWERTZ.
**Fix:** [`../scanner/SCANNER_SETUP.md`](../scanner/SCANNER_SETUP.md) — beide Setup-Sessions erneut durchlaufen.

### Scanner tippt gar nichts
1. **Batterie leer?** → USB-C am Scanner anstecken, Ladeanzeige?
2. **Empfänger im MacBook?** → System-Informationen → USB → HID-Gerät sichtbar?
3. **Falscher USB-Port?** → USB-C-Adapter tauschen
4. **Scanner ausgeschaltet?** → Power-Taste 1-2s drücken

### Scanner piept 2× und LED blinkt rot
Low Battery. USB-C zum Aufladen anstecken.

### Scanner schaltet sich immer wieder aus
Auto-Off ist aktiv (Default 2 min). Im Handbuch §4 Barcode „Energiesparmodus 30 Minuten" oder „Standby deaktiviert" scannen.

---

## QZ Tray

### Auto-Print öffnet immer Browser-Dialog
**Ursache:** QZ Tray läuft nicht, oder Port 8181 blockiert.
**Fix:**
```bash
# Starten
open -a "QZ Tray"
# Check
nc -zv 127.0.0.1 8181
# Wenn "refused": App neu installieren
brew uninstall --cask qz-tray
brew install --cask qz-tray
```

### QZ Tray fragt nach Zertifikat-Genehmigung pro Site
Beim ersten Verify im Admin-UI erscheint ein QZ-Tray-Popup. Klicke **„Allow"** und Häkchen **„Remember this decision"**. Beim zweiten Run ist der Dialog weg.

### QZ Tray startet nicht automatisch nach Reboot
```bash
osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/QZ Tray.app", hidden:true}'
```
Alternativ: Systemeinstellungen → Benutzer & Gruppen → Anmeldeobjekte → QZ Tray hinzufügen.

---

## Browser / Admin

### Admin-Seite lädt nicht / 502 Bad Gateway
VPS down oder Deployment läuft. Normalerweise 1-2 Min Wartezeit. Falls länger: Robin anrufen.

### Login-Passwort vergessen
Auf dem gelben Post-It am MacBook. Oder Robin fragt in 1Password nach.

### Safari zeigt "Sicherheitsfehler" beim Admin-Login
```
Cookie-Einstellungen prüfen: Safari → Einstellungen → Datenschutz →
"Cross-Site-Tracking verhindern" TESTWEISE deaktivieren für admin.vod-auctions.com
```

### Web-App im Dock bleibt leeres weißes Fenster
Dock-Icon → Rechtsklick → „Im Dock behalten" entfernen, dann via `Datei → Zum Dock hinzufügen…` neu erstellen. Muss in Safari 17+ gemacht werden (macOS Sonoma oder neuer).

---

## iPhone-Upload (Inventur-Session)

### Kamera-Button lädt Bild nicht hoch
1. iPhone im gleichen WLAN wie MacBook?
2. Im Session-Screen auf **iPhone-Safari** eingeloggt (nicht auf der Mac-Version)?
3. Server-Side: R2-Credentials in backend/.env gesetzt (Robin prüft)

### Foto wird hochgeladen aber nicht angezeigt
Refresh der Session-Seite (Cmd+R). R2 braucht 1-2 Sekunden für CDN-Propagation.

---

## POS-Kasse

### Barcode-Scan zeigt „Item not found"
- Artikel hat noch keinen Inventar-Eintrag (Cohort C / nicht gelabelt)
- Barcode-Tastaturlayout falsch (scan ergibt `ß` statt `-`) → Scanner-Fix
- Artikel ist in einer aktiven Auktion gesperrt (Auction-Check) → im Admin prüfen

### Checkout schlägt fehl mit „SumUp error"
Phase P0 (Dry-Run) — SumUp ist noch extern. Zahlungsart im UI auf "Bar" oder "Überweisung" umstellen.

### Quittung druckt nicht
POS nutzt den **A4-Standard-Drucker**, nicht den Brother QL. Systemeinstellungen → Drucker → Standard-Drucker auf den Bondrucker oder A4-Drucker setzen.

---

## System

### `lpoptions` / `lpstat` funktionieren nicht
CUPS-Dienst neustarten:
```bash
sudo launchctl stop org.cups.cupsd
sudo launchctl start org.cups.cupsd
```

### Homebrew-Commands: „command not found"
Terminal neu starten, oder:
```bash
eval "$(/opt/homebrew/bin/brew shellenv)"  # Apple Silicon (M-Serie, z.B. MacBook Air M5)
# oder für Intel-Macs (z.B. A2141):
# eval "$(/usr/local/bin/brew shellenv)"
```

### Python3 / PyObjC fehlt
```bash
/usr/bin/python3 -m pip install --user pyobjc-framework-Quartz
```

---

## Checkliste bei komplettem Reset

Wenn nichts mehr geht:

1. Drucker-Rolle raus + rein
2. Drucker aus/an
3. Scanner-Empfänger raus + rein
4. Scanner aus/an
5. QZ Tray beenden + neu starten (`killall "QZ Tray" && open -a "QZ Tray"`)
6. Safari Tab schließen + Admin neu öffnen
7. MacBook Reboot
8. `bash scripts/verify-setup.sh` — alle ✓?
9. Wenn immer noch Problem: Robin anrufen mit Screenshot
