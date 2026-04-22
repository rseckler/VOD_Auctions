#!/usr/bin/env bash
# VOD Print Bridge — Installer (idempotent, user-scope)
#
# Installiert:
#   ~/.local/lib/vod-print-bridge/vod_print_bridge.py   (Python-Script)
#   ~/Library/LaunchAgents/com.vod-auctions.print-bridge.plist
#   ~/Library/Logs/vod-print-bridge.log                 (wird beim Start erstellt)
#
# Lädt den LaunchAgent für den aktuellen User — kein sudo nötig.
# Läuft beim Boot + restartet automatisch bei Crash.
#
# Usage:
#   bash install-bridge.sh                    # default printer = Brother_QL_820NWB
#   bash install-bridge.sh --printer "X"      # override queue name
#   bash install-bridge.sh --dry-run          # Test-Mode: kein echter Druck
#   bash install-bridge.sh --uninstall        # LaunchAgent entladen + löschen

set -u
set -o pipefail

BOLD=$(tput bold 2>/dev/null || echo "")
RED=$(tput setaf 1 2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
YELLOW=$(tput setaf 3 2>/dev/null || echo "")
BLUE=$(tput setaf 4 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")

step() { echo; echo "${BOLD}${BLUE}==> $*${RESET}"; }
ok()   { echo "${GREEN}✓${RESET} $*"; }
warn() { echo "${YELLOW}⚠${RESET} $*"; }
err()  { echo "${RED}✗${RESET} $*" >&2; }

BRIDGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/lib/vod-print-bridge"
PLIST_PATH="$HOME/Library/LaunchAgents/com.vod-auctions.print-bridge.plist"
LOG_DIR="$HOME/Library/Logs"
LOG_PATH="$LOG_DIR/vod-print-bridge.log"
LABEL="com.vod-auctions.print-bridge"

PRINTER_QUEUE="${VOD_PRINT_BRIDGE_PRINTER:-Brother_QL_820NWB}"
DRY_RUN="0"
MODE="install"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --printer)   PRINTER_QUEUE="$2"; shift 2 ;;
    --dry-run)   DRY_RUN="1"; shift ;;
    --uninstall) MODE="uninstall"; shift ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *) err "Unbekannte Option: $1"; exit 2 ;;
  esac
done

uid="$(id -u)"
domain="gui/${uid}"

unload_agent() {
  if launchctl print "${domain}/${LABEL}" >/dev/null 2>&1; then
    launchctl bootout "${domain}/${LABEL}" 2>/dev/null || true
    ok "LaunchAgent entladen"
  fi
}

uninstall_all() {
  step "Uninstall: VOD Print Bridge"
  unload_agent
  rm -f "$PLIST_PATH" && ok "plist entfernt: $PLIST_PATH" || true
  if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR" && ok "Script entfernt: $INSTALL_DIR"
  fi
  warn "Log bleibt zur Nachanalyse erhalten: $LOG_PATH"
  echo
  ok "VOD Print Bridge entfernt."
}

if [[ "$MODE" == "uninstall" ]]; then
  uninstall_all
  exit 0
fi

# ─── Install ──────────────────────────────────────────────────────────────

step "Installation: VOD Print Bridge"

# 1. Python-Check (macOS hat /usr/bin/python3 ab 12.3 default, ab 13 per Xcode CLT)
if [[ ! -x /usr/bin/python3 ]]; then
  err "/usr/bin/python3 fehlt. Bitte 'xcode-select --install' ausführen."
  exit 1
fi
PYVER=$(/usr/bin/python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "?")
ok "Python vorhanden: /usr/bin/python3 (Version $PYVER)"

# 2. Script installieren
mkdir -p "$INSTALL_DIR"
cp "$BRIDGE_DIR/vod_print_bridge.py" "$INSTALL_DIR/vod_print_bridge.py"
chmod 0755 "$INSTALL_DIR/vod_print_bridge.py"
ok "Bridge-Script installiert: $INSTALL_DIR/vod_print_bridge.py"

# 3. Log-Verzeichnis
mkdir -p "$LOG_DIR"

# 4. plist rendern (Substitutionen — sed statt heredoc, damit Pfade mit Leerzeichen
#    sauber escaped werden können)
tmp_plist="$(mktemp)"
sed -e "s|__BRIDGE_SCRIPT__|$INSTALL_DIR/vod_print_bridge.py|g" \
    -e "s|__PRINTER_QUEUE__|$PRINTER_QUEUE|g" \
    -e "s|__DRY_RUN__|$DRY_RUN|g" \
    -e "s|__LOG_PATH__|$LOG_PATH|g" \
    "$BRIDGE_DIR/com.vod-auctions.print-bridge.plist.template" > "$tmp_plist"

# Validieren bevor wir schreiben
if ! plutil -lint "$tmp_plist" >/dev/null 2>&1; then
  err "plist-Validierung fehlgeschlagen. Template defekt?"
  plutil -lint "$tmp_plist"
  rm -f "$tmp_plist"
  exit 1
fi

mv "$tmp_plist" "$PLIST_PATH"
ok "LaunchAgent plist: $PLIST_PATH"
ok "Drucker-Queue: $PRINTER_QUEUE"
[[ "$DRY_RUN" == "1" ]] && warn "DRY_RUN aktiv — kein echter Druck (Test-Modus)"

# 5. LaunchAgent (neu)laden
step "LaunchAgent (neu)laden"
unload_agent
if launchctl bootstrap "$domain" "$PLIST_PATH"; then
  ok "Agent geladen"
else
  err "launchctl bootstrap fehlgeschlagen. Ist der User eingeloggt (nicht via SSH-root)?"
  exit 1
fi
launchctl enable "${domain}/${LABEL}" 2>/dev/null || true

# 6. Kick the service (kickstart ist idempotent)
launchctl kickstart -k "${domain}/${LABEL}" 2>/dev/null || true
sleep 1

# 7. Health-Check — wartet bis zu 15s auf ersten Start
step "Health-Check (bis zu 15s)"
health=""
for i in $(seq 1 30); do
  if response=$(curl -s --max-time 1 "http://127.0.0.1:17891/health" 2>/dev/null); then
    if echo "$response" | grep -qE '"ok"[[:space:]]*:[[:space:]]*true'; then
      health="$response"
      break
    fi
  fi
  sleep 0.5
done
if [[ -n "$health" ]]; then
  ok "Bridge antwortet: $health"
else
  err "Bridge antwortet nicht auf http://127.0.0.1:17891/health nach 15s"
  err "Logs: tail -f $LOG_PATH"
  err "Status: launchctl print ${domain}/${LABEL}"
  exit 1
fi

# 8. Summary
echo
ok "VOD Print Bridge läuft."
echo
echo "  Port:         17891 (nur 127.0.0.1)"
echo "  Drucker:      $PRINTER_QUEUE"
echo "  Script:       $INSTALL_DIR/vod_print_bridge.py"
echo "  LaunchAgent:  $PLIST_PATH"
echo "  Logs:         tail -f $LOG_PATH"
echo
echo "Test-Druck (liest PDF von stdin):"
echo "  curl -s -X POST http://127.0.0.1:17891/print \\"
echo "    -H 'Content-Type: application/pdf' \\"
echo "    --data-binary @/pfad/zum/label.pdf"
echo
echo "Uninstall:"
echo "  bash $BRIDGE_DIR/install-bridge.sh --uninstall"
