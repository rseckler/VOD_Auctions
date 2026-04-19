# Frank's MacBook — Installations-Kit

**Ziel:** MacBook Air M5 (Apple Silicon, arm64) einrichten für Inventur + POS Kasse. Kit funktioniert auch auf Intel-Macs (getestet: MacBook Pro 16" A2141).
**Zielgruppe:** Robin (Installation). Frank erhält später `ANLEITUNG_FRANK.md`.

---

## Was dieses Kit einrichtet

| Komponente | Zweck | Wie |
|---|---|---|
| **Brother QL-820NWBc** (Label-Drucker, 29×90mm) | Barcode-Labels für Exemplare | `install.sh` → CUPS-Queue + Raster-Mode-Guide |
| **Inateck BCST-70** (Barcode-Scanner, USB) | Barcode-Scan in Inventur + POS | `scanner/SCANNER_SETUP.md` → Setup-Barcodes scannen |
| **QZ Tray** (Silent-Print-Daemon) | Auto-Print ohne Browser-Dialog | `install.sh` → Homebrew Cask |
| **Safari Web-App** für Admin | Direkt-Launcher `admin.vod-auctions.com` | `install.sh` → Safari "Zum Dock hinzufügen" |
| **Test-Label** | Verifikation der Print-Pipeline | `test-print.sh` |

**NICHT** in diesem Kit:
- Brother-Treiber-Download (60 MB .pkg) — muss manuell von support.brother.com geladen werden (rechtliche Gründe, kein Re-Host)
- A4-Bon-Drucker für POS-Quittungen — nutzt Franks vorhandenen Drucker (macOS AirPrint)
- VOD-Login-Credentials — werden mündlich übergeben
- iPhone-Konfiguration für Foto-Upload — läuft über dieselbe Web-App im Safari auf dem iPhone

---

## Voraussetzungen (vor dem Ausführen)

1. **macOS 12 Monterey oder neuer** (M5 MacBook Air shipt mit Sequoia 15+ / Tahoe 16+ — passt. A2141 getestet bis Sonoma 14.x.)
   → `sw_vers -productVersion` prüfen
2. **Admin-Rechte** auf dem MacBook (Frank's lokaler Account ist Admin)
3. **Drucker + Scanner sind physisch angeschlossen:**
   - QL-820NWBc per USB + Strom, DK-22210 Rolle eingelegt
   - BCST-70 USB-Empfänger im USB-A Port (oder USB-C Adapter)
4. **Drucker ist im WLAN** (Frank's Heimnetz) — muss am Drucker-Display eingerichtet werden, falls nicht schon geschehen
5. **Homebrew installiert** — Check: `which brew`. Falls nicht:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
6. **Brother-Treiber installiert** (siehe unten)

---

## Brother-Treiber (vor `install.sh`)

1. https://support.brother.com/ → Produkt `QL-820NWB` → Downloads → macOS
2. **Full Driver & Software Package** laden (~60 MB)
3. `.pkg` öffnen, durchklicken, Admin-Passwort eingeben
4. Nach Installation: Drucker aus- und wieder einschalten

**Verifikation:**
```bash
lpstat -p | grep -i brother
# Erwartet: printer Brother_QL_820NWB ist im Leerlauf.
```

Falls `lpstat` den Drucker nicht zeigt: Systemeinstellungen → Drucker & Scanner → + → Brother QL-820NWB auswählen → Hinzufügen.

---

## Installation

```bash
cd ~/Desktop
# Kit nach Frank's Mac übertragen (AirDrop, USB-Stick, oder git clone)
git clone https://github.com/rseckler/VOD_Auctions.git
cd VOD_Auctions/frank-macbook-setup

# Ausführen (fragt interaktiv nach)
bash install.sh
```

Das Script ist **idempotent**: es kann bei Fehlern mehrfach gestartet werden.

**Schritte im Script:**

1. **System-Check** (macOS-Version, Homebrew, Brother-Treiber)
2. **QZ Tray installieren** (`brew install --cask qz-tray`)
3. **CUPS-PageSize setzen** (`Custom.29x90mm` als User-Default)
4. **Drucker Raster-Mode** — öffnet das Web-Interface im Browser (manuell, siehe `docs/PRINTER_WEB_CONFIG.md`)
5. **Raster-Mode verifizieren** (curl-Check gegen Drucker)
6. **Safari Web-App** für `https://admin.vod-auctions.com` erstellen
7. **Test-Label drucken** (optional, empfohlen)

---

## Test-Lauf

Nach dem Install:

```bash
bash test-print.sh
```

Druckt ein Diagnostik-Label (29×90mm mit Ruler + Test-Barcode). Wenn das sauber rauskommt, ist die Print-Pipeline komplett.

**Dann Scanner konfigurieren:**

1. `scanner/SCANNER_SETUP.md` öffnen
2. Die 6 Setup-Barcodes (aus dem Inateck-Handbuch `assets/BCST-70_Setup_Barcodes.pdf`) nacheinander scannen
3. In TextEdit testen: gedrucktes Test-Label scannen → `VOD-000001` muss mit korrektem Bindestrich ankommen

---

## Login

Nach Install öffnet sich die Admin-Web-App automatisch im Safari (oder als Dock-Icon).

URL: https://admin.vod-auctions.com
User: `frank@vod-records.com`
Passwort: (mündlich übergeben — liegt in Robin's 1Password "VOD Admin — Frank")

**Inventur-Modus:** `/app/erp/inventory/session`
**POS-Kasse:** `/app/pos`

---

## Troubleshooting

Siehe `docs/TROUBLESHOOTING.md`.

Wichtigste Stolperfallen aus dem Hardware-Test vom 2026-04-11:
- **Label kommt ~29×30mm quadratisch:** Drucker ist im P-touch-Template-Mode → `docs/PRINTER_WEB_CONFIG.md` → Command-Mode auf `Raster`
- **Scanner tippt `ß` statt `-`:** Scanner ist im US-Keyboard-Mode → `scanner/SCANNER_SETUP.md` neu durchgehen
- **Auto-Print öffnet immer Browser-Dialog:** QZ Tray läuft nicht → `brew services start qz-tray` oder aus dem Launchpad starten

---

## Referenzen

- Vollständige Hardware-Doku: [`../docs/hardware/BROTHER_QL_820NWB_SETUP.md`](../docs/hardware/BROTHER_QL_820NWB_SETUP.md)
- Inventur-Konzept v2: [`../docs/optimizing/INVENTUR_WORKFLOW_V2_KONZEPT.md`](../docs/optimizing/INVENTUR_WORKFLOW_V2_KONZEPT.md)
- POS-Konzept: [`../docs/optimizing/POS_WALK_IN_KONZEPT.md`](../docs/optimizing/POS_WALK_IN_KONZEPT.md)
