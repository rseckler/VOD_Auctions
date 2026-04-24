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

## VOD Print Bridge (Silent-Print-Daemon)

> Ersetzt seit rc34 (2026-04-22) das alte QZ Tray. Läuft als LaunchAgent im User-Scope auf `127.0.0.1:17891`. Kein Java, keine Zertifikate, keine Dialoge.

### Admin-Header zeigt „Browser Print" statt „Silent Print"
**Ursache:** Bridge ist offline oder findet keinen CUPS-Drucker.
**Schnell-Check:**
```bash
curl -s http://127.0.0.1:17891/health
# Erwartet: {"ok":true,"printer_found":true,"dry_run":false,...}
```

**Wenn kein Output / Connection refused:**
```bash
# Bridge-Agent-Status
launchctl print gui/$(id -u)/com.vod-auctions.print-bridge 2>&1 | head -20

# Log anschauen
tail -30 ~/Library/Logs/vod-print-bridge.log

# Reinstall (idempotent)
bash ~/VOD_Auctions/frank-macbook-setup/print-bridge/install-bridge.sh
```

**Wenn `printer_found:false`:**
```bash
# Welche Queues gibt's?
lpstat -e

# Wenn Brother-Name anders ist:
bash ~/VOD_Auctions/frank-macbook-setup/print-bridge/install-bridge.sh --printer "QueueName"
```

### Bridge crashed in Loop
`launchctl print` zeigt `runs = N` mit N hoch. Log prüfen:
```bash
tail -50 ~/Library/Logs/vod-print-bridge.log
```
Häufigste Ursache: Port 17891 schon belegt. Check via `lsof -i :17891`.

### `mv: rename ... /Library/LaunchAgents/...: No such file or directory` → `launchctl bootstrap failed: 5: Input/output error`
**Ursache:** Auf frischem macOS-User-Account (neues MacBook, neuer Local-User) existiert `~/Library/LaunchAgents/` nicht. `mv tmp.plist ~/Library/LaunchAgents/...` scheitert, LaunchAgent wird nie angelegt, `launchctl bootstrap` meldet kurz darauf Input/output error.
**Status:** In `install-bridge.sh` seit 2026-04-24 gefixt (`mkdir -p` vor `mv`). Wenn das Symptom auf älteren Versionen auftritt:
```bash
mkdir -p ~/Library/LaunchAgents
cd ~/VOD_Auctions && git pull
bash frank-macbook-setup/print-bridge/install-bridge.sh --printer Brother_QL_820NWB
```
(Erstmalig gesehen auf Franks MacBook Air M5 / macOS 26.4.1, 2026-04-24.)

### Bridge startet fälschlich im DRY_RUN, obwohl CUPS-Queue vorhanden ist
**Ursache:** `install.sh` Step 3 nutzte früher `lpstat -p | grep brother` zur Detection — auf macOS 26+ zeigt `lpstat -p` die Queue nicht zuverlässig, wenn der physische Drucker gerade offline ist (Enabled-Status der Queue, nicht Existenz). Step 2 nutzt dagegen `lpstat -e` (Queue-Namen, locale- und online-unabhängig) und findet die Queue korrekt — Widerspruch in derselben Session.
**Status:** Seit 2026-04-24 nutzt auch Step 3 `lpstat -e`. Wenn DRY_RUN trotzdem fälschlich aktiv ist, Bridge direkt mit expliziter Queue + IP (überspringt alle Auto-Checks):
```bash
bash ~/VOD_Auctions/frank-macbook-setup/print-bridge/install-bridge.sh \
  --printer Brother_QL_820NWB --printer-ip <DRUCKER-IP>
```

### Bridge reagiert, aber Druck kommt nicht
Im Log schauen: wird `lp` aufgerufen? Exit-Code? Normalerweise sollte stdout zeigen:
```
[INFO] printing 2614 bytes → lp -d Brother_QL_820NWB -o PageSize=Custom.29x90mm -n 1
```

Wenn ja aber kein Papier: CUPS-Queue oder Drucker-Hardware-Problem, siehe Drucker-Sektion oben.

### Altes QZ Tray noch vorhanden nach Update
```bash
# Komplett-Purge
pkill -f "QZ Tray" 2>/dev/null
sudo rm -rf "/Applications/QZ Tray.app"
rm -rf ~/Library/Application\ Support/qz
osascript -e 'tell application "System Events" to delete login item "QZ Tray"' 2>/dev/null
# Dann install.sh neu laufen
bash ~/VOD_Auctions/frank-macbook-setup/install.sh
```

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
5. Print Bridge neu starten: `launchctl kickstart -k gui/$(id -u)/com.vod-auctions.print-bridge`
6. Safari Tab schließen + Admin neu öffnen
7. MacBook Reboot
8. `bash scripts/verify-setup.sh` — alle ✓?
9. Wenn immer noch Problem: Robin anrufen mit Screenshot
