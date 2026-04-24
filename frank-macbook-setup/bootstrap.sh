#!/usr/bin/env bash
# VOD Frank-MacBook — Bootstrap (One-Liner-Entry-Point)
#
# Einzeiler auf Franks Mac im Terminal ausführen:
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-macbook-setup/bootstrap.sh)"
#
# Was passiert:
#   1. Prüft Xcode Command-Line-Tools (liefert /usr/bin/git und /usr/bin/python3).
#      Falls nicht installiert: löst `xcode-select --install` Dialog aus + stoppt.
#   2. Cloned rseckler/VOD_Auctions nach ~/VOD_Auctions
#      (oder `git fetch && git reset --hard origin/main` falls schon da).
#   3. Prüft Homebrew — falls fehlt: klare Fehlermeldung mit Install-Befehl
#      (wir rufen brew-install NICHT automatisch auf: Homebrew-Installer öffnet
#      eigene sudo-Prompts, das gehört in ein separates User-Consent-Window.)
#   4. Startet frank-macbook-setup/install.sh (das 7-Schritt-Setup).
#
# Idempotent: bei Wiederholung wird das Repo per fetch+reset aktualisiert und
# install.sh macht seinen eigenen idempotent-check.
#
# Uninstall der Bridge: bash ~/VOD_Auctions/frank-macbook-setup/print-bridge/install-bridge.sh --uninstall

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

REPO_URL="${VOD_REPO_URL:-https://github.com/rseckler/VOD_Auctions.git}"
REPO_BRANCH="${VOD_REPO_BRANCH:-main}"
REPO_DIR="${VOD_REPO_DIR:-$HOME/VOD_Auctions}"
KIT_SUBDIR="frank-macbook-setup"

echo "${BOLD}VOD Frank-MacBook — Bootstrap${RESET}"
echo "Repo:   $REPO_URL (Branch $REPO_BRANCH)"
echo "Ziel:   $REPO_DIR"
echo

# ---------------------------------------------------------------------------
# 1. Xcode Command-Line-Tools (bringen /usr/bin/git und /usr/bin/python3 mit)
# ---------------------------------------------------------------------------
step "1/4  Xcode Command-Line-Tools"

if ! xcode-select -p >/dev/null 2>&1; then
  warn "Xcode Command-Line-Tools fehlen — öffne jetzt den Installations-Dialog."
  warn "Nach Fertigstellung diesen Einzeiler bitte nochmal ausführen."
  xcode-select --install 2>/dev/null || true
  err  "Abbruch — Installer-Dialog sollte offen sein. Nach Install erneut starten."
  exit 1
fi
ok "Command-Line-Tools: $(xcode-select -p)"

if ! command -v git >/dev/null 2>&1; then
  err "/usr/bin/git nicht auffindbar obwohl CLT installiert ist."
  err "Fix: xcode-select --install erneut ausführen, dann Terminal neu starten."
  exit 1
fi
ok "git: $(git --version)"

# ---------------------------------------------------------------------------
# 2. Repo clonen oder aktualisieren
# ---------------------------------------------------------------------------
step "2/4  Repo holen/aktualisieren"

if [[ -d "$REPO_DIR/.git" ]]; then
  echo "    Existierendes Repo in $REPO_DIR — update auf origin/$REPO_BRANCH..."
  # Frank könnte lokale Änderungen haben (z.B. Test-Files). fetch+reset ist
  # brutal aber eindeutig. Wenn jemand lokal arbeitet, soll er eh nicht den
  # Einzeiler auf seinem Dev-Clone schießen.
  git -C "$REPO_DIR" fetch --quiet origin "$REPO_BRANCH" || {
    err "git fetch fehlgeschlagen. Netzwerk/GitHub erreichbar?"
    exit 1
  }
  git -C "$REPO_DIR" checkout --quiet "$REPO_BRANCH" 2>/dev/null || true
  git -C "$REPO_DIR" reset --hard --quiet "origin/$REPO_BRANCH" || {
    err "git reset fehlgeschlagen."
    exit 1
  }
  ok "Repo aktualisiert auf $(git -C "$REPO_DIR" rev-parse --short HEAD)"
else
  if [[ -e "$REPO_DIR" ]]; then
    err "$REPO_DIR existiert, ist aber kein Git-Repo. Bitte manuell umbenennen/löschen."
    exit 1
  fi
  echo "    git clone $REPO_URL → $REPO_DIR ..."
  git clone --quiet --branch "$REPO_BRANCH" "$REPO_URL" "$REPO_DIR" || {
    err "git clone fehlgeschlagen."
    exit 1
  }
  ok "Repo geklont: $(git -C "$REPO_DIR" rev-parse --short HEAD)"
fi

KIT_DIR="$REPO_DIR/$KIT_SUBDIR"
if [[ ! -d "$KIT_DIR" ]]; then
  err "Kit-Verzeichnis fehlt: $KIT_DIR"
  err "Branch $REPO_BRANCH enthält kein '$KIT_SUBDIR/' — falscher Branch?"
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Homebrew vorhanden? (Wir installieren Homebrew nicht automatisch — das
#    hat eigene sudo-Prompts und sollte bewusst gestartet werden.)
# ---------------------------------------------------------------------------
step "3/4  Homebrew"

if ! command -v brew >/dev/null 2>&1; then
  err "Homebrew fehlt. Bitte zuerst installieren:"
  echo
  echo '    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  echo
  warn "Nach erfolgreicher Homebrew-Installation diesen Einzeiler erneut ausführen."
  exit 1
fi
ok "Homebrew: $(brew --version 2>/dev/null | head -1)"

# ---------------------------------------------------------------------------
# 4. install.sh starten
# ---------------------------------------------------------------------------
step "4/4  Setup-Script starten"

if [[ ! -f "$KIT_DIR/install.sh" ]]; then
  err "install.sh nicht gefunden unter $KIT_DIR/install.sh"
  exit 1
fi

echo "    → bash $KIT_DIR/install.sh"
echo
cd "$KIT_DIR"
exec bash "$KIT_DIR/install.sh"
