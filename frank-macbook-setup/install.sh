#!/usr/bin/env bash
# Frank's MacBook — Master-Installer
# Ausführung: bash install.sh
# Idempotent — kann bei Fehlern beliebig oft neu gestartet werden.

set -u
set -o pipefail

BOLD=$(tput bold 2>/dev/null || echo "")
RED=$(tput setaf 1 2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
YELLOW=$(tput setaf 3 2>/dev/null || echo "")
BLUE=$(tput setaf 4 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")

step() { echo; echo "${BOLD}${BLUE}==> $*${RESET}"; }
ok() { echo "${GREEN}✓${RESET} $*"; }
warn() { echo "${YELLOW}⚠${RESET} $*"; }
err() { echo "${RED}✗${RESET} $*" >&2; }
ask() { read -r -p "${BOLD}? $* ${RESET}" "$2"; }

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRINTER_QUEUE="Brother_QL_820NWB"
ADMIN_URL="https://admin.vod-auctions.com"

echo "${BOLD}Frank's MacBook — Install Kit${RESET}"
echo "Kit-Pfad: $KIT_DIR"
echo

# ---------------------------------------------------------------------------
# 1. System-Check
# ---------------------------------------------------------------------------
step "1/7  System-Check"

MACOS_VERSION=$(sw_vers -productVersion)
MAJOR=${MACOS_VERSION%%.*}
if [[ $MAJOR -lt 12 ]]; then
  warn "macOS $MACOS_VERSION — empfohlen ist 12 (Monterey) oder neuer."
  warn "Installation kann weiterlaufen, aber Brother-Treiber-Support nicht garantiert."
else
  ok "macOS $MACOS_VERSION"
fi

ARCH=$(uname -m)
case "$ARCH" in
  arm64)  ok "Architektur: $ARCH (Apple Silicon — MacBook Air M5 / M-Serie)" ;;
  x86_64) ok "Architektur: $ARCH (Intel — z.B. MacBook Pro A2141)" ;;
  *)      warn "Architektur: $ARCH — ungewöhnlich. Setup läuft weiter, aber Brother-Treiber evtl. nicht verfügbar." ;;
esac

if ! command -v brew >/dev/null 2>&1; then
  err "Homebrew nicht gefunden. Installiere zuerst:"
  echo '    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  exit 1
fi
ok "Homebrew: $(brew --version | head -1)"

# ---------------------------------------------------------------------------
# 2. Brother-Treiber Check
# ---------------------------------------------------------------------------
step "2/7  Brother-Treiber"

if [[ -f "/Library/Printers/PPDs/Contents/Resources/Brother QL-820NWB CUPS.gz" ]] || \
   [[ -f "/etc/cups/ppd/${PRINTER_QUEUE}.ppd" ]] || \
   lpstat -p 2>/dev/null | grep -qi brother; then
  ok "Brother-Treiber / Druckqueue gefunden"
else
  warn "Brother-Treiber fehlt. Bitte manuell installieren:"
  echo "    1) https://support.brother.com/ öffnet jetzt im Safari"
  echo "    2) QL-820NWB → Downloads → macOS → Full Driver & Software Package"
  echo "    3) .pkg ausführen, Admin-Passwort, durchklicken"
  echo "    4) Dann Drucker aus/an und dieses Script NEU starten"
  ask "[Enter] öffnet Brother-Download-Seite, dann Exit..." _
  open "https://support.brother.com/g/b/downloadlist.aspx?c=eu_ot&lang=en&prod=lpql820nwbeas&os=10064"
  exit 0
fi

# Druckqueue-Name normalisieren (Brother installiert manchmal mit Leerzeichen)
ACTUAL_QUEUE=$(LC_ALL=C lpstat -p 2>/dev/null | awk '/[Bb]rother/ && /820/ {print $2; exit}' | tr -d '„"“”')
if [[ -n "${ACTUAL_QUEUE:-}" && "$ACTUAL_QUEUE" != "$PRINTER_QUEUE" ]]; then
  warn "Druckqueue heißt '$ACTUAL_QUEUE' (nicht '$PRINTER_QUEUE')."
  warn "Das Setup klappt trotzdem — aber in Scripts überall '$ACTUAL_QUEUE' verwenden."
  PRINTER_QUEUE="$ACTUAL_QUEUE"
fi
ok "Drucker-Queue: $PRINTER_QUEUE"

# ---------------------------------------------------------------------------
# 3. QZ Tray installieren (Silent-Print-Daemon)
# ---------------------------------------------------------------------------
step "3/7  QZ Tray (Silent-Print)"

if [[ -d "/Applications/QZ Tray.app" ]]; then
  ok "QZ Tray bereits installiert"
else
  echo "    Installiere QZ Tray via Homebrew Cask…"
  if brew install --cask qz-tray; then
    ok "QZ Tray installiert"
  else
    warn "Homebrew-Install fehlgeschlagen. Lade manuell von https://qz.io/download/"
    warn "Alternativ: Inventur läuft auch mit Browser-Print-Fallback (Cmd+P nach jedem Verify)."
  fi
fi

if [[ -d "/Applications/QZ Tray.app" ]]; then
  if ! pgrep -f "QZ Tray" >/dev/null 2>&1; then
    open "/Applications/QZ Tray.app" 2>/dev/null || true
    sleep 2
  fi
  # Autostart: macOS Login Item setzen
  osascript -e 'tell application "System Events" to if not (exists (login item "QZ Tray")) then make login item at end with properties {path:"/Applications/QZ Tray.app", hidden:true}' 2>/dev/null \
    && ok "QZ Tray Autostart eingerichtet" || warn "Autostart konnte nicht gesetzt werden (kein Showstopper)"
fi

# ---------------------------------------------------------------------------
# 4. CUPS PageSize setzen (Custom.29x90mm)
# ---------------------------------------------------------------------------
step "4/7  CUPS PageSize (Custom.29x90mm)"

CURRENT_PAGESIZE=$(lpoptions -p "$PRINTER_QUEUE" 2>/dev/null | tr ' ' '\n' | grep '^PageSize=' | cut -d= -f2 || true)
if [[ "$CURRENT_PAGESIZE" == "Custom.29x90mm" ]]; then
  ok "PageSize bereits Custom.29x90mm"
else
  if lpoptions -p "$PRINTER_QUEUE" -o PageSize=Custom.29x90mm; then
    ok "PageSize gesetzt: Custom.29x90mm (war: ${CURRENT_PAGESIZE:-unset})"
  else
    err "lpoptions hat versagt. Läuft cupsd? Queue richtig?"
  fi
fi

# ---------------------------------------------------------------------------
# 5. Drucker Raster-Mode (MANUELL via Web-Interface)
# ---------------------------------------------------------------------------
step "5/7  Drucker auf Raster-Mode umstellen (MANUELL)"

echo "    Der Drucker muss im ${BOLD}Raster${RESET}-Mode laufen (nicht P-touch Template)."
echo "    Das geht nur übers Web-Interface des Druckers selbst."
echo
ask "Drucker-IP-Adresse (vom LCD-Display ablesen, Menü → WLAN → Info), oder Enter für Bonjour:" PRINTER_IP

if [[ -z "${PRINTER_IP:-}" ]]; then
  PRINTER_IP=$(dns-sd -B _http._tcp local 2>/dev/null | grep -i brother | head -1 | awk '{print $NF}' || true)
  [[ -n "${PRINTER_IP:-}" ]] && echo "    Bonjour gefunden: $PRINTER_IP"
fi

if [[ -n "${PRINTER_IP:-}" ]]; then
  # Verifikation mit curl
  if curl -sk -m 5 "https://$PRINTER_IP/" >/dev/null 2>&1; then
    ok "Drucker erreichbar unter https://$PRINTER_IP/"

    echo "    Öffne jetzt die Anleitung zur Umstellung:"
    echo "      → $KIT_DIR/docs/PRINTER_WEB_CONFIG.md"
    echo
    echo "    Kurzfassung:"
    echo "      1. Browser: https://$PRINTER_IP/"
    echo "      2. 'Open Secure Login' → Passwort steht auf Drucker-Rückseite ('Pwd: xxxxxxxx')"
    echo "      3. Printer Settings → Device Settings"
    echo "      4. Command Mode: P-touch Template → ${BOLD}Raster${RESET}"
    echo "      5. Ganz unten: Submit"
    echo "      6. Drucker aus/an"
    echo
    ask "Web-Interface jetzt im Browser öffnen? [y/N]:" OPEN_WEB
    if [[ "${OPEN_WEB:-N}" =~ ^[Yy]$ ]]; then
      open "https://$PRINTER_IP/"
      open "$KIT_DIR/docs/PRINTER_WEB_CONFIG.md"
    fi
    echo
    ask "Fertig mit Raster-Umstellung und Drucker-Neustart? [Enter zum Weiter]" _
  else
    warn "Drucker unter https://$PRINTER_IP/ nicht erreichbar."
    warn "WLAN-Setup nachholen am Drucker-Display (Menu → WLAN)."
    warn "Dann Script nochmal starten."
  fi
else
  warn "Keine Drucker-IP. WLAN-Setup am Drucker nachholen, dann Script erneut."
fi

# ---------------------------------------------------------------------------
# 6. Safari Web-App für Admin
# ---------------------------------------------------------------------------
step "6/7  Admin-Launcher"

echo "    Safari 17+ kann Websites als eigenständige Apps ins Dock legen."
echo "    1) Safari öffnet sich jetzt mit $ADMIN_URL"
echo "    2) Menü: Datei → 'Zum Dock hinzufügen…' (Safari ≥17) oder 'Ablage → Als App sichern'"
echo "    3) Name: 'VOD Admin', Symbol OK"
echo
ask "[Enter] öffnet Admin im Safari…" _
open -a Safari "$ADMIN_URL"

# ---------------------------------------------------------------------------
# 7. Test-Print
# ---------------------------------------------------------------------------
step "7/7  Test-Label drucken"

ask "Jetzt ein Test-Label drucken? [Y/n]:" DO_PRINT
if [[ ! "${DO_PRINT:-Y}" =~ ^[Nn]$ ]]; then
  bash "$KIT_DIR/test-print.sh" || warn "Test-Print fehlgeschlagen — siehe oben."
fi

# ---------------------------------------------------------------------------
# Finale
# ---------------------------------------------------------------------------
echo
echo "${BOLD}${GREEN}=== Installation abgeschlossen ===${RESET}"
echo
echo "Nächste Schritte:"
echo "  1) Scanner konfigurieren: ${BOLD}$KIT_DIR/scanner/SCANNER_SETUP.md${RESET}"
echo "  2) In Admin einloggen: $ADMIN_URL"
echo "     User: frank@vod-records.com (Passwort mündlich)"
echo "  3) Franks Anleitung übergeben: $KIT_DIR/ANLEITUNG_FRANK.md"
echo
echo "Bei Problemen: ${BOLD}$KIT_DIR/docs/TROUBLESHOOTING.md${RESET}"
