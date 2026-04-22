# VOD Print Bridge

Lokaler HTTP-Agent für Silent-Label-Druck auf macOS. **Ersetzt QZ Tray
komplett** seit rc34.

## Was macht die Bridge?

Ein winziger Python-stdlib HTTP-Server, der als LaunchAgent auf
`127.0.0.1:17891` lauscht. Der Admin-UI schickt Label-PDFs per POST hin,
die Bridge ruft `lp` auf und CUPS schickt's an den Brother QL-820NWB — ohne
Druckdialog, ohne Signing, ohne Zertifikate.

```
Admin UI (Safari)
    POST http://127.0.0.1:17891/print  (PDF-Body)
         │
         ▼
Bridge (LaunchAgent, User-Scope)
    lp -d Brother_QL_820NWB -o PageSize=Custom.29x90mm
         │
         ▼
CUPS → Drucker (WiFi)
```

## Warum nicht QZ Tray?

**QZ Tray-Probleme bis rc33:**
- Silent-Print braucht signierte Requests → RSA-Keypair, `override.crt` ins
  App-Bundle kopieren (sudo), bei jedem QZ-Update futsch
- ~100 MB Java-Runtime + WebSocket-Dance
- Bei `data:`-URI-PDF "unknown protocol"-Fehler (rc30-32 Debug-Marathon)
- macOS-Updates brechen regelmäßig das Cert-Setup

**Bridge löst das:**
- Pure Python stdlib (läuft mit `/usr/bin/python3` — bei macOS dabei)
- Kein Signing, keine Zertifikate (127.0.0.1 ist Security-Boundary)
- ~250 Zeilen Code, transparent debuggbar
- `lp` nutzt die exakt gleiche, bereits validierte CUPS-Config
  (`PageSize=Custom.29x90mm`, siehe
  [`docs/hardware/BROTHER_QL_820NWB_SETUP.md`](../../docs/hardware/BROTHER_QL_820NWB_SETUP.md))

## Installation

### Teil von install.sh (empfohlen)

Der Bridge-Installer läuft automatisch als Step 3 von
[`frank-macbook-setup/install.sh`](../install.sh). Idempotent, kann beliebig
oft neu gestartet werden.

### Standalone

```bash
cd frank-macbook-setup/print-bridge
bash install-bridge.sh                          # prod mode (echter Druck)
bash install-bridge.sh --dry-run                # test mode (Druck simuliert)
bash install-bridge.sh --printer "QL820_WiFi"   # custom queue name
bash install-bridge.sh --uninstall              # LaunchAgent entfernen
```

Installiert:
- `~/.local/lib/vod-print-bridge/vod_print_bridge.py` — das Script
- `~/Library/LaunchAgents/com.vod-auctions.print-bridge.plist` — LaunchAgent
- `~/Library/Logs/vod-print-bridge.log` — Logs (stdout+stderr)

**Kein sudo nötig** — alles im User-Scope.

## Endpoints

### `GET /health`

Health-Check + Discovery. Wird vom Admin-UI alle paar Sekunden gepollt um
den Bridge-Status-Badge anzuzeigen.

```bash
$ curl -s http://127.0.0.1:17891/health
{"ok":true,"version":"1.0.0","printer":"Brother_QL_820NWB","printer_found":true,"dry_run":false,"cups_available":true}
```

- `printer_found=false` → fuzzy-match auf "brother ql" / "ql82" hat nichts
  gefunden. Installation reparieren oder CUPS-Queue-Name via `--printer`
  setzen.
- `dry_run=true` → Bridge akzeptiert Jobs, ruft aber `lp` nicht auf. Für
  Test-Setups ohne Drucker.

### `GET /printers`

Liste aller CUPS-Queues.

```bash
$ curl -s http://127.0.0.1:17891/printers
{"printers":[{"name":"Brother_QL_820NWB","status":"accepting"}, ...]}
```

### `POST /print`

Druckt ein PDF. Zwei Content-Types werden akzeptiert:

**Raw PDF (empfohlen — kein base64-Roundtrip):**
```bash
curl -X POST http://127.0.0.1:17891/print \
  -H "Content-Type: application/pdf" \
  --data-binary @label.pdf
```

**JSON mit base64:**
```bash
curl -X POST http://127.0.0.1:17891/print \
  -H "Content-Type: application/json" \
  -d '{"pdf_base64":"...","copies":2,"printer":"Brother_QL_820NWB"}'
```

Response:
```json
{"ok":true,"job_id":"Brother_QL_820NWB-42","printer":"Brother_QL_820NWB","bytes":2614}
```

Validierungen:
- Body muss mit `%PDF` beginnen
- Max 10 MB
- `copies` zwischen 1 und 50

## CORS & Browser-Compatibility

Bridge erlaubt CORS für:
- `https://admin.vod-auctions.com` (Production)
- `https://vod-auctions.com`
- `http://localhost:9000` (Medusa-Dev)
- `http://localhost:7001`
- `http://127.0.0.1:9000`

Sendet `Access-Control-Allow-Private-Network: true` auf Preflight-Request
(Chrome 123+ Private-Network-Access-Rule, sonst wird der Call von der
HTTPS-Page zu 127.0.0.1 geblockt).

**Mixed-Content:** Browser (Chrome, Safari 14+, Firefox) behandeln
`http://127.0.0.1` als "potentially trustworthy origin" und erlauben den
HTTP-Call von `https://admin.vod-auctions.com`. Spec: Secure Contexts W3C.

## Security

**Bridge ist nicht authentifiziert.** Annahme:
- Bind nur auf `127.0.0.1` → keine externen Requests möglich
- Wer `127.0.0.1:17891` aufruft, darf drucken (gleicher User-Kontext)
- CORS filtert Browser-Origins, nicht lokale Prozesse (aber das ist egal,
  lokale Prozesse können lp direkt aufrufen)

**Max-Payload:** 10 MB hard-cap pro Job (verhindert trivial DoS).

## Troubleshooting

### Bridge antwortet nicht auf 127.0.0.1:17891

```bash
# 1. Läuft LaunchAgent?
launchctl print gui/$(id -u)/com.vod-auctions.print-bridge

# 2. Logs anschauen
tail -f ~/Library/Logs/vod-print-bridge.log

# 3. Reinstall
bash frank-macbook-setup/print-bridge/install-bridge.sh --uninstall
bash frank-macbook-setup/print-bridge/install-bridge.sh
```

### Bridge läuft, aber findet Drucker nicht

```bash
# Welche CUPS-Queues existieren?
lpstat -e

# Fuzzy-Match greift auf "brother" + "ql" oder "ql82". Wenn Queue anders
# heißt: explizit via Installer setzen:
bash install-bridge.sh --printer "DeinQueueName"
```

### Admin-UI zeigt "Browser Print" statt "Silent Print"

Das bedeutet: Bridge-Health-Check ist fehlgeschlagen (Bridge offline oder
`printer_found=false`). Im Browser Cmd+Option+C → Konsole:

```js
await fetch("http://127.0.0.1:17891/health").then(r => r.json())
```

Wenn der Fetch fehlschlägt mit `net::ERR_FAILED`:
- Chrome: Private-Network-Access blockiert? Bridge sendet PNA-Header nur
  auf OPTIONS-Preflight; ein normaler GET sollte durchgehen. Prüfe
  `chrome://flags/#private-network-access-*`.
- Safari: Bridge wirklich auf Port 17891 gebunden? `lsof -i :17891`

### lp-Fehler "No such file or directory"

Bridge ruft `lp` via `subprocess`. Wenn `PATH` im LaunchAgent kaputt ist
(von außen überschrieben), wird `lp` nicht gefunden. Fix in plist sollte
`/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin` enthalten
(ist Default im Template).

### Fehler "payload is not a PDF"

Body beginnt nicht mit `%PDF`. Mögliche Ursachen:
- Content-Type falsch (base64 als `application/pdf` gesendet oder
  umgekehrt)
- Admin-Endpoint `/admin/erp/inventory/items/:id/label` hat Fehler
  zurückgegeben (HTML statt PDF) — Status-Code im Admin prüfen

## Entwicklung / Tests

### Manuell starten (ohne LaunchAgent)

```bash
cd frank-macbook-setup/print-bridge
VOD_PRINT_BRIDGE_DRY_RUN=1 /usr/bin/python3 vod_print_bridge.py
```

### Dev-Workflow bei Code-Änderung

```bash
# Script editieren im Repo
vim vod_print_bridge.py

# Reinstall kopiert die neue Version nach ~/.local/lib/ und reloadet den Agent
bash install-bridge.sh --dry-run
```

### Multi-Mac Rollout

Idempotent: einfach auf jedem Mac `bash install.sh` laufen lassen. Das
Script erkennt altes QZ Tray und entfernt es automatisch (Step 3a).

| Mac | Installer-Aufruf |
|---|---|
| Franks MacBook Air (Produktion) | `bash install.sh` |
| Franks Mac Studio (Produktion) | `bash install.sh` |
| Robins MacBook (Dev/Test) | `bash install-bridge.sh --dry-run` |

### Logs rotieren

`launchd` rotiert die Log-Datei nicht automatisch. Bei langfristigem
Einsatz:

```bash
# Einmalig: Logrotate via cron
echo "0 3 * * * /usr/bin/truncate -s 0 ~/Library/Logs/vod-print-bridge.log" \
  | crontab -
```

## Architektur-Details

### Warum Python stdlib, nicht Node/Go?

- `/usr/bin/python3` ist ab macOS 12.3 als User-Python dabei, macOS 13+ über
  Xcode Command Line Tools. Keine pip-Installation nötig.
- Pure stdlib → kein `pip install`, kein venv, kein Abhängigkeits-Drift.
  Memory-Eintrag `feedback_pure_stdlib_over_deps.md`: pure stdlib ist auf
  macOS die robusteste Wahl für Install-Kits.
- Code ist ~250 Zeilen, komplett audit-bar.

### Warum nicht brother_ql / Raster direkt?

ChatGPT-Empfehlung im ursprünglichen Vorschlag war `brother_ql` für
Direct-Raster. Haben wir verworfen:
- CUPS+Brother-PPD ist am 2026-04-11 hardware-validiert mit v6-Layout
  (25 Test-Drucke bis zum funktionierenden Setup)
- brother_ql würde bedeuten: PDF→Raster-Pipeline von Grund auf neu bauen
- CUPS kriegt Status-Feedback (cover_open, out_of_media) über IPP, was
  brother_ql nicht macht

### LaunchAgent statt Daemon?

- User-Scope: kein sudo, weniger Rollout-Komplexität
- Bindet auf 127.0.0.1 → keine System-weiten Privilegien nötig
- `KeepAlive=Crashed` → Bridge restartet bei Crash, nicht bei sauberem Exit
- `ThrottleInterval=10s` → verhindert Crash-Loop

### Port 17891?

Willkürlich gewählt aus dem "registered"-Bereich (1024-49151), frei in
IANA-Liste, nicht in `/etc/services` oder `launchctl list`-Konflikten bei
macOS-Standard-Services. Kann via `VOD_PRINT_BRIDGE_PORT` env-var
überschrieben werden, dann aber auch im Admin-Client
(`backend/src/admin/lib/print-client.ts` → `BRIDGE_URL`) updaten.

## Siehe auch

- [`../../docs/hardware/BROTHER_QL_820NWB_SETUP.md`](../../docs/hardware/BROTHER_QL_820NWB_SETUP.md) — Hardware-Config (Raster-Mode, CUPS `Custom.29x90mm`)
- [`../install.sh`](../install.sh) — Master-Installer (ruft `install-bridge.sh` auf)
- [`../../backend/src/admin/lib/print-client.ts`](../../backend/src/admin/lib/print-client.ts) — Admin-UI Client
