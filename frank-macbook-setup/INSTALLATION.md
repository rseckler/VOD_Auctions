# Installations-Anleitung — MacBook Air M5 + Mac Studio

Schritt-für-Schritt-Anleitung zum Ausrollen des Setup-Kits auf Franks beiden Macs. Läuft **einmal pro Gerät** (MacBook Air zuerst, dann Mac Studio oder umgekehrt). Dauer ca. **20 Minuten pro Gerät** — davon ~10 Minuten Hardware-Konfiguration (Brother Web-UI + Scanner-Setup-Barcodes).

> **Wichtig:** Beide Macs (MacBook Air M5 Apple Silicon + Mac Studio) laufen auf arm64. Das Script erkennt die Architektur automatisch und zieht die passende QZ-Tray-Version. Falls Intel-Mac dabei ist (z.B. MBP16 A2141), geht genauso.

---

## Vor der Installation

**Diese Dinge brauchst Du griffbereit:**

1. **Der Mac**, auf dem installiert wird, eingeschaltet + ins WLAN eingebucht
2. **Admin-Passwort** für diesen Mac (für `sudo`-Installations-Dialoge)
3. **Brother QL-820NWBc** eingeschaltet + im gleichen WLAN. Drucker-IP ablesen am LCD-Display: `Menü → WLAN → Info → IP-Adresse` (Notizzettel dafür!)
4. **Drucker-Admin-Passwort** — steht auf einem Aufkleber an der Drucker-Rückseite (Format `Pwd: xxxxxxxx`)
5. **Inateck BCST-70 Barcode-Scanner** entpackt + USB-Kabel bereit
6. **Brother-Handbuch / Scanner-Handbuch** als Setup-Barcodes: `frank-macbook-setup/scanner/BCST-70_Complete_Manual-V3_DE.pdf`

**Pro-Tipp:** MacBook ans Netzteil hängen. Der Installer lädt ~100 MB (QZ Tray) herunter + installiert Brother-Treiber.

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

Das Kit ist im VOD-Repo unter `frank-macbook-setup/`. Zwei Optionen:

### Option A: Per Git Clone (empfohlen — einfacher für Updates)

```sh
cd ~
git clone https://github.com/rseckler/VOD_Auctions.git
cd VOD_Auctions/frank-macbook-setup
```

### Option B: Als ZIP (keine Git-Installation nötig)

1. https://github.com/rseckler/VOD_Auctions öffnen
2. Grüner „Code"-Button → „Download ZIP"
3. ZIP doppelklicken → entpackt sich in ~/Downloads
4. Im Terminal:
   ```sh
   cd ~/Downloads/VOD_Auctions-main/frank-macbook-setup
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

Im Terminal (im `frank-macbook-setup/` Verzeichnis):

```sh
bash install.sh
```

Das Script läuft **7 Schritte durch**:

| # | Was | Interaktiv? |
|---|---|---|
| 1/7 | System-Check (macOS-Version, Architektur, Homebrew) | nein |
| 2/7 | Brother-Treiber verifizieren + Queue-Name normalisieren | nein |
| 3/7 | **QZ Tray installieren** (lädt ~100 MB von GitHub, installiert via `sudo installer`) | **ja** — Admin-Passwort eingeben |
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

## Schritt 6 — QZ Tray bestätigen (einmalig beim ersten Druck)

Beim **ersten Klick auf „Label drucken" im Admin** erscheint ein Popup von QZ Tray:

```
Allow admin.vod-auctions.com to print?
[☐] Remember this decision
[Deny] [Allow]
```

1. **„Remember this decision"** anhaken
2. **„Allow"** klicken

Ab jetzt druckt der Admin Labels **ohne weiteren Dialog** im Hintergrund. Falls Du die Frage nochmal beantworten willst: QZ-Tray-Menübar-Icon → Preferences → Sites → Entries löschen.

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
| „QZ Tray not running" im Admin-Header | QZ Tray App starten: `open "/Applications/QZ Tray.app"` |
| „Label drucken" öffnet nur Tab/Dialog | QZ Tray wurde nicht mit „Allow + Remember" bestätigt — nochmal klicken |
| Drucker-IP nicht erreichbar | Drucker + Mac im gleichen WLAN? Bonjour prüfen: `dns-sd -B _http._tcp local` |

Alle weiteren Fehler: `docs/TROUBLESHOOTING.md` — Vollständige Debugging-Matrix.

---

## Re-Runs — Script nochmal laufen lassen

**Sicher, das Script ist idempotent.** Wenn QZ Tray schon installiert ist, sagt es „bereits installiert" und überspringt. Gleiches gilt für CUPS-Optionen, Safari-Web-App, Login-Item.

**Nicht idempotent:** Step 5 (Drucker-Raster-Mode) — wird bei jedem Run abgefragt, einfach Enter drücken wenn schon umgestellt.

---

## Zweiter Mac (Mac Studio)

**Komplett identischer Ablauf:** Schritte 1–7 noch einmal durchlaufen. Das Kit-Verzeichnis kann vom ersten Mac auf den zweiten kopiert werden (via AirDrop / iCloud / USB-Stick) — dann entfällt Schritt 2 Option B.

**Was pro Mac separat nötig ist:**
- Brother-Treiber installieren (ist Mac-lokal)
- QZ Tray installieren (ist Mac-lokal)
- CUPS-Queue anlegen (ist Mac-lokal)
- Scanner einmal konfigurieren (ist Scanner-lokal, per Setup-Barcode)

**Was NICHT pro Mac nötig ist:**
- Drucker-Raster-Mode — der Mode ist im Drucker selbst gespeichert, gilt für beide Macs

---

## Nächste Schritte

Nach erfolgreicher Installation:

1. **Frank lesen lassen:** [`ANLEITUNG_FRANK.md`](ANLEITUNG_FRANK.md) — tägliche Bedienung
2. **Erste echte Inventur-Session:** 5–10 Test-Artikel verifizieren, Labels drucken, aufkleben
3. **Bei Problemen:** [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) ODER Robin kontaktieren

**Kontakt bei technischen Problemen:**
- Robin Seckler — rseckler@gmail.com
- VPS-Admin-Zugang für Diagnose vorhanden
