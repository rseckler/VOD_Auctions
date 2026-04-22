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
VENV_DIR="$INSTALL_DIR/venv"
PLIST_PATH="$HOME/Library/LaunchAgents/com.vod-auctions.print-bridge.plist"
LOG_DIR="$HOME/Library/Logs"
LOG_PATH="$LOG_DIR/vod-print-bridge.log"
LABEL="com.vod-auctions.print-bridge"

PRINTER_QUEUE="${VOD_PRINT_BRIDGE_PRINTER:-Brother_QL_820NWB}"
PRINTER_IP="${VOD_PRINT_BRIDGE_PRINTER_IP:-}"
PRINTER_MODEL="${VOD_PRINT_BRIDGE_MODEL:-QL-820NWB}"
LABEL_TYPE="${VOD_PRINT_BRIDGE_LABEL:-29}"
BACKEND="${VOD_PRINT_BRIDGE_BACKEND:-brother_ql}"   # NEW: default brother_ql
DRY_RUN="0"
MODE="install"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --printer)      PRINTER_QUEUE="$2"; shift 2 ;;
    --printer-ip)   PRINTER_IP="$2"; shift 2 ;;
    --backend)      BACKEND="$2"; shift 2 ;;
    --label)        LABEL_TYPE="$2"; shift 2 ;;
    --model)        PRINTER_MODEL="$2"; shift 2 ;;
    --dry-run)      DRY_RUN="1"; shift ;;
    --uninstall)    MODE="uninstall"; shift ;;
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

# 3-venv. Python venv + pip install brother_ql Pillow pypdfium2 (für brother_ql-Backend)
#
# Diese Libraries sind der Grund warum wir CUPS umgehen können:
#   - pypdfium2: pure-Python PDF-Renderer (MIT, keine Poppler-System-Dep)
#   - Pillow:    Image-Manipulation (crop/resize vor Brother-Raster)
#   - brother_ql: Brother Raster-Protokoll + TCP-Send (Community-Standard
#                 für Brother QL-Serie, ~2500 GitHub-Stars)
#
# venv lokal im Install-Dir — macht pip install safe (kein sudo, keine
# System-Python-Pollution). LaunchAgent nutzt dann das venv-python.
PYTHON_BIN="/usr/bin/python3"    # default bei cups-backend
if [[ "$BACKEND" == "brother_ql" ]]; then
  step "Python venv + brother_ql installieren"
  if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    /usr/bin/python3 -m venv "$VENV_DIR" || { err "venv-Erzeugung fehlgeschlagen"; exit 1; }
    ok "venv erstellt: $VENV_DIR"
  else
    ok "venv existiert bereits"
  fi

  # pip update + install. --quiet hält die Ausgabe lesbar.
  # Versionen gepinnt auf bekannt-gute Stände (Stand 2026-04-22):
  #   brother_ql 0.9.4 ist die letzte stabile 0.9-Reihe mit QL-820NWB-Support
  #   Pillow 10.x ist Python-3.9-kompatibel
  #   pypdfium2 4.x rendert PDF-1.4 (unsere Labels)
  echo "    pip upgrade + brother_ql Pillow pypdfium2 installieren..."
  "$VENV_DIR/bin/pip" install --quiet --upgrade pip 2>&1 | tail -3
  if "$VENV_DIR/bin/pip" install --quiet "brother_ql==0.9.4" "Pillow>=10.0" "pypdfium2>=4.0"; then
    ok "brother_ql + Pillow + pypdfium2 installiert"
  else
    warn "pip install teilweise fehlgeschlagen — Bridge läuft trotzdem, brother_ql-Backend aber ggf. defekt"
  fi
  PYTHON_BIN="$VENV_DIR/bin/python"
else
  warn "Backend=cups (legacy) — brother_ql venv wird übersprungen"
fi

# 3a. mkcert installieren (via Homebrew) + local CA ins System-Keychain setzen.
# Safari blockiert fetch() von https://admin.vod-auctions.com nach http://127.0.0.1
# als Mixed Content — selbst für Loopback. Wir brauchen also HTTPS auf der Bridge
# mit einem Cert, dem der Browser vertraut. mkcert macht genau das: eine private
# Root-CA ins System-Keychain, und davon signierte Certs für 127.0.0.1 / localhost.
CERT_PATH="$INSTALL_DIR/cert.pem"
KEY_PATH="$INSTALL_DIR/key.pem"
MKCERT_OK=0

step "HTTPS-Cert provisionieren (mkcert)"
if command -v mkcert >/dev/null 2>&1; then
  ok "mkcert vorhanden ($(mkcert -version 2>/dev/null || echo '?'))"
else
  if ! command -v brew >/dev/null 2>&1; then
    warn "Homebrew fehlt — mkcert kann nicht installiert werden. Bridge läuft auf HTTP."
    warn "Safari kann Bridge dann nicht aus Admin-UI erreichen (Mixed Content)."
    warn "Fix: brew installieren → dieses Script neu starten."
  else
    echo "    brew install mkcert (dauert ~30s beim ersten Mal)..."
    if brew install mkcert >/dev/null 2>&1; then
      ok "mkcert via brew installiert"
    else
      warn "brew install mkcert fehlgeschlagen — bitte manuell: brew install mkcert"
    fi
  fi
fi

if command -v mkcert >/dev/null 2>&1; then
  # Root-CA ins System-Keychain. Einmalig sudo-Prompt, idempotent.
  # Wenn das hier fehlschlägt (z.B. non-interactive TTY), generieren wir
  # trotzdem ein Cert — Bridge läuft dann HTTPS, nur der Browser vertraut
  # dem Cert noch nicht. Für Frank muss -install klappen (sudo-GUI-Prompt
  # erscheint interaktiv), sonst zeigt Safari "Ungültiges Zertifikat".
  CA_TRUSTED=0
  if security find-certificate -c "mkcert" /Library/Keychains/System.keychain >/dev/null 2>&1; then
    ok "Lokale Root-CA bereits im System-Keychain"
    CA_TRUSTED=1
  else
    echo "    Installiere lokale Root-CA ins System-Keychain (einmalig, sudo-Passwort gleich)..."
    if mkcert -install 2>&1 | sed 's/^/    /'; then
      ok "Lokale Root-CA installiert (System + Browser vertrauen jetzt den Bridge-Certs)"
      CA_TRUSTED=1
    else
      warn "mkcert -install fehlgeschlagen (evtl. kein TTY für sudo-Prompt)."
      warn "Bridge läuft trotzdem HTTPS, aber Safari sieht 'Ungültiges Zertifikat' bis CA trusted ist."
      warn "Manuell nachholen: mkcert -install  (dann Admin-Passwort)"
    fi
  fi

  # Cert für Bridge generieren. Regeneriert jedes Mal (billig, keine Ablauf-Probleme).
  # SANs: 127.0.0.1 + localhost damit Client fetch zu beiden Hostnamen klappt.
  if mkcert -cert-file "$CERT_PATH" -key-file "$KEY_PATH" 127.0.0.1 localhost >/dev/null 2>&1; then
    chmod 600 "$KEY_PATH"
    ok "Bridge-Cert: $CERT_PATH (SAN: 127.0.0.1, localhost)"
    MKCERT_OK=1
    [[ "$CA_TRUSTED" == "1" ]] && ok "Cert ist vom System vertraut — Admin-UI wird grün" \
      || warn "Cert noch nicht vom System vertraut — mkcert -install nachholen"
  else
    warn "mkcert Cert-Generierung fehlgeschlagen — HTTP-Fallback"
  fi
fi

if [[ "$MKCERT_OK" != "1" ]]; then
  # HTTP-Fallback: Env-Vars leer, Python bridge merkt's und serviert HTTP
  CERT_PATH=""
  KEY_PATH=""
fi

# 3c. Drucker-IP für brother_ql-Backend (TCP-Direct-Send).
#     Autodetect via Bonjour mdns, falls nicht via Flag/ENV gesetzt.
if [[ "$BACKEND" == "brother_ql" && -z "$PRINTER_IP" && "$DRY_RUN" != "1" ]]; then
  step "Drucker-IP via Bonjour suchen"
  # dns-sd läuft timeout-frei → mit timeout wrapper
  PRINTER_IP=$(timeout 4 dns-sd -B _pdl-datastream._tcp local. 2>/dev/null | awk '/Brother/ {print $NF; exit}' || echo "")
  if [[ -z "$PRINTER_IP" ]]; then
    # Alternativ: Brother QL hostname auflösen
    PRINTER_IP=$(timeout 3 dns-sd -G v4 Brother.local 2>/dev/null | awk '/Brother\.local\./ && /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/ {print $(NF-1); exit}' || echo "")
  fi
  if [[ -n "$PRINTER_IP" ]]; then
    ok "Drucker-IP gefunden (Bonjour): $PRINTER_IP"
  else
    warn "Bonjour-Autodetect fehlgeschlagen. Bitte IP vom Drucker-LCD ablesen:"
    warn "  Menü → WLAN → Info → IP-Adresse"
    # zsh-sichere Prompt-Syntax (nicht read -p)
    printf "%s" "${BOLD}? Drucker-IP (z.B. 10.1.1.136): ${RESET}"
    read -r PRINTER_IP
  fi
fi

if [[ "$BACKEND" == "brother_ql" && -n "$PRINTER_IP" ]]; then
  ok "brother_ql-Config: model=$PRINTER_MODEL ip=$PRINTER_IP label=$LABEL_TYPE"
elif [[ "$BACKEND" == "brother_ql" && -z "$PRINTER_IP" && "$DRY_RUN" == "1" ]]; then
  warn "DRY_RUN ohne Drucker-IP — ok für Dev-Tests"
fi

# 4. plist rendern (Substitutionen — sed statt heredoc, damit Pfade mit Leerzeichen
#    sauber escaped werden können)
tmp_plist="$(mktemp)"
sed -e "s|__PYTHON_BIN__|$PYTHON_BIN|g" \
    -e "s|__BRIDGE_SCRIPT__|$INSTALL_DIR/vod_print_bridge.py|g" \
    -e "s|__BACKEND__|$BACKEND|g" \
    -e "s|__PRINTER_QUEUE__|$PRINTER_QUEUE|g" \
    -e "s|__PRINTER_IP__|$PRINTER_IP|g" \
    -e "s|__PRINTER_MODEL__|$PRINTER_MODEL|g" \
    -e "s|__LABEL_TYPE__|$LABEL_TYPE|g" \
    -e "s|__DRY_RUN__|$DRY_RUN|g" \
    -e "s|__LOG_PATH__|$LOG_PATH|g" \
    -e "s|__CERT_PATH__|$CERT_PATH|g" \
    -e "s|__KEY_PATH__|$KEY_PATH|g" \
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
ok "Backend: $BACKEND"
if [[ "$BACKEND" == "brother_ql" ]]; then
  ok "Drucker: $PRINTER_MODEL @ ${PRINTER_IP:-<DRY_RUN>}"
else
  ok "Drucker-Queue: $PRINTER_QUEUE"
fi
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

# 7. Health-Check — wartet bis zu 15s auf ersten Start.
#    Protokoll-Wahl: bei aktiviertem TLS https://, sonst http://. Probiert beides
#    für Robustheit (mkcert könnte mid-install fehlschlagen). -k skipt Cert-Check,
#    ist OK weil wir nur gegen localhost sprechen.
step "Health-Check (bis zu 15s)"
health=""
protocol=""
for i in $(seq 1 30); do
  for scheme in https http; do
    if response=$(curl -sk --max-time 1 "${scheme}://127.0.0.1:17891/health" 2>/dev/null); then
      if echo "$response" | grep -qE '"ok"[[:space:]]*:[[:space:]]*true'; then
        health="$response"
        protocol="$scheme"
        break 2
      fi
    fi
  done
  sleep 0.5
done
if [[ -n "$health" ]]; then
  ok "Bridge antwortet ($protocol): $health"
  if [[ "$protocol" != "https" ]]; then
    warn "Bridge läuft auf HTTP — Safari-Admin wird OFFLINE zeigen wegen Mixed-Content-Block."
    warn "Prüfe ob mkcert installiert ist: command -v mkcert"
    warn "Dann Script neu starten."
  fi
else
  err "Bridge antwortet weder auf https:// noch http://127.0.0.1:17891/health nach 15s"
  err "Logs: tail -f $LOG_PATH"
  err "Status: launchctl print ${domain}/${LABEL}"
  exit 1
fi

# 8. Summary
echo
ok "VOD Print Bridge läuft."
echo
echo "  Protokoll:    ${protocol}:// (nur 127.0.0.1)"
echo "  Port:         17891"
echo "  Drucker:      $PRINTER_QUEUE"
echo "  Script:       $INSTALL_DIR/vod_print_bridge.py"
echo "  LaunchAgent:  $PLIST_PATH"
echo "  Logs:         tail -f $LOG_PATH"
if [[ -n "$CERT_PATH" ]]; then
  echo "  Cert:         $CERT_PATH"
fi
echo
echo "Test-Druck (liest PDF von stdin):"
echo "  curl -sk -X POST ${protocol}://127.0.0.1:17891/print \\"
echo "    -H 'Content-Type: application/pdf' \\"
echo "    --data-binary @/pfad/zum/label.pdf"
echo
echo "Uninstall:"
echo "  bash $BRIDGE_DIR/install-bridge.sh --uninstall"
