#!/usr/bin/env bash
# Sanity-Check: Verifiziert dass alle Komponenten installiert/konfiguriert sind.
# Nicht-destruktiv, nur Reads.

set -u
set -o pipefail

BOLD=$(tput bold 2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
RED=$(tput setaf 1 2>/dev/null || echo "")
YELLOW=$(tput setaf 3 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")

pass() { echo "${GREEN}✓${RESET} $*"; }
fail() { echo "${RED}✗${RESET} $*"; }
warn() { echo "${YELLOW}⚠${RESET} $*"; }

export LC_ALL=C  # stabilisiert awk/tr/grep gegen Locale-Quirks

echo "${BOLD}=== VOD Setup-Verifikation ===${RESET}"
echo

# 1. macOS
echo "${BOLD}System:${RESET}"
pass "macOS $(sw_vers -productVersion) / $(uname -m)"

# 2. Homebrew
if command -v brew >/dev/null; then
  pass "Homebrew $(brew --version | head -1 | awk '{print $2}')"
else
  fail "Homebrew fehlt"
fi

# 3. Brother-Queue
echo
echo "${BOLD}Drucker:${RESET}"
QUEUE=$(lpstat -p 2>/dev/null | awk '/[Bb]rother/ && /820/ {print $2; exit}' | tr -d '„"“”')
if [[ -n "${QUEUE:-}" ]]; then
  pass "Queue gefunden: $QUEUE"
  STATE=$(lpstat -p "$QUEUE" 2>/dev/null | head -1)
  echo "    $STATE"
else
  fail "Keine Brother-QL-820-Queue gefunden"
fi

# 4. PPD existiert
if [[ -f "/etc/cups/ppd/${QUEUE:-Brother_QL_820NWB}.ppd" ]]; then
  pass "PPD installiert"
else
  warn "PPD-File nicht gefunden an /etc/cups/ppd/ — evtl. anderer Queue-Name"
fi

# 5. PageSize = Custom.29x90mm?
if [[ -n "${QUEUE:-}" ]]; then
  CURRENT=$(lpoptions -p "$QUEUE" 2>/dev/null | tr ' ' '\n' | grep '^PageSize=' | cut -d= -f2)
  if [[ "$CURRENT" == "Custom.29x90mm" ]]; then
    pass "PageSize: Custom.29x90mm"
  elif [[ -n "${CURRENT:-}" ]]; then
    fail "PageSize: '$CURRENT' (erwartet: Custom.29x90mm)"
    echo "    Fix: lpoptions -p $QUEUE -o PageSize=Custom.29x90mm"
  else
    warn "PageSize ist nicht gesetzt (Default wird genutzt). Fix siehe oben."
  fi
fi

# 6. VOD Print Bridge (ersetzt QZ Tray)
echo
echo "${BOLD}VOD Print Bridge:${RESET}"
PLIST="$HOME/Library/LaunchAgents/com.vod-auctions.print-bridge.plist"
if [[ -f "$PLIST" ]]; then
  pass "LaunchAgent plist vorhanden"
  if launchctl print "gui/$(id -u)/com.vod-auctions.print-bridge" >/dev/null 2>&1; then
    pass "LaunchAgent geladen"
  else
    warn "plist liegt, aber Agent nicht geladen. Fix: launchctl bootstrap gui/\$(id -u) \"$PLIST\""
  fi
else
  fail "LaunchAgent nicht installiert"
  echo "    Fix: bash frank-macbook-setup/print-bridge/install-bridge.sh"
fi

# Health-Endpoint
HEALTH=$(curl -s --max-time 2 http://127.0.0.1:17891/health 2>/dev/null || echo "")
if [[ -n "$HEALTH" ]] && echo "$HEALTH" | grep -qE '"ok"[[:space:]]*:[[:space:]]*true'; then
  pass "Bridge antwortet auf 127.0.0.1:17891"
  PRINTER_FOUND=$(echo "$HEALTH" | grep -o '"printer_found":[^,}]*' | cut -d: -f2)
  DRY=$(echo "$HEALTH" | grep -o '"dry_run":[^,}]*' | cut -d: -f2)
  if [[ "$PRINTER_FOUND" == "true" ]]; then
    pass "Bridge hat CUPS-Drucker gefunden"
  else
    warn "Bridge läuft, aber kein passender Drucker (fuzzy-match 'brother ql' leer)"
  fi
  if [[ "$DRY" == "true" ]]; then
    warn "Bridge im DRY_RUN — echter Druck deaktiviert. Re-Install ohne --dry-run wenn Drucker da ist."
  fi
else
  fail "Bridge antwortet nicht auf 127.0.0.1:17891"
  echo "    Logs: tail -f ~/Library/Logs/vod-print-bridge.log"
fi

# Alte QZ Tray Reste?
if [[ -d "/Applications/QZ Tray.app" ]] || pgrep -qx "QZ Tray" 2>/dev/null; then
  warn "Altes QZ Tray noch installiert — sollte beim nächsten install.sh-Lauf entfernt werden"
fi

# 7. Admin erreichbar
echo
echo "${BOLD}Netzwerk:${RESET}"
if curl -s -o /dev/null -m 5 -w "%{http_code}" https://admin.vod-auctions.com/ | grep -qE "^(200|301|302|401|403)$"; then
  pass "admin.vod-auctions.com erreichbar"
else
  fail "admin.vod-auctions.com nicht erreichbar — WLAN? VPS down?"
fi

# 8. Drucker-Web-Interface
if [[ -n "${QUEUE:-}" ]]; then
  URI=$(lpstat -v "$QUEUE" 2>/dev/null | grep -oE 'ipp://[^ ]*' | head -1)
  if [[ -n "$URI" ]]; then
    pass "Drucker-URI: $URI"
  fi
fi

# 9. Scanner (keine direkte Prüfung — USB HID, zeigt sich erst bei Scan)
echo
echo "${BOLD}Scanner:${RESET}"
if system_profiler SPUSBDataType 2>/dev/null | grep -qiE "inateck|barcode|hid"; then
  pass "USB-HID-Gerät angeschlossen (wahrscheinlich Scanner)"
else
  warn "Kein offensichtliches HID-Barcode-Gerät im USB-Stack"
  echo "    Manueller Test: TextEdit öffnen, Barcode scannen → muss Text ergeben"
fi

echo
echo "${BOLD}=== Fertig ===${RESET}"
echo "Bei ${RED}✗${RESET} siehe docs/TROUBLESHOOTING.md"
