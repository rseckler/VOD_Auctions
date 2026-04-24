# Installations-Anleitung — MacBook Air M5 + Mac Studio

Schritt-für-Schritt-Anleitung zum Ausrollen des Setup-Kits auf Franks beiden Macs. Läuft **einmal pro Gerät** (MacBook Air zuerst, dann Mac Studio oder umgekehrt). Dauer ca. **15 Minuten pro Gerät** — davon ~10 Minuten Hardware-Konfiguration (Brother Web-UI + Scanner-Setup-Barcodes).

> **Wichtig:** Beide Macs (MacBook Air M5 Apple Silicon + Mac Studio) laufen auf arm64. Das Script erkennt die Architektur automatisch. Falls Intel-Mac dabei ist (z.B. MBP16 A2141), geht genauso.

> **Seit rc34 (2026-04-22):** QZ Tray ist komplett raus. Silent-Print läuft jetzt über die **VOD Print Bridge** — ein kleiner Python-Dienst (Pure stdlib, ~250 Zeilen) der als LaunchAgent lokal auf dem Mac läuft. Kein Java, kein Zertifikate-Gedöns, keine Dialoge beim ersten Druck. Siehe [`print-bridge/README.md`](print-bridge/README.md) für Details.

---

## Vor der Installation

**Diese Dinge brauchst Du griffbereit:**

1. **Der Mac**, auf dem installiert wird, eingeschaltet + ins WLAN eingebucht
2. **Admin-Passwort** für diesen Mac (für `sudo`-Installations-Dialoge)
3. **Brother QL-820NWBc** eingeschaltet + im gleichen WLAN. Drucker-IP ablesen am LCD-Display: `Menü → WLAN → Info → IP-Adresse` (Notizzettel dafür!)
4. **Drucker-Admin-Passwort** — steht auf einem Aufkleber an der Drucker-Rückseite (Format `Pwd: xxxxxxxx`)
5. **Inateck BCST-70 Barcode-Scanner** entpackt + USB-Kabel bereit
6. **Brother-Handbuch / Scanner-Handbuch** als Setup-Barcodes: `frank-macbook-setup/scanner/BCST-70_Complete_Manual-V3_DE.pdf`

**Pro-Tipp:** MacBook ans Netzteil hängen. Der Installer braucht nur noch den Brother-Treiber (~60 MB manuell), ansonsten ist alles local/Python stdlib.

---

## Schritt 1 — Homebrew installieren (falls noch nicht da)

**Check:** Terminal öffnen (Cmd+Space → „Terminal") und eingeben:
```sh
which brew
```

**Wenn `brew` gefunden wird** (z.B. `/opt/homebrew/bin/brew`), weiter bei Schritt 2.

**Wenn „not found":**
```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
Einmal Admin-Passwort eingeben, ~3 Minuten warten, fertig. Danach den Hinweis am Ende der Homebrew-Installation beachten (meist musst Du 2 Zeilen in `~/.zprofile` einfügen — der Installer zeigt sie an).

---

## Schritt 2 — Kit herunterladen

### Option A: Einzeiler (empfohlen — holt Repo + startet Setup)

Ein einzelner Terminal-Befehl holt das Repo nach `~/VOD_Auctions`, prüft Voraussetzungen (Xcode CLT, Homebrew) und startet direkt `install.sh`:

```sh
bash -c "$(curl -fsSL https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-macbook-setup/bootstrap.sh)"
```

Beim erneuten Ausführen wird das Repo per `git fetch && git reset --hard origin/main` aktualisiert — Kit bleibt immer auf dem neuesten Stand. Siehe [`bootstrap.sh`](bootstrap.sh) für Details.

**Voraussetzungen die der Einzeiler prüft:**
- Xcode Command-Line-Tools (bringen `git` + `python3`) — werden bei Bedarf via `xcode-select --install` GUI-Dialog angestoßen
- Homebrew — wird NICHT automatisch installiert (eigene sudo-Prompts); bei Fehlen wird der Install-Befehl ausgegeben

### Option B: Manueller Clone (für Dev-Zwecke)

```sh
cd ~
git clone https://github.com/rseckler/VOD_Auctions.git
cd VOD_Auctions/frank-macbook-setup
bash install.sh
```

### Option C: Als ZIP (keine Git-Installation nötig)

1. https://github.com/rseckler/VOD_Auctions öffnen
2. Grüner „Code"-Button → „Download ZIP"
3. ZIP doppelklicken → entpackt sich in ~/Downloads
4. Im Terminal:
   ```sh
   cd ~/Downloads/VOD_Auctions-main/frank-macbook-setup
   bash install.sh
   ```

---

## Schritt 3 — Brother-Treiber installieren (manuell, einmal)

**Warum manuell?** Die Brother-.pkg (60 MB) darf aus rechtlichen Gründen nicht im Kit gehostet werden.

1. Safari öffnen: https://support.brother.com/g/b/downloadlist.aspx?c=eu_ot&lang=en&prod=lpql820nwbeas&os=10064
2. **„Full Driver & Software Package"** herunterladen (~60 MB)
3. .pkg doppelklicken, Admin-Passwort eingeben, Assistenten durchklicken
4. Danach: **Drucker aus/an** (Power-Knopf, 5 Sek warten, wieder an)

**Alternative falls Link sich ändert:** brother.com → Support → Suche „QL-820NWB" → Downloads → macOS → Full Package.

---

## Schritt 4 — Das Setup-Script ausführen

**Wenn Du den Einzeiler aus Schritt 2 / Option A genutzt hast: schon erledigt.** Der Bootstrap ruft `install.sh` automatisch auf — überspringe diesen Schritt.

Nur bei Option B oder C manuell nötig, im Terminal (im `frank-macbook-setup/` Verzeichnis):

```sh
bash install.sh
```

Das Script läuft **7 Schritte durch**:

| # | Was | Interaktiv? |
|---|---|---|
| 1/7 | System-Check (macOS-Version, Architektur, Homebrew) | nein |
| 2/7 | Brother-Treiber verifizieren + Queue-Name normalisieren | nein |
| 3/7 | **Print Bridge installieren** (entfernt altes QZ Tray falls vorhanden, legt LaunchAgent an) | nur falls QZ Tray vorher drauf war — sudo für `/Applications/QZ Tray.app` löschen |
| 4/7 | **CUPS `PageSize=Custom.29x90mm`** setzen | nein |
| 5/7 | **Drucker-Raster-Mode umstellen** (Web-Interface) | **ja** — Drucker-IP + Drucker-Admin-Pwd eingeben |
| 6/7 | Safari Web-App für `admin.vod-auctions.com` | **ja** — Enter drücken |
| 7/7 | **Test-Label drucken** | **ja** — Enter drücken |

### Step 5 im Detail — Drucker-Raster-Mode

Das Script öffnet die Drucker-Web-UI im Browser (https://<Drucker-IP>/). Dort:

1. **„Open Secure Login"** klicken → Passwort eingeben (steht auf Drucker-Rückseite, Format `Pwd: xxxxxxxx`)
2. **Printer Settings → Device Settings**
3. **Command Mode:** aktuell `P-touch Template` → auf **`Raster`** umstellen
4. Ganz unten: **Submit**
5. Drucker **aus + wieder ein** (Power-Knopf lang drücken)
6. Zurück ins Terminal, **Enter drücken**, Script geht weiter

**Warum das nötig ist:** Ohne Raster-Mode ignoriert der Drucker alle CUPS-Längenangaben und druckt nur ein ~29×30 mm Quadrat in die Ecke. Siehe `docs/PRINTER_WEB_CONFIG.md` für Screenshots.

### Step 7 — Test-Label

Das Script druckt ein echtes Test-Label (Künstler „Asmus Tietchens", Barcode `VOD-TEST01`). Wenn das Label korrekt rauskommt — 29×90 mm, Barcode lesbar, Text nicht verschoben — ist die Print-Pipeline fertig.

**Wenn es schiefgeht:** `docs/TROUBLESHOOTING.md` — das ist die destillierte Symptom→Ursache→Fix-Tabelle aus 25 Test-Drucken beim ersten Setup.

---

## Schritt 5 — Scanner konfigurieren

Nach dem Setup-Script ist der Scanner noch im Windows-Modus (ab Werk). Umstellen auf **macOS + deutsche Tastatur**:

1. Scanner per USB anschließen → macOS zeigt „Tastatur-Einrichtungsassistent" → **wegklicken**
2. PDF öffnen: `frank-macbook-setup/scanner/BCST-70_Complete_Manual-V3_DE.pdf`
3. **Kapitel §1.6** aufschlagen
4. **Scannen:** Setup-Barcode „macOS/iOS Modus"
5. **Scannen:** Setup-Barcode „Deutsche Tastatur (QWERTZ)"
6. **Test:** TextEdit öffnen, irgendeinen Barcode scannen → sollte Barcode-Text + Enter eintippen. Wenn `VOD-000001` als `VODß000001` ankommt → Schritt 5 nicht durchgeführt, wiederholen.

Detaillierte Anleitung: `frank-macbook-setup/scanner/SCANNER_SETUP.md`.

---

## Schritt 6 — Print Bridge prüfen (normalerweise keine Aktion nötig)

Die Print Bridge wurde in Step 3 als LaunchAgent installiert und läuft seither im Hintergrund. Beim ersten Klick auf „Label drucken" im Admin **erscheint kein Popup** — das Label kommt direkt aus dem Drucker.

Wenn im Admin-Header oben rechts als Badge **„Silent Print"** steht (statt „Browser Print"), ist alles gut. Falls „Browser Print":

```sh
# Status-Check
curl -s http://127.0.0.1:17891/health

# Erwartet: {"ok":true,"printer_found":true,...}

# Wenn leer oder Fehler → Bridge neu installieren
bash frank-macbook-setup/print-bridge/install-bridge.sh
```

Details: [`print-bridge/README.md`](print-bridge/README.md)

---

## Schritt 7 — Admin-Login

Das Script hat eine Safari-Web-App ins Dock gelegt. Klick drauf → Login-Screen:

- **E-Mail:** frank@vod-records.com
- **Passwort:** wird mündlich übergeben (nicht in Dokumenten)

Drin? Dann:
- **Inventur starten:** Dashboard → „Operations" → „Inventory Stocktake" → „Start Session"
- **POS starten:** Dashboard → „Operations" → „POS Walk-in Sale"

Tägliche Bedienungs-Anleitung auf Deutsch: `frank-macbook-setup/ANLEITUNG_FRANK.md`.

---

## Troubleshooting — die häufigsten Stolperfallen

| Symptom | Lösung |
|---|---|
| „Homebrew not found" | Schritt 1 nachholen |
| „Brother-Treiber fehlt" obwohl installiert | Drucker aus/an, dann Script neu starten |
| Test-Druck kommt als 29×30 mm Quadrat | Step 5 nicht durchgeführt — Raster-Mode fehlt |
| Test-Druck ist um 90° gedreht / geclippt | CUPS-Option fehlt — `lpoptions -p Brother_QL_820NWB -o PageSize=Custom.29x90mm` manuell nachziehen |
| Scanner schickt `ß` statt `-` | Schritt 5 nicht durchgeführt — Setup-Barcodes scannen |
| Admin-Header zeigt „Browser Print" statt „Silent Print" | Print Bridge down. `curl -s http://127.0.0.1:17891/health` — wenn leer, `bash print-bridge/install-bridge.sh` neu laufen |
| „Label drucken" öffnet Druckdialog | Bridge offline (siehe oben) — Fallback auf Browser-Druck ist absichtlich, bis Bridge wieder läuft |
| Bridge installiert, aber findet Drucker nicht | `lpstat -e` zeigt Queue-Namen. Wenn Name anders als `Brother_QL_820NWB`: `bash print-bridge/install-bridge.sh --printer "DeinName"` |
| Drucker-IP nicht erreichbar | Drucker + Mac im gleichen WLAN? Bonjour prüfen: `dns-sd -B _http._tcp local` |

Alle weiteren Fehler: `docs/TROUBLESHOOTING.md` — Vollständige Debugging-Matrix.

---

## Re-Runs — Script nochmal laufen lassen

**Sicher, das Script ist idempotent.** Bridge-Installer erkennt existierende LaunchAgent, cleanes Re-Bootstrap. CUPS-Optionen, Safari-Web-App, Login-Item: alle idempotent. Altes QZ Tray wird bei Re-Run entfernt (einmalige sudo-Prompt).

**Nicht idempotent:** Step 5 (Drucker-Raster-Mode) — wird bei jedem Run abgefragt, einfach Enter drücken wenn schon umgestellt.

---

## Zweiter Mac (Mac Studio) — und dritter (Robins Dev-Mac)

**Komplett identischer Ablauf:** Schritte 1–7 noch einmal durchlaufen. Das Kit-Verzeichnis kann vom ersten Mac auf den zweiten kopiert werden (via AirDrop / iCloud / USB-Stick) — dann entfällt Schritt 2 Option B.

**Was pro Mac separat nötig ist:**
- Brother-Treiber installieren (ist Mac-lokal)
- Print Bridge LaunchAgent anlegen (ist Mac-lokal, `install.sh` macht es automatisch)
- CUPS-Queue anlegen (ist Mac-lokal)
- Scanner einmal konfigurieren (ist Scanner-lokal, per Setup-Barcode)

**Was NICHT pro Mac nötig ist:**
- Drucker-Raster-Mode — der Mode ist im Drucker selbst gespeichert, gilt für alle Macs

**Für Dev-Macs ohne angeschlossenen Brother-Drucker** (z.B. Robins MacBook zum Entwickeln): `install.sh` erkennt den fehlenden Brother und installiert die Bridge im **DRY_RUN**-Mode. Bridge antwortet korrekt auf alle Endpoints, ruft aber `lp` nicht auf. Später wenn Brother dran ist: `bash print-bridge/install-bridge.sh` (ohne `--dry-run`) neu laufen lassen.

---

## Nächste Schritte

Nach erfolgreicher Installation:

1. **Frank lesen lassen:** [`ANLEITUNG_FRANK.md`](ANLEITUNG_FRANK.md) — tägliche Bedienung
2. **Erste echte Inventur-Session:** 5–10 Test-Artikel verifizieren, Labels drucken, aufkleben
3. **Bei Problemen:** [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) ODER Robin kontaktieren

**Kontakt bei technischen Problemen:**
- Robin Seckler — rseckler@gmail.com
- VPS-Admin-Zugang für Diagnose vorhanden
