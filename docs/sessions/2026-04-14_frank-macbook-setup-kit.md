# Session 2026-04-14 — Frank MacBook Setup Kit

**Dauer:** ~1h
**Fokus:** Installations-Kit für Franks altes MBP16 A2141 bauen, damit Inventur + POS im Laden starten kann.
**Release:** `v1.0.0-rc30`

---

## TL;DR

- **`frank-macbook-setup/`** als komplettes, idempotentes Install-Kit fürs MacBook Pro 16" 2019 (A2141, Intel) erstellt.
- Brother QL-820NWBc, Inateck BCST-70, QZ Tray, Safari-Web-App und Test-Print-Pipeline in einem interaktiven `install.sh` (7 Schritte).
- Pure-Python-PDF-Generator ohne Deps — schreibt PDF-1.4 direkt nach Spec, /usr/bin/python3 ohne PyObjC reicht.
- Dokumentation komplett: Robins README, Franks Anleitung auf Deutsch, Troubleshooting-Matrix, Drucker-Web-UI-Guide, POS-Notizen, Scanner-Setup.

---

## Ausgangssituation

Die Inventur v2 ist technisch komplett (rc28 Workflow + rc29 Image Storage). Nächster Schritt laut TODO.md: Frank briefen. Dafür muss das alte MacBook im Laden funktionsfähig gemacht werden — Hardware validiert war zwar auf Robins Rechner, aber Frank arbeitet physisch mit dem Bestand im Laden auf seinem eigenen Gerät.

Robins Ansage: *„Komplettes Installations-Kit mit allem, dass ich auf diesem alten macbook einfach ausführen kann. Ebenso soll das Scannen und das Thema POS Kasse dort funktionieren."*

---

## Design-Entscheidungen

### 1. Installer statt manuelle Anleitung

Bestehende `docs/hardware/BROTHER_QL_820NWB_SETUP.md` ist ~300 Zeilen Prosa. Für Robin als Erst-Installateur vor Ort im Laden wäre Copy-Paste aus einem Dokument fehleranfällig. Stattdessen: `install.sh` mit interaktiven Prompts, idempotent (kann bei jedem Teilfehler nochmal laufen), führt den User durch die Sequenz.

Manuelle Steps die nicht automatisierbar sind, werden explizit ausgelagert:
- **Brother-Driver-PKG** — keine Re-Host-Rechte, `install.sh` öffnet Brother-Download-Seite im Safari und bricht ab.
- **Raster-Mode am Drucker-Web-UI** — per-Device-Passwort auf Rückseite, muss User selbst eingeben. Script öffnet Browser + Anleitung.
- **Scanner-Setup-Barcodes** — physisches Scannen, separates Manual.

### 2. Pure-Python-PDF-Generator statt Dependencies

Erster Entwurf nutzte PyObjC/Quartz — funktioniert auf Apple-Silicon-Macs mit preinstalliertem pyobjc. Test auf Robins Mac zeigte: `/usr/bin/python3` (Apple stub) hat kein Quartz-Modul. Frank's Mac hätte denselben Zustand.

Optionen:
- pip install pyobjc → Netzwerk + pip-Setup nötig
- Homebrew Python + reportlab → 2 extra Deps
- Pre-generiertes PDF bundlen → kein Regenerate vor Ort möglich
- **Pure-Python PDF-Bytes schreiben → gewählt**

Resultat: 160 Zeilen Python, keine Dependencies, erzeugt 2614-Byte PDF-1.4 das macOS `file(1)` sauber identifiziert. Content-Stream mit `0 -1 1 0 0 LABEL_H cm` affine-Matrix für -90° Rotation + Translation, damit Layout-Code in einem virtuellen 90×29 Landscape-Frame denken kann — identisch zur Production-Strategie in `backend/src/lib/barcode-label.ts`.

### 3. Locale-Sicherheit

Erster Pass: `lpstat -p | awk '... {print $2}'` → auf macOS mit deutscher Locale liefert Brother den Queue-Namen mit German Quotes: `„Brother_QL_820NWB"`. `lpoptions` gab dann `tr: Illegal byte sequence` wegen UTF-8 Zeichen.

Fix: `LC_ALL=C` export am Anfang jedes Scripts + `tr -d '„"""'` Pipeline hinter dem awk.

### 4. Scanner-Handbuch: Symlink statt Kopie

BCST-70-Handbuch (originell in `~/Downloads`) liegt bereits unter `docs/hardware/BCST-70_Complete_Manual-V3_DE.pdf`. Relativer Symlink `scanner/BCST-70_Complete_Manual-V3_DE.pdf → ../../docs/hardware/...` statt Duplikation — bleibt git-tauglich (git versioniert Symlinks).

### 5. POS nicht vergessen

POS (walk-in sale, `/app/pos`) nutzt denselben Scanner, aber ein anderes Print-Target: A4/A6 für Kassenbons, nicht 29mm-Labels. Im Kit explizit dokumentiert (`docs/POS_NOTES.md`) dass der Brother QL das **nicht** druckt, Frank nutzt für POS-Quittungen seinen vorhandenen A4-Drucker via AirPrint.

---

## Kit-Struktur (11 Files)

```
frank-macbook-setup/
├── README.md                          Robins Installationsleitfaden
├── ANLEITUNG_FRANK.md                 Franks tägliche Bedienung (Deutsch)
├── install.sh                         Master-Installer (7 Schritte)
├── test-print.sh                      Test-Druck
├── assets/
│   └── test-label.pdf                 Pre-generiertes Fallback-PDF
├── scripts/
│   ├── generate-test-label.py         Pure-Python PDF-Generator
│   └── verify-setup.sh                Sanity-Check
├── scanner/
│   ├── SCANNER_SETUP.md               Inateck BCST-70 Config
│   └── BCST-70_Complete_Manual-V3_DE.pdf  (Symlink → docs/hardware/)
└── docs/
    ├── PRINTER_WEB_CONFIG.md          Raster-Mode-Umstellung
    ├── TROUBLESHOOTING.md             Symptom→Ursache→Fix-Matrix
    └── POS_NOTES.md                   POS-spezifische Hinweise
```

---

## Verifikation

| Check | Ergebnis |
|---|---|
| `generate-test-label.py` Output | 2614 Bytes, `file` → PDF-1.4, 1 Seite |
| qlmanage Thumbnail | Zeigt 29×90mm portrait mit Pseudo-Barcode + Ruler + Text |
| `verify-setup.sh` dry-run | System/Drucker/PageSize grün, QZ Tray rot erwartet (nicht installiert), Netzwerk grün |
| Locale-Bug-Fix | Nach `LC_ALL=C` + Quote-Strip: Queue-Name sauber |
| BCST-70 Manual-Symlink | Existiert + zeigt auf `docs/hardware/...` |

---

## Nächste Schritte (ausstehend)

1. **Kit auf Franks MacBook ausrollen** — USB-Stick / AirDrop / git clone, Brother-Driver manuell installieren, dann `bash install.sh`. Erwarteter Effort: ~30 Min vor Ort (davon 10 Min Brother-Driver-Download, 5 Min Raster-Mode-Web-UI, 5 Min Scanner-Setup, 10 Min Test-Druck + Sanity-Checks).
2. **Frank briefen** — `ANLEITUNG_FRANK.md` übergeben, Session-URL zeigen, 5-10 Artikel gemeinsam verifizieren.
3. **V5 Sync-Check** nach Frank-Test — verifizierte Preise dürfen nicht überschrieben werden.
4. **4-6 Wochen Inventur-Phase** — Frank arbeitet durch, Robin monitort.

Alle Items in `docs/TODO.md` Workstream 1 als 1.14 (✓), 1.15/1.16/1.17 (offen) eingetragen.

---

## Gelernte Lektionen

- **Install-Kits vor Deploy testen, auch am Code-Author-Gerät.** PyObjC-Annahme wäre bei Frank still gescheitert — erst die Test-Ausführung auf Robins `/usr/bin/python3` hat's aufgedeckt.
- **Deutsche macOS-Locale bricht awk/tr/grep-Pipelines still.** `LC_ALL=C` am Script-Anfang ist billige Versicherung, sollte Default-Pattern für alle künftigen Shell-Scripts im Projekt werden.
- **Idempotenz als Constraint für alle Installer.** Hardware-Setup-Sequenzen haben viele Fail-Points (WLAN-Setup, Web-UI-Login, Barcode-Scan-Session). User muss das Script beliebig oft neu starten können ohne doppelte Side-Effects.
- **Dokumentation mit zwei Zielgruppen trennen.** `README.md` für Robin (technisch, installing), `ANLEITUNG_FRANK.md` für Frank (daily use, deutsch, keine Kommandozeile). Nicht in einem File mischen.

---

## Referenzen

- CHANGELOG: `docs/architecture/CHANGELOG.md` (rc30-Eintrag)
- Hardware-Ursprungsdoku: `docs/hardware/BROTHER_QL_820NWB_SETUP.md`
- Inventur-Konzept: `docs/optimizing/INVENTUR_WORKFLOW_V2_KONZEPT.md`
- POS-Konzept: `docs/optimizing/POS_WALK_IN_KONZEPT.md`
- TODO: `docs/TODO.md` Workstream 1 (Items 1.14–1.17)
